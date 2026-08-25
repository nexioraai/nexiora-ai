import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Audit Mode 3/POD BRAND, perfectionnement -- cette route (visiteur
// storefront, sans authentification par design) declenche un appel Claude
// Vision reellement facture au site cible, sans aucune limite de debit
// avant ce correctif -- un `slug` public (trivialement enumerable) suffit
// a faire monter la facture IA d'un marchand tiers en boucle. Meme famille
// de risque que generate-mockups (Printful, deja durci). Aucune couverture
// n'existait pour cette route avant ce lot.
// ============================================================

const messagesCreateMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: function AnthropicMock(this: any) {
    this.messages = { create: (...a: unknown[]) => messagesCreateMock(...a) };
  },
}));

const logAiUsageMock = vi.fn();
vi.mock('@/lib/ai-usage', () => ({
  logAiUsage: (...a: unknown[]) => logAiUsageMock(...a),
}));

function tableChain(response: { data: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.gte = vi.fn(self);
  chain.or = vi.fn(self);
  chain.limit = vi.fn(self);
  chain.maybeSingle = vi.fn(async () => response);
  chain.then = (resolve: (v: unknown) => void) => resolve(response);
  return chain;
}

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

import { POST } from '../route';

const SITE = { id: 'site-1', mode: 3, dropship_type: 'reseller', cj_margin_percent: 20, cj_round_mode: null };
const IMAGE = 'data:image/png;base64,aGVsbG8=';

function req(body: unknown) {
  return new Request('https://deribfy.test/api/catalog/image-search', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  fromMock.mockReset();
  messagesCreateMock.mockReset();
  logAiUsageMock.mockReset();
  messagesCreateMock.mockResolvedValue({
    content: [{ text: 'black headphones' }],
    usage: { input_tokens: 100, output_tokens: 10 },
  });
});

describe('POST /api/catalog/image-search — limite de débit anti-abus (action facturée, sans authentification)', () => {
  it('10 analyses déjà déclenchées pour ce site dans la dernière minute -> 429, aucun appel Claude facturé', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'sites') return tableChain({ data: SITE, error: null });
      if (table === 'ai_usage_log') return tableChain({ data: null, error: null, count: 10 });
      return tableChain({ data: [], error: null });
    });

    const res = await POST(req({ slug: 'boutique', image: IMAGE }));

    expect(res.status).toBe(429);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('sous la limite -> l\'analyse procède normalement (comportement inchangé)', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'sites') return tableChain({ data: SITE, error: null });
      if (table === 'ai_usage_log') return tableChain({ data: null, error: null, count: 3 });
      if (table === 'catalog_products') return tableChain({ data: [], error: null });
      return tableChain({ data: [], error: null });
    });

    const res = await POST(req({ slug: 'boutique', image: IMAGE }));

    expect(res.status).toBe(200);
    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
    expect(logAiUsageMock).toHaveBeenCalledWith(expect.objectContaining({ siteId: 'site-1', usageType: 'image' }));
  });
});

// ============================================================
// LOT 2 -- LE CABLAGE DE L'ADMISSION, ENFIN COUVERT.
//
// LA MUTATION QUI SURVIVAIT. Retirer purement et simplement la garde
// d'admission de cette route ne cassait AUCUN test : la primitive etait
// testee comme FONCTION (`catalogAdmission.test.ts`), jamais comme CABLAGE.
// Une garde non cablee est une garde absente.
//
// `pod_brand` est le cas qui compte : il A un catalogue fournisseur
// (`hasSupplierCatalog(3)` est vrai, ses produits SONT des Printful), mais il
// n'utilise PAS `site_catalog_selections`. Une garde de mode seule le laissait
// donc passer.
// ============================================================

describe("POST /api/catalog/image-search — LOT 2 : meme admission que la recherche texte", () => {
  it.each([
    ['Mode 1', { ...SITE, mode: 1, dropship_type: null }],
    ['Mode 2', { ...SITE, mode: 2, dropship_type: null }],
    ['Mode 3 pod_brand', { ...SITE, dropship_type: 'pod_brand' }],
    ['Mode 3 sans sous-type', { ...SITE, dropship_type: null }],
  ])('%s -> reponse vide, et AUCUN appel Claude facture', async (_l, site) => {
    fromMock.mockImplementation((t: string) => {
      if (t === 'sites') return tableChain({ data: site, error: null });
      return tableChain({ data: [], error: null, count: 0 });
    });
    const res = await POST(req({ slug: 'x', image: IMAGE }));
    expect(await res.json()).toEqual({ products: [], keywords: '', total: 0 });
    // La garde reste AVANT l'appel facture : c'est sa raison d'etre.
    expect(messagesCreateMock).not.toHaveBeenCalled();
    expect(logAiUsageMock).not.toHaveBeenCalled();
  });

  it('Mode 3 reseller -> l\'analyse procede (chemin legitime, non casse)', async () => {
    fromMock.mockImplementation((t: string) => {
      if (t === 'sites') return tableChain({ data: SITE, error: null });
      return tableChain({ data: [], error: null, count: 0 });
    });
    await POST(req({ slug: 'x', image: IMAGE }));
    expect(messagesCreateMock).toHaveBeenCalled();
  });
});
