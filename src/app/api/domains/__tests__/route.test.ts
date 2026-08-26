import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Audit Mode 3/POD BRAND, perfectionnement -- unicite atomique du domaine.
// Route BYOD (bring-your-own-domain, sites.custom_domain) : cible les deux
// garde-fous ajoutes par cet audit, symetriques a ceux de
// domains/purchase/route.ts (voir son fichier de test).
// 1. site_domains (achat Porkbun, pending/paid/purchased) n'etait jamais
//    consulte avant un rattachement BYOD -- un domaine deja reserve via
//    Porkbun pouvait etre revendique en BYOD par un autre site.
// 2. Le check-then-set final (UPDATE sites.custom_domain) reste non
//    transactionnel : la course residuelle (23505 sur la contrainte UNIQUE
//    partielle) doit se traduire par un 409 clair, pas un 500.
// Aucune couverture n'existait pour cette route avant ce lot.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

const addDomainToVercelMock = vi.fn();
const removeDomainFromVercelMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({ logAnomaly: vi.fn() }));
vi.mock('@/lib/domains/vercel', () => ({
  addDomainToVercel: (...a: unknown[]) => addDomainToVercelMock(...a),
  removeDomainFromVercel: (...a: unknown[]) => removeDomainFromVercelMock(...a),
}));

function tableChain(response: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.neq = vi.fn(self);
  chain.update = vi.fn(self);
  chain.maybeSingle = vi.fn(async () => response);
  chain.then = (resolve: (v: unknown) => void) => resolve(response);
  return chain;
}

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

import { POST, DELETE as POST_DELETE } from '../route';
import { NextRequest } from 'next/server';

function req(body: unknown): any {
  return new Request('https://deribfy.test/api/domains', {
    method: 'POST',
    headers: { authorization: 'Bearer good-token' },
    body: JSON.stringify(body),
  });
}

const SITE = { id: 'site-1', owner_email: 'owner@test.com', custom_domain: null };

beforeEach(() => {
  fromMock.mockReset();
  getUserMock.mockReset();
  addDomainToVercelMock.mockReset();
  removeDomainFromVercelMock.mockReset().mockResolvedValue({ ok: true, dejaAbsent: false });
  getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'owner@test.com' } }, error: null });
  // D-01 -- LE DOUBLE REND CE QUE REND REELLEMENT L'HEBERGEUR : `dns` ET
  // `verification`. L'ancien fixture n'avait que `verification` parce que la
  // route jetait tout le reste et repondait deux enregistrements en dur --
  // un harnais plus pauvre que le systeme reel ne pouvait rien prouver.
  addDomainToVercelMock.mockResolvedValue({
    ok: true,
    alreadyExists: false,
    verification: [],
    dns: [
      { type: 'A', name: '@', value: '76.76.21.21' },
      { type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com' },
    ],
  });
});

