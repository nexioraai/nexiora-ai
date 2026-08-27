import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { toolNamesForSite } from '@/lib/agent-tools/toolCapabilities';

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

import EditorialTheme from '@/app/sites/[slug]/themes/EditorialTheme';
import VifTheme from '@/app/sites/[slug]/themes/VifTheme';
import NoirTheme from '@/app/sites/[slug]/themes/NoirTheme';
import AuroraTheme from '@/app/sites/[slug]/themes/AuroraTheme';
import { CartProvider } from '@/app/sites/[slug]/themes/CartContext';
import type { Site } from '@/app/sites/[slug]/themes/shared';

// ============================================================
// CHANTIER 7 (MODE 1) — L'AGENT PEUT ENFIN AJOUTER UNE IMAGE.
//
// `propose_gallery_remove` et `propose_gallery_clear` existaient depuis
// toujours ; `propose_gallery_add` n'existait PAS. La galerie ne pouvait que
// rétrécir — et une fois vidée par `clear`, l'agent ne savait plus rien y
// remettre.
//
// LA MESURE QUI COMMANDE L'IMPLÉMENTATION : les quatre thèmes filtrent
// `typeof u === 'string' && u.startsWith('http')`. Écrire autre chose
// réussirait en base sans rien afficher. Ces tests ne se contentent donc pas
// de vérifier la persistance : ils RENDENT les quatre thèmes sur ce que la
// route a réellement écrit.
// ============================================================

const getUserMock = vi.fn();

let siteRow: Record<string, unknown>;
let ecritures: Record<string, unknown>[] = [];

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...(a as [string])) },
}));

const USER = { id: 'user-1', email: 'm@test.com' };
const IMG_A = 'https://images.pexels.com/photos/1234/sesame-field.jpeg';
const IMG_B = 'https://images.pexels.com/photos/5678/gum-arabic.jpeg';

function chain() {
  const b: any = {};
  b.select = () => b;
  b.eq = () => b;
  b.maybeSingle = async () => ({ data: siteRow, error: null });
  b.single = b.maybeSingle;
  b.update = (p: Record<string, unknown>) => { ecritures.push(p); return b; };
  b.then = (res: (v: unknown) => void) => res({ data: siteRow, error: null });
  return b;
}

function req(tool_name: string, tool_input: unknown) {
  return new Request('https://x.test/api/agent/yia/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify({ tool_name, tool_input }),
  });
}
const ctx = { params: Promise.resolve({ slug: 'yia' }) };

beforeEach(() => {
  ecritures = [];
  siteRow = {
    id: 'site-1', slug: 'yia', name: 'YIA Global Commodities',
    owner_id: USER.id, owner_email: USER.email, mode: 1, lang: 'en',
    gallery: [IMG_A], hidden_sections: [], sections: [], services: [],
    products: [], faq: [], whyus: [],
  };
  getUserMock.mockReset().mockResolvedValue({ data: { user: { ...USER } }, error: null });
  fromMock.mockReset().mockImplementation(() => chain());
});

async function ajouter(image_url: unknown) {
  const { POST } = await import('../route');
  const res = await POST(req('propose_gallery_add', { image_url, reason: 'r' }), ctx as any);
  return { statut: res.status, corps: await res.json().catch(() => null) };
}

// ------------------------------------------------------------
describe('CHANTIER 7 — l’outil est déclaré, et dans les mêmes modes que ses jumeaux', () => {
  it('déclaré côté chat ET exécutable côté apply', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const chat = readFileSync(join(__dirname, '../../chat/route.ts'), 'utf-8');
    const apply = readFileSync(join(__dirname, '../route.ts'), 'utf-8');
    expect(chat).toContain("name: 'propose_gallery_add'");
    expect(apply).toContain("'propose_gallery_add'");
    expect(apply).toContain("case 'propose_gallery_add'");
  });

  it('modes 1 et 2 le reçoivent, mode 3 non — exactement comme remove et clear', () => {
    for (const mode of [1, 2]) {
      expect(toolNamesForSite(mode, null), `mode ${mode}`).toContain('propose_gallery_add');
      expect(toolNamesForSite(mode, null), `mode ${mode}`).toContain('propose_gallery_remove');
    }
    expect(toolNamesForSite(3, 'reseller')).not.toContain('propose_gallery_add');
    expect(toolNamesForSite(3, 'reseller')).not.toContain('propose_gallery_remove');
  });

  it('🔴 AUCUNE frontière déplacée : add suit exactement remove et clear', () => {
    for (const mode of [1, 2, 3, null, 0, '2']) {
      const outils = toolNamesForSite(mode, 'reseller');
      expect(outils.includes('propose_gallery_add'), String(mode))
        .toBe(outils.includes('propose_gallery_remove'));
    }
  });
});

