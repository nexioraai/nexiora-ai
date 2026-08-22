import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Chantier Site Web / Mode 1 — verrouille provisionDomain() avant le
// premier test reel avec achat Porkbun. Cible precisement les deux bugs
// trouves et corriges lors de l'audit :
// 1. Le token Google etait regenere sans condition a CHAQUE appel de
//    provisionDomain() (donc a chaque renouvellement Stripe annuel),
//    accumulant des TXT obsoletes dans la zone DNS.
// 2. Le garde en tete de fonction ('indexed' || 'dns_configured') traitait
//    un statut INTERMEDIAIRE comme "deja termine", bloquant toute reprise
//    manuelle d'un domaine reste coince a cette etape apres un echec
//    transitoire du TXT Google.
// ============================================================

const purchaseDomainMock = vi.fn();
const previewPurchaseMock = vi.fn();
const createDnsRecordMock = vi.fn();
const deleteDnsByNameTypeMock = vi.fn();
const listAllDomainsMock = vi.fn();
vi.mock('@/lib/domains/porkbun', () => ({
  purchaseDomain: (...args: unknown[]) => purchaseDomainMock(...args),
  previewPurchase: (...args: unknown[]) => previewPurchaseMock(...args),
  createDnsRecord: (...args: unknown[]) => createDnsRecordMock(...args),
  deleteDnsByNameType: (...args: unknown[]) => deleteDnsByNameTypeMock(...args),
  listAllDomains: (...args: unknown[]) => listAllDomainsMock(...args),
}));

const addDomainToVercelMock = vi.fn();
const getVercelDomainStatusMock = vi.fn();
const verifyVercelDomainMock = vi.fn();
vi.mock('@/lib/domains/vercel', () => ({
  addDomainToVercel: (...args: unknown[]) => addDomainToVercelMock(...args),
  getVercelDomainStatus: (...args: unknown[]) => getVercelDomainStatusMock(...args),
  verifyVercelDomain: (...args: unknown[]) => verifyVercelDomainMock(...args),
  VERCEL_A_RECORD: '76.76.21.21',
  VERCEL_CNAME: 'cname.vercel-dns.com',
}));

const getDnsVerificationTokenMock = vi.fn();
vi.mock('@/lib/domains/searchconsole', () => ({
  getDnsVerificationToken: (...args: unknown[]) => getDnsVerificationTokenMock(...args),
}));

const checkExistingMailMock = vi.fn();
vi.mock('@/lib/domains/mail-guard', () => ({
  checkExistingMail: (...args: unknown[]) => checkExistingMailMock(...args),
}));

const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({
  logAnomaly: (...args: unknown[]) => logAnomalyMock(...args),
}));

// Mock supabaseAdmin minimal mais fidele : chaque methode de chaine renvoie
// le builder lui-meme (comme le vrai client), la resolution se fait via
// .then() sur une file de reponses fournie par le test, dans l'ordre exact
// des appels .from(...) attendus. Fragile a l'ordre par construction, mais
// le code testé suit un chemin deterministe pour un etat donne.
function makeSupabaseMock(responses: any[]) {
  let i = 0;
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const builder: any = {};
  const chain = (method: string) => (...args: unknown[]) => {
    calls.push({ table: calls.length ? calls[calls.length - 1].table : '?', method, args });
    return builder;
  };
  ['select', 'update', 'eq', 'in', 'or', 'lt', 'is', 'limit', 'order', 'maybeSingle'].forEach((m) => {
    builder[m] = chain(m);
  });
  builder.then = (resolve: any) => {
    const r = responses[i] ?? { data: null, error: null };
    i++;
    resolve(r);
  };
  const from = vi.fn((table: string) => {
    calls.push({ table, method: 'from', args: [table] });
    return builder;
  });
  return { supabaseAdmin: { from }, calls };
}

let currentMock: ReturnType<typeof makeSupabaseMock>;
vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() {
    return currentMock.supabaseAdmin;
  },
}));

let provisionDomain: typeof import('../provision').provisionDomain;

