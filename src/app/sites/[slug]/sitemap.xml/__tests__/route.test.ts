import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Correction canari SEO -- /sites/[slug]/sitemap.xml n'existait pas du tout
// (seuls llms.txt et robots.txt avaient une route littérale sous
// /sites/[slug]/) : cause racine directe des 404 observés par le canari.
// Vérrouille : site publié -> sitemap valide (homepage + produits) ; site
// introuvable (non publié/archivé/inexistant -- fetchSite() applique déjà
// published=true AND archived_at IS NULL via sites_public) -> 404 ; aucune
// donnée sensible exposée (mêmes colonnes que fetchSite()/sites_public).
// ============================================================

const fetchSiteMock = vi.fn();
const resolveSiteBaseUrlMock = vi.fn();
vi.mock('../../themes/shared', () => ({
  fetchSite: (...a: unknown[]) => fetchSiteMock(...a),
  resolveSiteBaseUrl: (...a: unknown[]) => resolveSiteBaseUrlMock(...a),
}));

function req(host = 'www.deribfy.com') {
  return new Request('https://www.deribfy.com/sites/my-shop/sitemap.xml', {
    headers: { host },
  });
}

beforeEach(() => {
  fetchSiteMock.mockReset();
  resolveSiteBaseUrlMock.mockReset();
});

describe('GET /sites/[slug]/sitemap.xml', () => {
  it('site introuvable (non publié, archivé, ou inexistant) -> 404, jamais un sitemap vide qui prétendrait exister', async () => {
    fetchSiteMock.mockResolvedValue(null);

    const { GET } = await import('../route');
    const res = await GET(req(), { params: Promise.resolve({ slug: 'introuvable' }) });

    expect(res.status).toBe(404);
  });

  it('site publié sans produit -> sitemap XML valide avec uniquement la page d\'accueil', async () => {
    fetchSiteMock.mockResolvedValue({ id: 'site-1', slug: 'my-shop', products: [] });
    resolveSiteBaseUrlMock.mockReturnValue('https://www.deribfy.com/sites/my-shop');

    const { GET } = await import('../route');
    const res = await GET(req(), { params: Promise.resolve({ slug: 'my-shop' }) });
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/xml');
    expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(body).toContain('<loc>https://www.deribfy.com/sites/my-shop</loc>');
    expect(body).not.toContain('/produits/');
  });

  it('site publié avec produits -> chaque produit apparaît comme une URL /produits/{id} distincte', async () => {
    fetchSiteMock.mockResolvedValue({
      id: 'site-1', slug: 'my-shop',
      products: [{ id: 'catalog-abc' }, { id: 'shop-def' }],
    });
    resolveSiteBaseUrlMock.mockReturnValue('https://www.deribfy.com/sites/my-shop');

    const { GET } = await import('../route');
    const res = await GET(req(), { params: Promise.resolve({ slug: 'my-shop' }) });
    const body = await res.text();

    expect(body).toContain('<loc>https://www.deribfy.com/sites/my-shop/produits/catalog-abc</loc>');
    expect(body).toContain('<loc>https://www.deribfy.com/sites/my-shop/produits/shop-def</loc>');
  });

  it('utilise resolveSiteBaseUrl (domaine réellement servi -- custom_domain ou www.deribfy.com/sites/{slug}), jamais une URL codée en dur', async () => {
    fetchSiteMock.mockResolvedValue({ id: 'site-1', slug: 'my-shop', custom_domain: 'boutique-exemple.com', products: [] });
    resolveSiteBaseUrlMock.mockReturnValue('https://boutique-exemple.com');

    const { GET } = await import('../route');
    await GET(req('boutique-exemple.com'), { params: Promise.resolve({ slug: 'my-shop' }) });

    expect(resolveSiteBaseUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({ custom_domain: 'boutique-exemple.com' }),
      'boutique-exemple.com'
    );
  });

  it("n'expose aucune colonne sensible -- ne lit rien d'autre que ce que fetchSite() (sites_public) renvoie déjà", async () => {
    // fetchSite() est le SEUL point d'accès aux données du site dans cette
    // route -- aucun accès direct à `sites`/`sites_public` ici, donc aucune
    // fuite possible au-delà de ce que fetchSite() expose déjà ailleurs
    // (robots.txt, llms.txt, page.tsx). Test structurel : vérifie qu'aucune
    // donnée du mock au-delà de id/slug/produits n'apparaît dans la sortie.
    fetchSiteMock.mockResolvedValue({
      id: 'site-1', slug: 'my-shop', products: [],
      owner_email: 'secret@example.com', payment_account_id: 'acct_secret',
    });
    resolveSiteBaseUrlMock.mockReturnValue('https://www.deribfy.com/sites/my-shop');

    const { GET } = await import('../route');
    const res = await GET(req(), { params: Promise.resolve({ slug: 'my-shop' }) });
    const body = await res.text();

    expect(body).not.toContain('secret@example.com');
    expect(body).not.toContain('acct_secret');
  });
});
