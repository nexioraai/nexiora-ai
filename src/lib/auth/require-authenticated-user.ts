import { NextResponse } from 'next/server';
import { supabase as supabaseAnon } from '@/lib/supabase';

// ============================================================
// LOT 6 -- LA QUATRIEME IDENTITE, ET LA PLUS ELEMENTAIRE.
//
// Le dossier portait deja trois primitives `require-*`, chacune repondant a
// UNE question et une seule :
//   `requireSiteOwner`     -- ce compte possede-t-il CE site ?
//   `requireProductOwner`  -- ce compte possede-t-il CE produit ?
//   `requirePlatformAdmin` -- ce compte administre-t-il DERIBFY ?
//
// Il manquait la question qui precede les trois autres : « qui appelle ? ».
// Rien de nouveau n'est invente ici -- l'extraction du jeton et la resolution
// par `auth.getUser` sont MOT POUR MOT celles de `require-site-owner.ts`
// (lignes 48-55) et de `require-platform-admin.ts`. Ce module leur donne un
// foyer pour les surfaces qui n'ont ni site ni produit a verifier.
//
// POURQUOI L'IDENTITE, ET PAS SEULEMENT UNE LIMITE DE DEBIT. `/api/welcome`
// envoyait un e-mail Deribfy a une adresse FOURNIE DANS LE CORPS DE LA
// REQUETE, sans aucune authentification. Une limite de debit seule aurait
// borne le volume sans rien changer au fond : un tiers pouvait toujours
// designer sa victime et lui faire parvenir un courrier signe Deribfy. La
// correction juste supprime l'entree, pas seulement son debit -- le
// destinataire est desormais DERIVE DU JETON, donc necessairement le
// proprietaire du compte appelant. On ne peut plus viser personne.
// ============================================================

export type UtilisateurAuthentifie =
  | { ok: true; userId: string; email: string }
  | { ok: false; response: NextResponse };

export async function requireAuthenticatedUser(req: Request): Promise<UtilisateurAuthentifie> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: 'Non authentifie.' }, { status: 401 }) };
  }

  const { data, error } = await supabaseAnon.auth.getUser(token);
  const user = data?.user;
  // L'ADRESSE EST UNE CONDITION, PAS UN CONFORT. Un compte sans e-mail
  // (OAuth sans adresse, compte anonyme) n'a rien a qui envoyer : le refuser
  // ici evite que l'appelant ait la tentation d'en fournir une.
  if (error || !user?.id || !user.email) {
    return { ok: false, response: NextResponse.json({ error: 'Non authentifie.' }, { status: 401 }) };
  }

  return { ok: true, userId: user.id, email: user.email };
}