beforeEach(async () => {
  vi.resetModules();
  purchaseDomainMock.mockReset();
  previewPurchaseMock.mockReset();
  createDnsRecordMock.mockReset();
  deleteDnsByNameTypeMock.mockReset();
  listAllDomainsMock.mockReset();
  addDomainToVercelMock.mockReset();
  getVercelDomainStatusMock.mockReset();
  verifyVercelDomainMock.mockReset();
  getDnsVerificationTokenMock.mockReset();
  checkExistingMailMock.mockReset();
  logAnomalyMock.mockReset();

  addDomainToVercelMock.mockResolvedValue({ ok: true, alreadyExists: true, verification: [], dns: [] });
  getVercelDomainStatusMock.mockResolvedValue({ attached: true, verified: true, verification: [] });
  verifyVercelDomainMock.mockResolvedValue(true);
  checkExistingMailMock.mockResolvedValue({ hasMail: false, safe: true, hosts: [] });
  deleteDnsByNameTypeMock.mockResolvedValue(undefined);

  ({ provisionDomain } = await import('../provision'));
});

describe('provisionDomain — token Google au renouvellement (bug corrigé)', () => {
  it('ne régénère jamais un token Google déjà présent (renouvellement annuel)', async () => {
    currentMock = makeSupabaseMock([
      // SELECT initial de la ligne : deja entierement provisionnee, y compris gsc_token.
      {
        data: {
          id: 'dom-1', domain: 'exemple.com', price_cents: 1500, status: 'sitemap_submitted',
          purchased_at: '2025-01-01T00:00:00Z', dns_configured_at: '2025-01-01T01:00:00Z',
          site_id: 'site-1', gsc_token: 'deja-existant-abc123',
        },
      },
      // Etape 5 : sites.update({ custom_domain })
      { data: null, error: null },
    ]);

    const result = await provisionDomain('dom-1');

    expect(getDnsVerificationTokenMock).not.toHaveBeenCalled();
    expect(createDnsRecordMock).not.toHaveBeenCalledWith('exemple.com', expect.objectContaining({ type: 'TXT', name: '' }));
    expect(result.ok).toBe(true);
  });

  it('génère le token une seule fois quand aucun token n\'existe encore', async () => {
    currentMock = makeSupabaseMock([
      {
        data: {
          id: 'dom-2', domain: 'nouveau.com', price_cents: 1500, status: 'dns_configured',
          purchased_at: '2026-08-01T00:00:00Z', dns_configured_at: '2026-08-01T01:00:00Z',
          site_id: 'site-2', gsc_token: null,
        },
      },
      { data: null, error: null }, // update gsc_token
      { data: null, error: null }, // update sites.custom_domain
    ]);
    getDnsVerificationTokenMock.mockResolvedValue('nouveau-token-xyz');

    await provisionDomain('dom-2');

    expect(getDnsVerificationTokenMock).toHaveBeenCalledTimes(1);
    expect(createDnsRecordMock).toHaveBeenCalledWith('nouveau.com', { type: 'TXT', name: '', content: 'nouveau-token-xyz' });
  });

  // Audit Mode 3/POD BRAND, perfectionnement (fermeture contraintes UNIQUE) --
  // cause racine trouvee en verifiant que sites_custom_domain_unique couvre
  // bien CETTE ecriture aussi : avant ce correctif, une erreur ici (23505 une
  // fois l'index en place, ou toute autre erreur DB) etait totalement
  // ignoree -- la fonction retournait {ok:true, status:'dns_configured'}
  // alors que le site n'etait PAS reellement rattache a son domaine (Porkbun/
  // Vercel/DNS termines, mais sites.custom_domain jamais ecrit -- le
  // storefront public resout par cette colonne, jamais site_domains).
  it("etape 5 (rattachement sites.custom_domain) echoue (23505 ou autre) -> ne pretend PAS 'dns_configured', signale et retourne 'link_failed'", async () => {
    currentMock = makeSupabaseMock([
      {
        data: {
          id: 'dom-3', domain: 'collision.com', price_cents: 1500, status: 'dns_configured',
          purchased_at: '2026-08-01T00:00:00Z', dns_configured_at: '2026-08-01T01:00:00Z',
          site_id: 'site-3', gsc_token: 'deja-existant',
        },
      },
      { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "sites_custom_domain_unique"' } }, // update sites.custom_domain
    ]);

    const result = await provisionDomain('dom-3');

    expect(result.ok).toBe(false);
    expect(result.status).toBe('link_failed');
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'domain_link_failed', severity: 'blocked', siteId: 'site-3' })
    );
  });
});

