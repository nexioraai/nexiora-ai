import { canTransact } from '@/lib/commerce-admission/canTransact';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { randomUUID } from 'crypto';

// LOT J (Mode 3 global, F-CUSTOM-01/F-CUSTOM-04) :
//
// 1. SVG retire des types autorises -- un SVG peut embarquer un <script>
//    executable si l'URL publique est un jour ouverte directement (pas via
//    <img>, qui neutralise le scripting SVG dans tous les navigateurs
//    modernes, mais via une navigation directe ou un <object>/<embed> futur).
//    Aucun rendu direct de design_url n'existe aujourd'hui dans l'app (verifie
//    par recherche exhaustive), mais accepter un type de fichier capable
//    d'executer du code pour un usage qui n'en a jamais eu besoin (impression
//    d'image) est un risque sans contrepartie.
//
// 2. `slug` desormais obligatoire : lie chaque upload a un site reel des la
//    creation (design_uploads.site_id), condition necessaire pour que
//    checkout/route.ts puisse verifier l'appartenance tenant (site_id) avant
//    d'accepter un design a la commande -- cause racine de F-CUSTOM-01
//    (checkout faisait jusqu'ici confiance a l'URL du client sans aucune
//    verification d'origine, cf. design_uploads.sql).
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const slug = formData.get('slug');
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });
    if (typeof slug !== 'string' || !slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });

    // ============================================================
    // LOT 5 / P5-01 -- CETTE ROUTE REFUSAIT TOUT LE MONDE.
    //
    // La projection ne demandait que `id`, et la garde juste en dessous lit
    // `site.mode`. PostgREST ne renvoie QUE les colonnes demandees : `mode`
    // valait donc toujours `undefined`, et `canTransact` -- allowlist
    // POSITIVE, correcte -- rendait `false`. Resultat : 403 « Ce site est une
    // vitrine » pour un site Mode 3 parfaitement legitime, donc TOUTE la
    // chaine de design de `pod_custom` etait morte. Corrobore par la
    // production : `design_uploads` compte 0 ligne dans toute la base.
    //
    // LE TEST NE POUVAIT PAS LE VOIR : son harnais faisait `b.select = () => b`,
    // ignorait la liste de colonnes et rendait `{ id, mode: 2 }`. Un mock plus
    // permissif que le vrai systeme -- il est corrige avec ce lot.
    //
    // `canTransact` n'est PAS modifiee : l'autorite etait juste, c'est son
    // appelant qui ne lui donnait pas la donnee.
    // ============================================================
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id, mode')
      .eq('slug', slug)
      .is('archived_at', null)
      .maybeSingle();
    if (!site) return NextResponse.json({ error: 'Site introuvable' }, { status: 404 });

    // M1-5 — un design televerse n'existe que pour etre imprime sur un produit
    // vendu : c'est un artefact du parcours commercial, pas un media de
    // vitrine. Garde posee avant tout stockage et toute ecriture.
    if (!canTransact((site as { mode?: unknown }).mode)) {
      return NextResponse.json(
        { error: 'Ce site est une vitrine : il ne peut pas exercer d’activité commerciale.' },
        { status: 403 }
      );
    }

    const maxSize = 10 * 1024 * 1024; // 10 MB
    if (file.size > maxSize) return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });

    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type)) return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });

    const ext = file.name.split('.').pop() || 'png';
    const path = `${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error } = await supabaseAdmin.storage
      .from('custom-designs')
      .upload(path, buffer, { contentType: file.type, upsert: false });

    if (error) {
      console.error('Upload error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('custom-designs')
      .getPublicUrl(path);

    const { error: designError } = await supabaseAdmin.from('design_uploads').insert({
      site_id: site.id,
      storage_path: path,
      public_url: urlData.publicUrl,
      mime_type: file.type,
    });
    if (designError) {
      // Le fichier est deja dans le bucket mais sans reference tracee --
      // checkout/route.ts rejettera cette URL (aucune ligne design_uploads
      // correspondante), comportement sur, pas un faux-positif de securite.
      // Signale pour intervention (bucket contient un fichier orphelin).
      console.error('design_uploads insert error:', designError);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (e: any) {
    console.error('upload-design error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
