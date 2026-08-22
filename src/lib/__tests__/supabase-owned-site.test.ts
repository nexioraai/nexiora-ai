import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Audit Mode 3/POD BRAND, perfectionnement (lot 2) -- point d'entree
// central desormais utilise par edit/[slug]/page.tsx ET Navbar.tsx pour
// toute lecture/ecriture directe de `sites` depuis le navigateur. Avant ce
// lot, Navbar.tsx (editeur de site complet monte sur /edit/[slug]) n'avait
// AUCUN filtre d'ownership -- un utilisateur authentifie quelconque
// naviguant vers /edit/{slug-d-un-tiers} pouvait lire ET reecrire
// integralement le site d'un autre marchand. Ce test verrouille la
// propriete de securite au niveau le plus bas et le plus fiable possible :
// la requete PostgREST elle-meme doit TOUJOURS porter les deux filtres
// (slug ET owner_email), jamais un seul.
// ============================================================

const selectMock = vi.fn();
const eqMock = vi.fn();
const maybeSingleMock = vi.fn();
const updateMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...a) },
}));

import { fetchOwnedSite, updateOwnedSite } from '../supabase-owned-site';

beforeEach(() => {
  selectMock.mockReset();
  eqMock.mockReset();
  maybeSingleMock.mockReset();
  updateMock.mockReset();
  fromMock.mockReset();

  // Chaque builder enregistre ses propres appels .eq() successifs --
  // reproduit fidelement `.eq('slug', ...).eq('owner_email', ...)`.
  const makeChain = () => {
    const eqCalls: [string, unknown][] = [];
    const chain: any = {};
    chain.eq = (col: string, val: unknown) => { eqCalls.push([col, val]); return chain; };
    chain.select = (...a: unknown[]) => { selectMock(...a); return chain; };
    chain.update = (...a: unknown[]) => { updateMock(...a); return chain; };
    chain.maybeSingle = async () => { maybeSingleMock(eqCalls); return { data: { id: 'site-1' }, error: null }; };
    chain.then = (resolve: any) => { eqMock(eqCalls); resolve({ data: null, error: null }); };
    return chain;
  };
  fromMock.mockImplementation(() => makeChain());
});

describe('fetchOwnedSite', () => {
  it('filtre TOUJOURS par slug ET owner_email dans la même requête (jamais un seul des deux)', async () => {
    await fetchOwnedSite('boutique-victime', 'owner@test.com');
    expect(fromMock).toHaveBeenCalledWith('sites');
    expect(maybeSingleMock).toHaveBeenCalledWith([
      ['slug', 'boutique-victime'],
      ['owner_email', 'owner@test.com'],
    ]);
  });

  it("un owner_email différent produit une requête différente (pas de contournement via un slug seul)", async () => {
    await fetchOwnedSite('boutique-victime', 'attaquant@test.com');
    const [eqCalls] = maybeSingleMock.mock.calls[0];
    expect(eqCalls).toContainEqual(['owner_email', 'attaquant@test.com']);
    expect(eqCalls).not.toContainEqual(['owner_email', undefined]);
  });
});