describe('provisionDomain — idempotence de l\'achat', () => {
  it('n\'appelle jamais purchaseDomain si purchased_at est déjà renseigné', async () => {
    currentMock = makeSupabaseMock([
      {
        data: {
          id: 'dom-3', domain: 'deja-achete.com', price_cents: 1500, status: 'dns_configured',
          purchased_at: '2026-08-01T00:00:00Z', dns_configured_at: '2026-08-01T01:00:00Z',
          site_id: 'site-3', gsc_token: 'tok',
        },
      },
      { data: null, error: null },
    ]);

    await provisionDomain('dom-3');

    expect(purchaseDomainMock).not.toHaveBeenCalled();
    expect(previewPurchaseMock).not.toHaveBeenCalled();
  });

  it('achète avec l\'id de la ligne site_domains comme clé d\'idempotence Porkbun', async () => {
    currentMock = makeSupabaseMock([
      {
        data: {
          id: 'dom-4', domain: 'frais.com', price_cents: 2000, status: 'pending',
          purchased_at: null, dns_configured_at: null, site_id: 'site-4', gsc_token: null,
        },
      },
      { data: null, error: null }, // update status: purchased
      { data: null, error: null }, // update dns_configured
      { data: null, error: null }, // update gsc_token
      { data: null, error: null }, // update sites.custom_domain
    ]);
    previewPurchaseMock.mockResolvedValue({ wouldSucceed: true });
    purchaseDomainMock.mockResolvedValue({ ok: true, raw: {} });
    getDnsVerificationTokenMock.mockResolvedValue('tok-frais');

    await provisionDomain('dom-4');

    expect(purchaseDomainMock).toHaveBeenCalledWith('frais.com', 2000, 'dom-4');
  });

  it('échoue proprement (status failed) si le prix a dérivé, sans jamais appeler purchaseDomain', async () => {
    currentMock = makeSupabaseMock([
      {
        data: {
          id: 'dom-5', domain: 'prix-perime.com', price_cents: 1000, status: 'pending',
          purchased_at: null, dns_configured_at: null, site_id: 'site-5', gsc_token: null,
        },
      },
      { data: null, error: null }, // update status: failed
    ]);
    previewPurchaseMock.mockResolvedValue({ wouldSucceed: false, message: 'Prix différent' });

    const result = await provisionDomain('dom-5');

    expect(purchaseDomainMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.status).toBe('failed');
  });

  // Audit Mode 3/POD BRAND, perfectionnement -- cause racine : Porkbun est
  // reellement facture par purchaseDomain() AVANT l'ecriture DB qui marque
  // purchased_at. Si cette ecriture echoue et que la fonction se contentait
  // de fail() (status='failed'), le prochain passage de domain-retry
  // rappellerait provisionDomain() qui, ne voyant toujours pas
  // purchased_at, RACHETERAIT reellement le domaine chez Porkbun -- un
  // achat facture deux fois pour la meme ligne. Le correctif retente
  // l'ecriture (probleme transitoire) et, si la contention persiste,
  // s'arrete SANS jamais passer status='failed' (qui declencherait un
  // rachat), en alertant a la place.
  //
  // Revue de ce lot : un logAnomaly() seul ne suffisait PAS -- il laissait
  // la ligne a status='paid', exactement la valeur que domain-retry reprend
  // automatiquement (PAID_STALE_MS = 10 min). Le correctif fait desormais
  // une ecriture ACTIVE et independante vers 'purchase_uncertain', une
  // valeur qu'aucune requete de domain-retry ne cible -- ce test verrouille
  // cette ecriture reelle, pas seulement l'absence d'ecriture vers 'failed'.
  it("achat Porkbun reussi mais ecriture purchased_at en echec persistant -> bascule activement vers 'purchase_uncertain' (jamais laisse a 'paid', jamais 'failed')", async () => {
    const domainRow = {
      id: 'dom-6', domain: 'ecriture-instable.com', price_cents: 1500, status: 'pending',
      purchased_at: null, dns_configured_at: null, site_id: 'site-6', gsc_token: null,
    };
    currentMock = makeSupabaseMock([
      { data: domainRow, error: null },                          // SELECT initiale
      { data: null, error: { message: 'connection reset' } },    // update purchased : tentative 1
      { data: null, error: { message: 'connection reset' } },    // update purchased : tentative 2
      { data: null, error: { message: 'connection reset' } },    // update purchased : tentative 3
      { data: null, error: null },                                // update status='purchase_uncertain' : reussit
    ]);
    previewPurchaseMock.mockResolvedValue({ wouldSucceed: true });
    purchaseDomainMock.mockResolvedValue({ ok: true, raw: {} });

    const result = await provisionDomain('dom-6');

    expect(purchaseDomainMock).toHaveBeenCalledTimes(1); // Porkbun facture une seule fois
    expect(result.ok).toBe(false);
    expect(result.status).toBe('purchase_uncertain');
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'domain_purchase_write_failed', severity: 'blocked', siteId: 'site-6' })
    );
    // L'ecriture active vers 'purchase_uncertain' a bien ete tentee (et
    // reussie, d'apres la reponse mockee) -- pas seulement une anomalie
    // informative sans effet sur la ligne.
    const statusUpdates = currentMock.calls.filter((c) => c.method === 'update').map((c) => (c.args[0] as any)?.status);
    expect(statusUpdates).toContain('purchase_uncertain');
    expect(statusUpdates).not.toContain('failed');
  });

  it("meme scenario, mais l'ecriture vers 'purchase_uncertain' echoue AUSSI -> le statut retourne reste honnetement 'paid' (pas de faux 'purchase_uncertain' non persiste)", async () => {
    const domainRow = {
      id: 'dom-7', domain: 'db-totalement-hs.com', price_cents: 1500, status: 'pending',
      purchased_at: null, dns_configured_at: null, site_id: 'site-7', gsc_token: null,
    };
    currentMock = makeSupabaseMock([
      { data: domainRow, error: null },
      { data: null, error: { message: 'down' } },
      { data: null, error: { message: 'down' } },
      { data: null, error: { message: 'down' } },
      { data: null, error: { message: 'down' } }, // update status='purchase_uncertain' echoue aussi
    ]);
    previewPurchaseMock.mockResolvedValue({ wouldSucceed: true });
    purchaseDomainMock.mockResolvedValue({ ok: true, raw: {} });

    const result = await provisionDomain('dom-7');

    expect(result.ok).toBe(false);
    // Ne PAS pretendre 'purchase_uncertain' si l'ecriture qui devait poser
    // ce statut a elle-meme echoue -- le statut retourne reflete l'etat reel
    // le plus probable en base (toujours 'paid', jamais reecrit).
    expect(result.status).toBe('paid');
  });

  // Miroir de la garde 'sitemap_submitted' deja testee plus bas : un domaine
  // 'purchase_uncertain' ne doit jamais etre retente automatiquement, par
  // AUCUN appelant de provisionDomain() (domain-retry, domains/provision/route.ts,
  // ou tout futur appelant) -- seule une correction manuelle du `status`
  // peut le faire ressortir de cet etat.
  // Audit Mode 3/POD BRAND, perfectionnement (fermeture dette Porkbun/DEBT-019) --
  // 'purchase_uncertain' n'est plus un dead-end : provisionDomain() reconcilie
  // via listAllDomains() (verite Porkbun reelle) au lieu de deviner. Les 4
  // tests suivants remplacent l'ancien test "refuse tout traitement" --
  // comportement DELIBEREMENT change ce lot, pas une regression.
  it("reconciliation : domaine REELLEMENT possede chez Porkbun -> confirme purchased_at, ne rachete JAMAIS, reprend le pipeline normalement", async () => {
    currentMock = makeSupabaseMock([
      // SELECT initiale : purchase_uncertain.
      {
        data: {
          id: 'dom-8', domain: 'confirme.com', price_cents: 1200, status: 'purchase_uncertain',
          purchased_at: null, dns_configured_at: null, site_id: 'site-8', gsc_token: null,
          updated_at: new Date().toISOString(),
        },
      },
      // UPDATE de confirmation (status: purchased, purchased_at).
      { data: null, error: null },
      // SELECT du rappel recursif : deja au bout du pipeline (simplifie le
      // test -- reprendre le pipeline complet est deja couvert ailleurs).
      {
        data: {
          id: 'dom-8', domain: 'confirme.com', price_cents: 1200, status: 'sitemap_submitted',
          purchased_at: '2026-08-21T00:00:00Z', dns_configured_at: '2026-08-21T00:01:00Z',
          site_id: 'site-8', gsc_token: 'tok', updated_at: new Date().toISOString(),
        },
      },
    ]);
    listAllDomainsMock.mockResolvedValue([{ domain: 'confirme.com', status: 'ACTIVE' }]);

    const result = await provisionDomain('dom-8');

    expect(listAllDomainsMock).toHaveBeenCalledTimes(1);
    expect(purchaseDomainMock).not.toHaveBeenCalled();
    expect(previewPurchaseMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, status: 'sitemap_submitted' });
  });

  it("reconciliation : domaine ABSENT chez Porkbun MAIS delai de securite pas encore ecoule -> ne conclut rien, reste en attente", async () => {
    currentMock = makeSupabaseMock([
      {
        data: {
          id: 'dom-9', domain: 'juste-marque.com', price_cents: 1200, status: 'purchase_uncertain',
          purchased_at: null, dns_configured_at: null, site_id: 'site-9', gsc_token: null,
          updated_at: new Date().toISOString(), // a l'instant -- delai (30 min) pas ecoule
        },
      },
    ]);
    listAllDomainsMock.mockResolvedValue([]); // absent du compte Porkbun

    const result = await provisionDomain('dom-9');

    expect(purchaseDomainMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, status: 'purchase_uncertain' });
    // Aucune ecriture tentee (pas de "failed" premature) : seul le SELECT
    // initial a ete consomme dans la file de reponses.
    expect(currentMock.calls.filter((c) => c.method === 'update')).toHaveLength(0);
  });

  it("reconciliation : domaine ABSENT chez Porkbun ET delai ecoule -> repasse a 'failed', autorise un nouvel essai en connaissance de cause", async () => {
    const longAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h > 30 min
    currentMock = makeSupabaseMock([
      {
        data: {
          id: 'dom-10', domain: 'jamais-achete.com', price_cents: 1200, status: 'purchase_uncertain',
          purchased_at: null, dns_configured_at: null, site_id: 'site-10', gsc_token: null,
          updated_at: longAgo,
        },
      },
      { data: null, error: null }, // update -> failed
    ]);
    listAllDomainsMock.mockResolvedValue([]);

    const result = await provisionDomain('dom-10');

    expect(purchaseDomainMock).not.toHaveBeenCalled(); // jamais rachete a l'aveugle par CE chemin
    expect(result).toEqual({ ok: false, status: 'failed' });
    const failedUpdate = currentMock.calls.find((c) => c.method === 'update' && (c.args[0] as any)?.status === 'failed');
    expect(failedUpdate).toBeTruthy();
  });

  it("reconciliation : listAllDomains() elle-meme indisponible -> ne devine jamais, reste en attente", async () => {
    currentMock = makeSupabaseMock([
      {
        data: {
          id: 'dom-11', domain: 'porkbun-down.com', price_cents: 1200, status: 'purchase_uncertain',
          purchased_at: null, dns_configured_at: null, site_id: 'site-11', gsc_token: null,
          updated_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // meme au-dela du delai
        },
      },
    ]);
    listAllDomainsMock.mockRejectedValue(new Error('Porkbun timeout'));

    const result = await provisionDomain('dom-11');

    expect(purchaseDomainMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, status: 'purchase_uncertain' });
    expect(currentMock.calls.filter((c) => c.method === 'update')).toHaveLength(0);
  });
});