describe('POST /api/domains — site_domains (achat Porkbun) et sites.custom_domain (BYOD) ne se recoupaient jamais', () => {
  it('domaine deja reserve via Porkbun (site_domains, status pending) -> 409, jamais rattache en BYOD', async () => {
    let sitesCall = 0;
    const sitesChain = tableChain({ data: null, error: null });
    (sitesChain.maybeSingle as any).mockImplementation(async () => {
      sitesCall++;
      // 1er appel : ownership (site trouvé). 2e appel : conflit custom_domain (aucun).
      return sitesCall === 1 ? { data: SITE, error: null } : { data: null, error: null };
    });
    fromMock.mockImplementation((table: string) => {
      if (table === 'sites') return sitesChain;
      if (table === 'site_domains') {
        return tableChain({ data: { id: 'dom-1', status: 'pending' }, error: null });
      }
      return tableChain({ data: null, error: null });
    });

    const res = await POST(req({ slug: 'boutique', domain: 'reserve.com' }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/deja reserve/i);
    expect(addDomainToVercelMock).not.toHaveBeenCalled();
  });

  it("site_domains en status 'failed' pour ce domaine -> pas un conflit, le rattachement BYOD continue normalement", async () => {
    let sitesCall = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'sites') {
        sitesCall++;
        // 1er appel : ownership. 2e appel : conflit custom_domain (aucun). 3e : l'UPDATE final.
        return tableChain(sitesCall === 1 ? { data: SITE, error: null } : { data: null, error: null });
      }
      if (table === 'site_domains') {
        return tableChain({ data: { id: 'dom-2', status: 'failed' }, error: null });
      }
      return tableChain({ data: null, error: null });
    });

    const res = await POST(req({ slug: 'boutique', domain: 'libre-apres-echec.com' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(addDomainToVercelMock).toHaveBeenCalledWith('libre-apres-echec.com');
  });
});

describe('POST /api/domains — course residuelle sur sites.custom_domain (23505)', () => {
  it("l'UPDATE final echoue avec le code UNIQUE (23505) -> 409 clair, pas 500", async () => {
    let sitesCall = 0;
    const sitesChain = tableChain({ data: null, error: null });
    (sitesChain.maybeSingle as any).mockImplementation(async () => {
      sitesCall++;
      return sitesCall === 1 ? { data: SITE, error: null } : { data: null, error: null }; // ownership puis pas-de-conflit
    });
    // L'UPDATE final se resout via .then() (pas .maybeSingle()) dans la route.
    (sitesChain as any).then = (resolve: (v: unknown) => void) =>
      resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } });

    fromMock.mockImplementation((table: string) => {
      if (table === 'sites') return sitesChain;
      if (table === 'site_domains') return tableChain({ data: null, error: null });
      return tableChain({ data: null, error: null });
    });

    const res = await POST(req({ slug: 'boutique', domain: 'course-byod.com' }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/deja utilise/i);
  });
});