// ------------------------------------------------------------
describe('CHANTIER 7 — ajout valide : accepté, persisté, sous la bonne forme', () => {
  it('l’image est ajoutée EN FIN, l’existante intacte', async () => {
    const { statut } = await ajouter(IMG_B);
    expect(statut).toBe(200);
    expect(ecritures).toHaveLength(1);
    expect(ecritures[0]).toEqual({ gallery: [IMG_A, IMG_B] });
  });

  it('🔴 la valeur écrite est une CHAÎNE, jamais un objet', async () => {
    // C'est la mesure qui commande : les quatre thèmes ne rendent que des
    // chaînes. Écrire `{ url }` réussirait sans rien afficher.
    await ajouter(IMG_B);
    const ecrite = (ecritures[0].gallery as unknown[])[1];
    expect(typeof ecrite).toBe('string');
    expect(ecrite).toBe(IMG_B);
  });

  it('les espaces de bord sont retirés, la casse est PRÉSERVÉE', async () => {
    // Les chemins d'URL sont sensibles à la casse : la normaliser produirait
    // une adresse morte.
    await ajouter('   https://cdn.test/Photo-A.JPG   ');
    expect((ecritures[0].gallery as unknown[])[1]).toBe('https://cdn.test/Photo-A.JPG');
  });

  it('une galerie absente, vide ou mal formée est remplacée par un vrai tableau', async () => {
    for (const vide of [null, undefined, [], 'pas un tableau', 42]) {
      ecritures = [];
      siteRow.gallery = vide;
      const { statut } = await ajouter(IMG_B);
      expect(statut, String(vide)).toBe(200);
      expect(ecritures[0].gallery).toEqual([IMG_B]);
    }
  });

  it('🔴 aucune clé arbitraire de tool_input ne franchit la route', async () => {
    const { POST } = await import('../route');
    await POST(req('propose_gallery_add', {
      image_url: IMG_B, reason: 'r', mode: 3, for_sale: true, gallery: ['x'],
    }), ctx as any);
    expect(ecritures[0]).toEqual({ gallery: [IMG_A, IMG_B] });
  });
});

// ------------------------------------------------------------
describe('CHANTIER 7 — 🔴 refus : jamais d’écriture', () => {
  const REFUS: Array<[string, unknown, number]> = [
    ['chaîne vide', '', 400],
    ['chaîne blanche', '   ', 400],
    ['non-chaîne (null)', null, 400],
    ['non-chaîne (nombre)', 42, 400],
    ['non-chaîne (objet)', { url: IMG_B }, 400],
    ['non-chaîne (tableau)', [IMG_B], 400],
    ['pas une URL', 'photo.jpg', 400],
    ['chemin relatif', '/uploads/photo.jpg', 400],
    ['schéma javascript', 'javascript:alert(1)', 400],
    ['schéma data', 'data:text/html,<script>alert(1)</script>', 400],
    ['schéma file', 'file:///etc/passwd', 400],
    ['schéma inventé', 'httpfoo://cdn.test/a.jpg', 400],
  ];

  for (const [libelle, valeur, attendu] of REFUS) {
    it(`${libelle} → ${attendu}, AUCUNE écriture`, async () => {
      const { statut } = await ajouter(valeur);
      expect(statut).toBe(attendu);
      expect(ecritures, 'une écriture a eu lieu malgré le refus').toHaveLength(0);
      expect(siteRow.gallery, 'la galerie en base a bougé').toEqual([IMG_A]);
    });
  }

  it('🔴 le doublon est refusé en 409 — sinon l’image deviendrait inretirable', async () => {
    // `propose_gallery_remove` refuse d'agir sur une URL présente deux fois :
    // il ne peut pas choisir à la place du marchand. Autoriser le doublon
    // fabriquerait donc une image que l'agent ne saurait plus jamais retirer.
    const { statut } = await ajouter(IMG_A);
    expect(statut).toBe(409);
    expect(ecritures).toHaveLength(0);
  });

  it('🔴 le doublon est détecté après trim, mais PAS après changement de casse', async () => {
    expect((await ajouter(`  ${IMG_A}  `)).statut).toBe(409);
    ecritures = [];
    // Une URL différant par la casse est une AUTRE ressource : l'accepter est
    // correct, la confondre serait une normalisation abusive.
    expect((await ajouter(IMG_A.toUpperCase())).statut).toBe(200);
  });

  it('🔴 un non-propriétaire ne peut rien ajouter', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'autre', email: 'x@t.com' } }, error: null });
    const { statut } = await ajouter(IMG_B);
    expect(statut).not.toBe(200);
    expect(ecritures).toHaveLength(0);
  });
});

