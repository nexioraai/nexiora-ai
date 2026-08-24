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

    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('id')
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