describe('updateOwnedSite', () => {
  it('filtre TOUJOURS par slug ET owner_email sur l\'UPDATE (jamais un UPDATE sans ownership)', async () => {
    await updateOwnedSite('boutique-victime', 'owner@test.com', { name: 'Nouveau nom' });
    expect(updateMock).toHaveBeenCalledWith({ name: 'Nouveau nom' });
    expect(eqMock).toHaveBeenCalledWith([
      ['slug', 'boutique-victime'],
      ['owner_email', 'owner@test.com'],
    ]);
  });

  // Audit Mode 3 global (CRIT-1, finalisation LOT G) -- meme un proprietaire
  // authentifie de SON PROPRE site ne doit jamais pouvoir patcher ces 18
  // colonnes via ce point d'entree generique -- alignees exactement sur les
  // colonnes exclues du GRANT UPDATE DB (information_schema.column_privileges,
  // verifie en production). Liste volontairement identique a la DB : un
  // desalignement entre les deux casserait soit la securite (app plus
  // permissive que la DB) soit une fonctionnalite legitime (app plus
  // stricte que necessaire) -- voir le test de round-trip Navbar plus bas.
  it.each([
    'dropship_type', 'mode', 'owner_id', 'owner_email', 'payment_account_id', 'stripe_customer_id',
    'id', 'slug', 'created_at', 'archived_at', 'payment_provider', 'subscription_status',
    'custom_domain', 'custom_domain_google_attempts', 'custom_domain_google_last_attempt_at',
    'custom_domain_google_last_error', 'custom_domain_google_status', 'custom_domain_google_token',
  ])('retire silencieusement %s du patch, même si un appelant tente de le passer', async (field) => {
    await updateOwnedSite('mon-site', 'owner@test.com', { name: 'Nom légitime', [field]: 'valeur-forgée' });
    const patchSent = updateMock.mock.calls[0][0];
    expect(patchSent).not.toHaveProperty(field);
    expect(patchSent).toEqual({ name: 'Nom légitime' });
  });

  it('un patch ne contenant QUE des champs interdits aboutit à un UPDATE vide (aucun champ légitime perdu par erreur)', async () => {
    await updateOwnedSite('mon-site', 'owner@test.com', { dropship_type: 'pod_brand' });
    expect(updateMock).toHaveBeenCalledWith({});
  });

  // Reproduit exactement Navbar.tsx:73 (`updates = {...site}`, round-trip
  // integral des 59 colonnes de `sites`) -- preuve que le patch final envoye
  // a PostgREST ne contient plus AUCUNE des 18 colonnes exclues du GRANT DB,
  // ce qui aurait fait echouer l'UPDATE entier une fois le GRANT restreint
  // execute en production (une seule colonne sans privilege rejette toute
  // la commande, valeur inchangee ou non).
  it('round-trip complet Navbar.tsx ({...site}) -- aucune des 18 colonnes protégées DB ne survit, les 41 légitimes passent', async () => {
    const fullSiteRoundTrip = {
      // 18 colonnes protegees (valeurs inchangees, round-trip normal)
      dropship_type: 'pod_brand', mode: 3, owner_id: 'owner-id', owner_email: 'owner@test.com',
      payment_account_id: 'acct_x', stripe_customer_id: 'cus_x', id: 'site-1', slug: 'mon-site',
      created_at: '2026-01-01', archived_at: null, payment_provider: 'stripe', subscription_status: 'active',
      custom_domain: null, custom_domain_google_attempts: 0, custom_domain_google_last_attempt_at: null,
      custom_domain_google_last_error: null, custom_domain_google_status: null, custom_domain_google_token: null,
      // Un échantillon de colonnes légitimes (round-trip attendu)
      name: 'Ma Boutique', theme: 'noir', pod_designs: [],
    };
    await updateOwnedSite('mon-site', 'owner@test.com', fullSiteRoundTrip);
    const patchSent = updateMock.mock.calls[0][0];
    for (const forbidden of [
      'dropship_type', 'mode', 'owner_id', 'owner_email', 'payment_account_id', 'stripe_customer_id',
      'id', 'slug', 'created_at', 'archived_at', 'payment_provider', 'subscription_status',
      'custom_domain', 'custom_domain_google_attempts', 'custom_domain_google_last_attempt_at',
      'custom_domain_google_last_error', 'custom_domain_google_status', 'custom_domain_google_token',
    ]) {
      expect(patchSent).not.toHaveProperty(forbidden);
    }
    expect(patchSent).toEqual({ name: 'Ma Boutique', theme: 'noir', pod_designs: [] });
  });

  it('les champs légitimes (theme, pod_designs, contact...) restent intacts', async () => {
    const patch = { theme: 'noir', pod_designs: [{ url: 'x' }], contact: { email: 'a@b.com' } };
    await updateOwnedSite('mon-site', 'owner@test.com', patch);
    expect(updateMock).toHaveBeenCalledWith(patch);
  });
});