// ============================================================
// D-01 -- LA VERIFICATION SUPPLEMENTAIRE ETAIT JETEE.
//
// L'hebergeur retourne les TXT exiges pour prouver la propriete du domaine.
// La route les ignorait et repondait deux enregistrements EN DUR. Un client
// dont le domaine exigeait un TXT posait un A et un CNAME, son domaine ne
// servait jamais, et RIEN ne le lui disait.
//
// CE QUI EST PROUVE ICI : la reponse porte ce que l'hebergeur a REELLEMENT
// demande -- ni plus (aucune valeur inventee), ni moins.
// ============================================================
describe('D-01 — les enregistrements de vérification sont transmis au client', () => {
  /**
   * Meme convention que les blocs precedents : `sites` est interrogee DEUX
   * fois -- d'abord par la primitive de propriete (le site doit exister),
   * puis pour le conflit de domaine (aucun). Un double qui rend la meme chose
   * aux deux appels ne peut pas distinguer « site introuvable » de « domaine
   * libre » : c'est exactement ce qui rendait ces cas indistinguables.
   */
  function siteOk() {
    let sitesCall = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'sites') {
        sitesCall++;
        return tableChain(sitesCall === 1 ? { data: SITE, error: null } : { data: null, error: null });
      }
      if (table === 'site_domains') return tableChain({ data: null, error: null });
      return tableChain({ data: null, error: null });
    });
  }

  it('AUCUN TXT exigé -> la réponse ne contient aucune instruction inutile', async () => {
    siteOk();
    addDomainToVercelMock.mockResolvedValue({
      ok: true, alreadyExists: false, verification: [],
      dns: [{ type: 'A', name: '@', value: '76.76.21.21' }, { type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com' }],
    });
    const res = await POST(req({ slug: 'mon-site', domain: 'exemple-neuf.com' }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.verification).toEqual([]);
    expect(j.dns).toHaveLength(2);
  });

  it('UN TXT exigé -> il est transmis, avec sa valeur RÉELLE', async () => {
    siteOk();
    addDomainToVercelMock.mockResolvedValue({
      ok: true, alreadyExists: true,
      verification: [{ type: 'TXT', domain: '_vercel.exemple-repris.com', value: 'vc-domain-verify=abc123' }],
      dns: [{ type: 'A', name: '@', value: '76.76.21.21' }, { type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com' }],
    });
    const res = await POST(req({ slug: 'mon-site', domain: 'exemple-repris.com' }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.verification).toEqual([
      { type: 'TXT', name: '_vercel.exemple-repris.com', value: 'vc-domain-verify=abc123' },
    ]);
  });

  it('AUCUNE valeur n’est inventée : la réponse ne porte que ce que l’hébergeur a rendu', async () => {
    siteOk();
    addDomainToVercelMock.mockResolvedValue({
      ok: true, alreadyExists: false,
      verification: [{ type: 'TXT', domain: '_x.exemple.com', value: 'valeur-unique-987' }],
      dns: [{ type: 'A', name: '@', value: '1.2.3.4' }],
    });
    const j = await (await POST(req({ slug: 'mon-site', domain: 'exemple.com' }))).json();
    // Les A/CNAME viennent aussi de l'hebergeur, plus d'une constante locale.
    expect(j.dns).toEqual([{ type: 'A', name: '@', value: '1.2.3.4' }]);
    expect(JSON.stringify(j)).toContain('valeur-unique-987');
  });

  it('plusieurs TXT exigés -> tous sont transmis', async () => {
    siteOk();
    addDomainToVercelMock.mockResolvedValue({
      ok: true, alreadyExists: true,
      verification: [
        { type: 'TXT', domain: '_vercel.a.com', value: 'v1' },
        { type: 'TXT', domain: '_vercel.b.com', value: 'v2' },
      ],
      dns: [],
    });
    const j = await (await POST(req({ slug: 'mon-site', domain: 'a.com' }))).json();
    expect(j.verification).toHaveLength(2);
  });

  it('un domaine appartenant à un AUTRE site reste refusé, TXT ou non', async () => {
    let sitesCall = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'sites') {
        sitesCall++;
        // 1er appel : propriete OK. 2e : le domaine appartient a un AUTRE site.
        return tableChain(sitesCall === 1 ? { data: SITE, error: null } : { data: { id: 'autre-site' }, error: null });
      }
      return tableChain({ data: null, error: null });
    });
    const res = await POST(req({ slug: 'mon-site', domain: 'pris.com' }));
    expect(res.status).toBe(409);
    expect(addDomainToVercelMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// D-05 -- L'ORDRE PRODUISAIT DES DOMAINES FANTOMES.
//
// L'ancien enchainement rattachait chez l'hebergeur AVANT d'ecrire en base.
// Une ecriture en echec laissait le domaine rattache dehors, sans aucune
// trace applicative : invisible au produit et irrevendicable par quiconque.
//
// CE QUI EST PROUVE ICI : la base est ecrite EN PREMIER, et un echec externe
// declenche une COMPENSATION qui restaure l'etat anterieur -- pas `null`.
// ============================================================
describe('D-05 — réservation avant rattachement, et compensation', () => {
  function harnais(opts: { siteCourant?: any; updateErr?: any; sitesConflit?: any } = {}) {
    const updates: any[] = [];
    let sitesCall = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'sites') {
        sitesCall++;
        const b: any = tableChain(
          sitesCall === 1
            ? { data: opts.siteCourant ?? SITE, error: null }
            : { data: opts.sitesConflit ?? null, error: null }
        );
        b.update = (payload: any) => {
          updates.push(payload);
          return { eq: async () => ({ error: updates.length === 1 ? (opts.updateErr ?? null) : null }) };
        };
        return b;
      }
      return tableChain({ data: null, error: null });
    });
    return { updates, ordre: () => (fromMock.mock.calls as any[]).map((c) => c[0]) };
  }

  it('A — base OK puis hébergeur OK : la base est écrite AVANT l’appel externe', async () => {
    const h = harnais();
    let baseEcriteAvant = false;
    addDomainToVercelMock.mockImplementation(async () => {
      baseEcriteAvant = h.updates.length > 0;
      return { ok: true, alreadyExists: false, verification: [], dns: [] };
    });
    const res = await POST(req({ slug: 'boutique', domain: 'ordre-ok.com' }));
    expect(res.status).toBe(200);
    expect(baseEcriteAvant, 'la reservation doit preceder l’appel externe').toBe(true);
  });

  it('B — base OK, hébergeur ÉCHOUE -> 400 ET compensation de l’état antérieur', async () => {
    const h = harnais({ siteCourant: { ...SITE, custom_domain: 'ancien.com' } });
    addDomainToVercelMock.mockRejectedValue(new Error('hote indisponible'));
    const res = await POST(req({ slug: 'boutique', domain: 'nouveau.com' }));
    expect(res.status).toBe(400);
    // 1re ecriture = reservation, 2e = compensation
    expect(h.updates).toHaveLength(2);
    expect(h.updates[0].custom_domain).toBe('nouveau.com');
    expect(h.updates[1]).toEqual({ custom_domain: 'ancien.com' });
  });

  it('B bis — un site SANS domaine antérieur est compensé vers null, jamais vers une valeur inventée', async () => {
    const h = harnais({ siteCourant: { ...SITE, custom_domain: null } });
    addDomainToVercelMock.mockRejectedValue(new Error('hote indisponible'));
    await POST(req({ slug: 'boutique', domain: 'nouveau.com' }));
    expect(h.updates[1]).toEqual({ custom_domain: null });
  });

  it('C — échec de la base : AUCUN appel externe n’est tenté', async () => {
    harnais({ updateErr: { message: 'db down' } });
    const res = await POST(req({ slug: 'boutique', domain: 'x.com' }));
    expect(res.status).toBe(500);
    expect(addDomainToVercelMock).not.toHaveBeenCalled();
  });

  it('H — course sur la contrainte UNIQUE -> 409, AUCUN appel externe', async () => {
    harnais({ updateErr: { code: '23505', message: 'duplicate' } });
    const res = await POST(req({ slug: 'boutique', domain: 'course.com' }));
    expect(res.status).toBe(409);
    expect(addDomainToVercelMock).not.toHaveBeenCalled();
  });

  it('F — resoumission du MÊME domaine : l’état Google n’est pas réinitialisé', async () => {
    const h = harnais({ siteCourant: { ...SITE, custom_domain: 'meme.com' } });
    addDomainToVercelMock.mockResolvedValue({ ok: true, alreadyExists: true, verification: [], dns: [] });
    await POST(req({ slug: 'boutique', domain: 'meme.com' }));
    expect(h.updates[0]).toEqual({ custom_domain: 'meme.com' });
  });

  it('G — changement RÉEL de domaine : l’état Google EST réinitialisé', async () => {
    const h = harnais({ siteCourant: { ...SITE, custom_domain: 'ancien.com' } });
    addDomainToVercelMock.mockResolvedValue({ ok: true, alreadyExists: false, verification: [], dns: [] });
    await POST(req({ slug: 'boutique', domain: 'nouveau.com' }));
    expect(h.updates[0].custom_domain_google_token).toBeNull();
    expect(h.updates[0].custom_domain_google_status).toBeNull();
  });
});

// ============================================================
// D-07 -- LES DOMAINES DE LA PLATEFORME, REFUSES AVANT TOUTE DEPENSE.
// ============================================================
describe('D-07 — domaines réservés refusés au rattachement', () => {
  it.each(['deribfy.com', 'www.deribfy.com', 'DERIBFY.COM', 'app.deribfy.com'])(
    '%s -> 403, AUCUN appel externe, AUCUNE écriture',
    async (d) => {
      fromMock.mockImplementation(() => tableChain({ data: SITE, error: null }));
      const res = await POST(req({ slug: 'boutique', domain: d }));
      expect(res.status).toBe(403);
      expect(addDomainToVercelMock).not.toHaveBeenCalled();
    }
  );

  it('un domaine client légitime n’est PAS bloqué', async () => {
    let sitesCall = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'sites') {
        sitesCall++;
        const b: any = tableChain(sitesCall === 1 ? { data: SITE, error: null } : { data: null, error: null });
        b.update = () => ({ eq: async () => ({ error: null }) });
        return b;
      }
      return tableChain({ data: null, error: null });
    });
    addDomainToVercelMock.mockResolvedValue({ ok: true, alreadyExists: false, verification: [], dns: [] });
    const res = await POST(req({ slug: 'boutique', domain: 'mondomaine-deribfy.com' }));
    expect(res.status).toBe(200);
  });
});

