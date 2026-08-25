import { NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';

// ============================================================
// LOT 6 -- L'ADMINISTRATION DU CONTENU CENTRAL DERIBFY.
//
// CE N'EST PAS UNE AUTORITE NOUVELLE. Le controle existe deja, mot pour mot,
// dans CINQ routes : `admin/stats`, `admin/ai-usage`, `admin/cron-runs`,
// `admin/system-health` et `admin/site-archive-override` -- dont le
// commentaire le nomme lui-meme « meme pattern d'autorisation admin que
// ai-usage/cron-runs/system-health/stats ». Ce module lui donne un NOM et un
// FOYER, a cote de ses deux freres `requireSiteOwner` et
// `requireProductOwner` : la convention `require-*` du dossier existait deja,
// il manquait la troisieme identite.
//
// TROIS IDENTITES, TROIS PRIMITIVES, ET ELLES NE SE CONFONDENT PAS :
//   `requireSiteOwner`     -- ce compte possede-t-il CE site ?
//   `requireProductOwner`  -- ce compte possede-t-il CE produit ?
//   `requirePlatformAdmin` -- ce compte administre-t-il DERIBFY ?
//
// La troisieme ne prend NI slug NI id : le contenu central Deribfy
// (`blog_posts`, `/blog`) n'appartient a aucun site -- sa table ne porte
// aucune colonne de locataire (verifie : id, title, slug, content,
// cover_image, published, created_at). `requireSiteOwner` y serait donc non
// seulement inadapte mais impossible.
//
// PERIMETRE DE CETTE PASSE, ASSUME. Les cinq routes admin conservent pour
// l'instant leur copie du controle : les migrer est une correction distincte,
// consignee. Ce module porte desormais LA liste de reference -- et la
// duplication restante est documentee, pas ignoree.
// ============================================================

/**
 * Les comptes autorises a administrer la plateforme.
 *
 * Valeur identique aux cinq copies existantes. Allowlist positive : un compte
 * absent n'obtient rien, et l'y inscrire est une decision d'une ligne, visible
 * en diff.
 */
const ADMIN_EMAILS = ['issayamiyoussouf@gmail.com'];

type AdminCheck =
  | { ok: true; email: string }
  | { ok: false; response: NextResponse };

/**
 * Le porteur de ce jeton administre-t-il Deribfy ?
 *
 * Meme contrat de retour que `requireSiteOwner` : soit l'identite, soit la
 * reponse d'erreur a renvoyer telle quelle.
 *
 * FAIL-CLOSED A CHAQUE ETAPE : en-tete absente, jeton invalide, compte sans
 * courriel, courriel hors allowlist -- chacun rend un refus, aucun ne laisse
 * passer par defaut.
 *
 * 401 vs 403, DELIBEREMENT DISTINCTS : « je ne sais pas qui tu es » n'est pas
 * « je sais qui tu es et ce n'est pas toi ». Meme distinction que
 * `requireSiteOwner`.
 */
export async function requirePlatformAdmin(req: Request): Promise<AdminCheck> {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: 'Non authentifie.' }, { status: 401 }) };
  }
  const { data, error } = await supabaseAnon.auth.getUser(token);
  const email = data?.user?.email;
  if (error || !email) {
    return { ok: false, response: NextResponse.json({ error: 'Non authentifie.' }, { status: 401 }) };
  }
  if (!ADMIN_EMAILS.includes(email)) {
    return { ok: false, response: NextResponse.json({ error: 'Acces refuse.' }, { status: 403 }) };
  }
  return { ok: true, email };
}
