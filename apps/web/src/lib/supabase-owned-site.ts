import { supabase } from '@/lib/supabase';

/**
 * Point d'entree UNIQUE pour lire/ecrire `sites` par `slug` depuis le
 * navigateur (client Supabase anon, PostgREST direct, sans route API
 * serveur intermediaire).
 *
 * Audit Mode 3/POD BRAND, perfectionnement (lot 2) -- cause racine : deux
 * composants distincts (`src/app/edit/[slug]/page.tsx`,
 * `src/components/Navbar.tsx`) reimplementaient chacun leur propre requete
 * `supabase.from('sites')...eq('slug', slug)` -- l'un avait deja ete corrige
 * pour filtrer par `owner_email`, l'autre (`Navbar.tsx`, "editeur de site
 * complet" monte sur la MEME route `/edit/[slug]`) ne l'avait jamais ete :
 * un utilisateur authentifie quelconque naviguant vers `/edit/{slug-d-un-tiers}`
 * pouvait lire ET reecrire l'intégralite du site d'un autre marchand (nom,
 * hero, about, testimonials, contact, reseaux sociaux...). Centraliser ici
 * la seule maniere correcte d'acceder a `sites` cote client rend ce bug
 * structurellement plus difficile a reintroduire par un futur composant qui
 * oublierait le filtre -- la protection reelle et non contournable reste la
 * policy RLS Postgres (non verifiable depuis cet environnement, voir
 * KNOWN_ISSUES.md), ce module est une defense en profondeur cote
 * application, alignee avec le patron deja utilise par CHAQUE route serveur
 * de ce projet (`requireSiteOwner`, `authSite()` dans shop/orders,
 * `owner_email` dans domains/*).
 */

/** Lit un site par slug, filtre par ownership au niveau de la requete elle-meme. */
export async function fetchOwnedSite<T = Record<string, unknown>>(
  slug: string,
  ownerEmail: string,
  columns = '*'
): Promise<T | null> {
  const { data } = await supabase
    .from('sites')
    .select(columns)
    .eq('slug', slug)
    .eq('owner_email', ownerEmail)
    .maybeSingle();
  return (data as T | null) ?? null;
}

// Audit Mode 3 global (CRIT-1) -- ce point d'ecriture generique (patch:
// Record<string, unknown>, appele avec des objets construits dynamiquement
// par Navbar.tsx/edit/[slug]/page.tsx) n'avait aucune liste d'exclusion :
// rien n'empechait STRUCTURELLEMENT un appel direct au client Supabase
// (deja charge dans la page /edit, accessible depuis les devtools par tout
// proprietaire authentifie de N'IMPORTE QUEL site) de patcher dropship_type
// -- contournant isValidDropshipType() (n'existe que dans chat/route.ts, au
// moment de la creation) et invalidant l'hypothese "dropship_type est
// immuable apres creation" sur laquelle reposent checkout/route.ts,
// pod-fulfill.ts et generate-mockups/route.ts. Meme raisonnement applique a
// mode (jamais repatche par le code applicatif actuel, meme statut
// qu'immuable) et aux colonnes deja identifiees comme sensibles ailleurs
// dans ce projet (owner_id/owner_email/payment_account_id/
// stripe_customer_id, deja exclues en LECTURE par sites_public_view.sql --
// jamais protegees en ECRITURE cote client avant ce correctif).
//
// Cette liste est une denylist (pas une allowlist complete) : `patch` reste
// un objet dynamique legitimement large (theme, contact, hero, testimonials,
// social_links, pod_designs...), reconstruire une allowlist exhaustive ici
// serait une refonte disproportionnee par rapport au risque reellement
// demontre. La VRAIE garantie non contournable est le GRANT UPDATE
// (colonnes) applique cote DB, sur une table dont le UPDATE table-level a
// ete entierement retire pour anon/authenticated (voir audit LOT G associe).
//
// CORRECTIF URGENT (finalisation LOT G) : cette liste ne comportait que 6
// champs alors que le GRANT DB deja execute en exclut 18 (les 6 initiaux +
// id/slug/created_at + archived_at/payment_provider/subscription_status +
// custom_domain et ses 5 colonnes google_*). Navbar.tsx:73 fait
// `updates = {...site}` -- un round-trip INTEGRAL des 59 colonnes de
// `sites` (fetchOwnedSite columns='*' par defaut) -- donc TOUTE colonne
// presente dans ce spread mais absente a la fois de cette denylist ET du
// GRANT DB fait echouer l'UPDATE ENTIER (Postgres rejette la commande
// complete des qu'une seule colonne du SET manque de privilege, meme si sa
// valeur est inchangee). Sans cette extension, la sauvegarde Navbar.tsx est
// cassee des l'execution du GRANT DB restreint -- ce n'est pas une
// amelioration d'hygiene, c'est un correctif de regression fonctionnelle
// immediate.
const SITE_FORBIDDEN_CLIENT_FIELDS = [
  // Sous-mode / identite / financier -- CRIT-1 original.
  'dropship_type',
  'mode',
  'owner_id',
  'owner_email',
  'payment_account_id',
  'stripe_customer_id',
  // Identite/horodatage -- jamais destines a etre reecrits par un client,
  // presents dans le round-trip Navbar uniquement par effet de bord du spread.
  'id',
  'slug',
  'created_at',
  // Archivage -- une RPC dediee (archive_sites_if_no_blocking_orders) verifie
  // deja les commandes bloquantes ; ecrire cette colonne directement la
  // contournerait entierement.
  'archived_at',
  // Paiement -- meme famille de risque que payment_account_id.
  'payment_provider',
  // Entitlement/abonnement -- auto-elevation potentielle, meme famille que
  // dropship_type.
  'subscription_status',
  // Domaine personnalise -- un flux dedie et deja valide existe
  // (/api/domains/*, contrainte UNIQUE deja prouvee en production) ; ce
  // chemin generique le contournerait.
  'custom_domain',
  'custom_domain_google_attempts',
  'custom_domain_google_last_attempt_at',
  'custom_domain_google_last_error',
  'custom_domain_google_status',
  'custom_domain_google_token',
] as const;

/**
 * Ecrit un site par slug, filtre par ownership au niveau de la requete
 * elle-meme -- sans filtre correspondant a AUCUNE ligne (proprietaire
 * different, site inexistant), l'ecriture n'affecte silencieusement rien.
 * Les champs sensibles/financiers (voir SITE_FORBIDDEN_CLIENT_FIELDS) sont
 * systematiquement retires du patch avant l'ecriture, quel que soit
 * l'appelant.
 */
export async function updateOwnedSite(
  slug: string,
  ownerEmail: string,
  patch: Record<string, unknown>
) {
  const safePatch = { ...patch };
  for (const field of SITE_FORBIDDEN_CLIENT_FIELDS) delete safePatch[field];
  return supabase.from('sites').update(safePatch).eq('slug', slug).eq('owner_email', ownerEmail);
}