// ------------------------------------------------------------
describe('CHANTIER 7 — ce qui est écrit est RÉELLEMENT rendu', () => {
  function makeSite(gallery: unknown, over: Record<string, unknown> = {}): Site {
    return {
      id: 'site-1', slug: 'yia', name: 'YIA Global Commodities', mode: 1, lang: 'en',
      hidden_sections: [], hero_title: 'Premium Sesame', about: 'Chad to North America.',
      contact: { phone: '+1', email: 'a@b.c' }, social_links: {},
      testimonials: [], sections: [], products: [], faq: [], whyus: [],
      gallery, ...over,
    } as unknown as Site;
  }

  // MESURE, PAS SUPPOSITION. `EditorialTheme` rend ses images par
  // `next/image` : l'URL sort sous la forme `/_next/image?url=<encodée>`,
  // jamais littérale. Une assertion `toContain(url)` échouait donc pour ce
  // seul thème — et, plus grave, l'assertion NÉGATIVE du test de masquage
  // aurait passé sans rien constater. Ce prédicat couvre les deux formes.
  const contient = (html: string, url: string) =>
    html.includes(url) || html.includes(encodeURIComponent(url));

  const THEMES = [
    ['Editorial', (s: Site) => renderToStaticMarkup(<CartProvider><EditorialTheme site={s} /></CartProvider>)],
    ['Vif', (s: Site) => renderToStaticMarkup(<CartProvider><VifTheme site={s} /></CartProvider>)],
    ['Noir', (s: Site) => renderToStaticMarkup(<CartProvider><NoirTheme site={s} /></CartProvider>)],
    ['Aurora', (s: Site) => renderToStaticMarkup(<CartProvider><AuroraTheme site={s} /></CartProvider>)],
  ] as const;

  it('la sortie EXACTE de la route est rendue par les quatre thèmes', async () => {
    await ajouter(IMG_B);
    const ecrite = ecritures[0].gallery;
    for (const [nom, rendu] of THEMES) {
      const html = rendu(makeSite(ecrite));
      expect(contient(html, IMG_B), `${nom} : image ajoutée absente`).toBe(true);
      expect(contient(html, IMG_A), `${nom} : image existante perdue`).toBe(true);
    }
  });

  it('🔴 LA FORME OBJET NE SERAIT RENDUE PAR AUCUN THÈME — d’où le refus à l’écriture', async () => {
    // Preuve de la mesure qui justifie la validation : si la route écrivait
    // `{ url }`, l'écriture réussirait et la page ne bougerait pas.
    for (const [nom, rendu] of THEMES) {
      const html = rendu(makeSite([{ url: IMG_B }]));
      expect(contient(html, IMG_B), nom).toBe(false);
    }
    expect((await ajouter({ url: IMG_B })).statut).toBe(400);
  });

  it('🔴 hidden_sections masque toujours la galerie, image ajoutée comprise', async () => {
    await ajouter(IMG_B);
    for (const [nom, rendu] of THEMES) {
      const html = rendu(makeSite(ecritures[0].gallery, { hidden_sections: ['Gallery'] }));
      expect(contient(html, IMG_B), `${nom} : galerie masquée mais rendue`).toBe(false);
      expect(html, `${nom} : le reste de la page a disparu`).toContain('id="contact"');
    }
  });

  it('masquer la galerie n’écrit rien et n’altère pas l’ajout', async () => {
    siteRow.hidden_sections = ['Gallery'];
    const { statut } = await ajouter(IMG_B);
    expect(statut).toBe(200);
    expect(ecritures[0]).not.toHaveProperty('hidden_sections');
    expect(siteRow.hidden_sections).toEqual(['Gallery']);
  });
});

// ------------------------------------------------------------
describe('CHANTIER 7 — INVARIANTS MODE 1', () => {
  it('🔴 l’écriture ne touche QUE gallery', async () => {
    await ajouter(IMG_B);
    expect(Object.keys(ecritures[0])).toEqual(['gallery']);
    for (const interdit of ['mode', 'dropship_type', 'services', 'sections', 'faq', 'whyus',
                            'lang', 'area_served', 'price_range', 'products', 'hidden_sections']) {
      expect(ecritures[0], interdit).not.toHaveProperty(interdit);
    }
  });

  it('🔴 aucune capacité commerciale n’est apparue en Mode 1', () => {
    const outils = toolNamesForSite(1, null);
    for (const c of ['set_price', 'set_for_sale', 'set_currency', 'create_promo_code',
                     'count_product_stock', 'catalog_curate', 'catalog_enhance']) {
      expect(outils, c).not.toContain(c);
    }
  });

  it('Mode 1 reste non transactionnel', async () => {
    const { canTransact } = await import('@/lib/commerce-admission/canTransact');
    expect(canTransact(1)).toBe(false);
    expect(canTransact(2)).toBe(true);
    expect(canTransact(3)).toBe(true);
    await ajouter(IMG_B);
    expect(siteRow.mode).toBe(1);
  });

  it('le Mode 2 emprunte le même chemin, sans régression', async () => {
    siteRow.mode = 2;
    const { statut } = await ajouter(IMG_B);
    expect(statut).toBe(200);
    expect(ecritures[0]).toEqual({ gallery: [IMG_A, IMG_B] });
  });

  it('les protections catalogue du chantier 6 sont intactes', async () => {
    const { hasSupplierCatalog } = await import('@/lib/dropship/catalogAdmission');
    expect(hasSupplierCatalog(3)).toBe(true);
    for (const m of [1, 2, null, '3']) expect(hasSupplierCatalog(m), String(m)).toBe(false);
  });
});