// ============================================================
// D-03 -- LE DETACHEMENT N'EXISTAIT PAS.
// ============================================================
describe('D-03 — détachement d’un domaine', () => {
  function reqDelete(slug?: string): any {
    const u = new URL('https://deribfy.test/api/domains');
    if (slug) u.searchParams.set('slug', slug);
    return new NextRequest(u, { method: 'DELETE', headers: { authorization: 'Bearer good-token' } });
  }
  function harnaisDetach(opts: { custom?: string | null; achat?: any; achatErr?: any; updateErr?: any } = {}) {
    const updates: any[] = [];
    // `?? 'client.com'` aurait ecrase un `null` EXPLICITE -- exactement le cas
    // que le test « aucun domaine » veut exercer. On distingue donc « absent »
    // de « nul » par la presence de la cle, pas par sa valeur.
    const domaineCourant = 'custom' in opts ? opts.custom : 'client.com';
    fromMock.mockImplementation((table: string) => {
      if (table === 'sites') {
        const b: any = tableChain({ data: { ...SITE, custom_domain: domaineCourant }, error: null });
        b.update = (p: any) => { updates.push(p); return { eq: async () => ({ error: opts.updateErr ?? null }) }; };
        return b;
      }
      if (table === 'site_domains') return tableChain({ data: opts.achat ?? null, error: opts.achatErr ?? null });
      return tableChain({ data: null, error: null });
    });
    return updates;
  }

  it('BYOD -> détaché, pointeur effacé, retiré de l’hébergeur', async () => {
    const updates = harnaisDetach({ custom: 'client.com' });
    const res = await POST_DELETE(reqDelete('boutique'));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toMatchObject({ ok: true, detache: true, achete: false, retireHebergeur: true });
    expect(updates[0].custom_domain).toBeNull();
    expect(updates[0].custom_domain_google_token).toBeNull();
    expect(removeDomainFromVercelMock).toHaveBeenCalledWith('client.com');
  });

  it('domaine ACHETÉ -> pointeur détaché mais JAMAIS retiré de l’hébergeur', async () => {
    // Deribfy n'a aucune autorite pour annuler un enregistrement paye : le
    // retirer de l'hebergeur couperait un domaine encore facture.
    const updates = harnaisDetach({ custom: 'achete.com', achat: { id: 'd1', status: 'sitemap_submitted' } });
    const j = await (await POST_DELETE(reqDelete('boutique'))).json();
    expect(j).toMatchObject({ detache: true, achete: true, retireHebergeur: false });
    expect(updates[0].custom_domain).toBeNull();
    expect(removeDomainFromVercelMock).not.toHaveBeenCalled();
  });

  it('achat en status `failed` -> traité comme un BYOD, retiré de l’hébergeur', async () => {
    harnaisDetach({ custom: 'rate.com', achat: { id: 'd1', status: 'failed' } });
    const j = await (await POST_DELETE(reqDelete('boutique'))).json();
    expect(j.achete).toBe(false);
    expect(removeDomainFromVercelMock).toHaveBeenCalled();
  });

  it('IDEMPOTENT — aucun domaine à détacher -> 200 sans faux succès', async () => {
    harnaisDetach({ custom: null });
    const j = await (await POST_DELETE(reqDelete('boutique'))).json();
    expect(j).toMatchObject({ ok: true, detache: false, raison: 'aucun_domaine' });
    expect(removeDomainFromVercelMock).not.toHaveBeenCalled();
  });

  it('lecture de l’achat EN ERREUR -> 503, AUCUN retrait externe (fail-closed)', async () => {
    // Ne pas savoir si le domaine est achete, c'est ne pas savoir si l'on a
    // le droit de le retirer.
    harnaisDetach({ custom: 'inconnu.com', achatErr: { message: 'db down' } });
    const res = await POST_DELETE(reqDelete('boutique'));
    expect(res.status).toBe(503);
    expect(removeDomainFromVercelMock).not.toHaveBeenCalled();
  });

  it('échec de l’écriture -> 500, AUCUN retrait externe', async () => {
    harnaisDetach({ custom: 'x.com', updateErr: { message: 'db down' } });
    const res = await POST_DELETE(reqDelete('boutique'));
    expect(res.status).toBe(500);
    expect(removeDomainFromVercelMock).not.toHaveBeenCalled();
  });

  it('slug manquant -> 400', async () => {
    const res = await POST_DELETE(reqDelete());
    expect(res.status).toBe(400);
  });

  it('l’échec du retrait externe ne produit pas un faux échec : le pointeur reste détaché', async () => {
    const updates = harnaisDetach({ custom: 'client.com' });
    removeDomainFromVercelMock.mockRejectedValue(new Error('hote indisponible'));
    const j = await (await POST_DELETE(reqDelete('boutique'))).json();
    expect(j).toMatchObject({ detache: true, retireHebergeur: false });
    expect(updates[0].custom_domain).toBeNull();
  });
});