describe('provisionDomain — état terminal et reprise (garde en tête de fonction corrigée)', () => {
  it('sitemap_submitted : retour immédiat, aucun appel externe', async () => {
    currentMock = makeSupabaseMock([
      {
        data: {
          id: 'dom-6', domain: 'termine.com', price_cents: 1500, status: 'sitemap_submitted',
          purchased_at: '2025-01-01T00:00:00Z', dns_configured_at: '2025-01-01T01:00:00Z',
          site_id: 'site-6', gsc_token: 'tok',
        },
      },
    ]);

    const result = await provisionDomain('dom-6');

    expect(result).toEqual({ ok: true, status: 'sitemap_submitted' });
    expect(addDomainToVercelMock).not.toHaveBeenCalled();
    expect(checkExistingMailMock).not.toHaveBeenCalled();
  });

  it('dns_configured (état intermédiaire) : la fonction retente réellement au lieu de court-circuiter', async () => {
    // Avant le correctif, 'dns_configured' était traité comme "déjà fait" et
    // la fonction retournait avant même d'essayer de régénérer le TXT Google
    // manquant — un domaine resté coincé ici après un échec transitoire ne
    // pouvait plus jamais être repris, y compris manuellement.
    currentMock = makeSupabaseMock([
      {
        data: {
          id: 'dom-7', domain: 'coince.com', price_cents: 1500, status: 'dns_configured',
          purchased_at: '2026-08-01T00:00:00Z', dns_configured_at: '2026-08-01T01:00:00Z',
          site_id: 'site-7', gsc_token: null,
        },
      },
      { data: null, error: null }, // update gsc_token
      { data: null, error: null }, // update sites.custom_domain
    ]);
    getDnsVerificationTokenMock.mockResolvedValue('recovery-token');

    await provisionDomain('dom-7');

    expect(getDnsVerificationTokenMock).toHaveBeenCalledTimes(1);
  });
});