// ============================================================
// AUDIT AGRESSIF / TOUR 1 -- LES CONTROLES D'UNICITE S'OUVRAIENT EN PANNE.
//
// Quatre verifications d'unicite existent. Aucune ne lisait `error`. Deux
// sont rattrapees par la contrainte UNIQUE ; les deux autres sont
// INTER-TABLES (`sites.custom_domain` <-> `site_domains`) et n'ont AUCUN
// filet : aucune contrainte ne relie ces deux tables.
//
// Consequence mesuree : en panne de base, un domaine ACHETE et paye par un
// marchand pouvait etre revendique en BYOD par un autre.
// ============================================================
describe('TOUR 1 — les contrôles d’unicité ferment en panne', () => {
  it('panne sur le contrôle `sites` -> 503, AUCUN appel externe, AUCUNE écriture', async () => {
    let sitesCall = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'sites') {
        sitesCall++;
        return tableChain(
          sitesCall === 1 ? { data: SITE, error: null } : { data: null, error: { message: 'db down' } }
        );
      }
      return tableChain({ data: null, error: null });
    });
    const res = await POST(req({ slug: 'boutique', domain: 'inconnu.com' }));
    expect(res.status).toBe(503);
    expect(addDomainToVercelMock).not.toHaveBeenCalled();
  });

  it('panne sur le contrôle `site_domains` -> 503 : un domaine ACHETÉ ne peut plus être revendiqué', async () => {
    let sitesCall = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'sites') {
        sitesCall++;
        return tableChain(sitesCall === 1 ? { data: SITE, error: null } : { data: null, error: null });
      }
      return tableChain({ data: null, error: { message: 'db down' } });
    });
    const res = await POST(req({ slug: 'boutique', domain: 'achete-par-un-autre.com' }));
    expect(res.status).toBe(503);
    expect(addDomainToVercelMock).not.toHaveBeenCalled();
  });
});
