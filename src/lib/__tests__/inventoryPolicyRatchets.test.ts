import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// ============================================================
// ÉTAPE 7 — CLIQUETS ANTI-DIVERGENCE DE LA POLITIQUE D'INVENTAIRE.
//
// Les étapes 1 à 6 tiennent par une seule propriété : `track_inventory` ne
// peut pas repasser à `true` sans qu'un comptage soit affirmé. Cette propriété
// est gardée en base (barrière de l'étape 2), mais elle peut être CONTOURNÉE
// depuis TypeScript de deux façons, et deux seulement :
//   1. une écriture directe `track_inventory: true` quelque part ;
//   2. la réouverture de `track_inventory`/`stock_counted_at` dans une des
//      allowlists génériques de `/api/shop/products`.
// Chacune serait silencieuse : aucun test métier ne la verrait, la base
// refuserait au cas par cas, et le produit deviendrait imprévisible. Ces
// cliquets rendent les deux visibles au premier `vitest run`.
// ============================================================

const REPO = join(__dirname, '../../..');
const SRC = join(REPO, 'src');

function fichiersSource(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__') fichiersSource(full, out); }
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

/** Code seul : les commentaires DÉCRIVENT la politique, ils ne l'appliquent pas. */
function code(file: string): string {
  return readFileSync(file, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const SOURCES = fichiersSource(SRC);

// Le SEUL chemin autorisé à porter la politique d'inventaire côté TypeScript.
// Toute autre occurrence est une divergence — d'où une liste, et non un motif.
const CHEMINS_AUTORISES = [
  'src/lib/shop.ts',
  'src/app/api/shop/products/[id]/inventory/route.ts',
];

function relatif(f: string): string {
  return f.slice(REPO.length + 1);
}

describe("AUCUNE écriture directe de la politique d'inventaire en TypeScript", () => {
  /**
   * Charges utiles réellement envoyées à PostgREST : le contenu littéral des
   * `.update({...})` et `.insert({...})`.
   *
   * C'est CE périmètre qu'il faut contraindre, et pas le fichier entier : une
   * route peut légitimement RENVOYER `track_inventory: true` dans sa réponse
   * JSON après un comptage réussi — c'est une lecture, pas une écriture.
   * Confondre les deux ferait échouer le cliquet sur du code correct, et
   * l'usure d'un cliquet qui crie à tort est qu'on finit par l'affaiblir.
   */
  function chargesEcrites(file: string): string[] {
    return [...code(file).matchAll(/\.(update|insert)\(\s*(\{[\s\S]*?\})/g)].map((m) => m[2]);
  }

  it("aucun `.update()`/`.insert()` du dépôt ne pose `track_inventory: true`", () => {
    const coupables = SOURCES.filter((f) =>
      chargesEcrites(f).some((c) => /track_inventory\s*:\s*true/.test(c))
    ).map(relatif);
    // `enable_stock_tracking()` est le seul chemin de réactivation : lui seul
    // pose les trois colonnes ensemble, donc lui seul satisfait la barrière de
    // l'étape 2. Une écriture directe échouerait en base — mais elle
    // échouerait TARD, à l'exécution, sur le site d'un marchand réel.
    expect(coupables, 'réactiver le suivi passe par enable_stock_tracking(), jamais par une écriture directe').toEqual([]);
  });

  it("le seul `.update()` posant `track_inventory: false` est celui du module boutique", () => {
    const porteurs = SOURCES.filter((f) =>
      chargesEcrites(f).some((c) => /track_inventory\s*:\s*false/.test(c))
    ).map(relatif);
    expect(porteurs).toEqual(['src/lib/shop.ts']);
  });

  it("aucun `.update()`/`.insert()` n'écrit jamais `stock_counted_at`", () => {
    const coupables = SOURCES.filter((f) =>
      chargesEcrites(f).some((c) => /stock_counted_at/.test(c))
    ).map(relatif);
    // Un horodatage de comptage posé par l'application serait une affirmation
    // que personne n'a faite. Seule la RPC l'écrit, avec clock_timestamp().
    expect(coupables).toEqual([]);
  });

  it("la RPC `enable_stock_tracking` n'est appelée que depuis le module boutique", () => {
    const appelants = SOURCES.filter((f) => /rpc\(\s*'enable_stock_tracking'/.test(code(f))).map(relatif);
    expect(appelants).toEqual(['src/lib/shop.ts']);
  });

  it("aucun fichier hors des chemins autorisés ne manipule la politique d'inventaire", () => {
    const hors = SOURCES
      .filter((f) => !CHEMINS_AUTORISES.includes(relatif(f)))
      .filter((f) =>
        chargesEcrites(f).some((c) => /track_inventory|stock_counted_at/.test(c)) ||
        /rpc\(\s*'enable_stock_tracking'/.test(code(f))
      )
      .map(relatif);
    expect(hors).toEqual([]);
  });

  it("les autres modules qui touchent `shop_products` n'écrivent jamais la politique", () => {
    // Six modules lisent `shop_products` hors de `src/lib/shop.ts` (sitemap,
    // fiche produit, thèmes, checkout, estimation de port, CJ, checkout payé,
    // devis). Aucun n'a de raison d'écrire la politique d'inventaire, et le
    // jour où l'un le ferait, ce cliquet le nommerait.
    const autres = SOURCES.filter((f) =>
      /from\('shop_products'\)/.test(code(f)) && relatif(f) !== 'src/lib/shop.ts'
    );
    expect(autres.length).toBeGreaterThan(0);
    for (const f of autres) {
      expect(chargesEcrites(f).join('|'), relatif(f)).not.toMatch(/track_inventory|stock_counted_at/);
    }
  });
});

describe("ÉTAPE 6 — les allowlists génériques restent fermées", () => {
  // ÉTAPE 8, VOLET A — `for_sale` ADMIS consciemment : il ne déclare rien sur
  // un état antérieur, donc n'exige ni preuve ni acte dédié.
  // `track_inventory` et `stock_counted_at` restent exclus : eux affirment.
  //
  // DETTE 2 — LES DEUX ALLOWLISTS NE SONT PLUS IDENTIQUES, ET C'EST VOULU.
  // Le POST crée une ligne qui n'existe pas : y poser un `stock` initial
  // n'écrase rien. Le PATCH met à jour une ligne existante : y poser un
  // `stock` écrase le compteur SANS réveiller le trigger de l'étape 2, dont
  // la portée est `track_inventory` seul. Une seule des deux est dangereuse.
  const POST_ATTENDUE = "['name', 'description', 'price', 'currency', 'images', 'stock', 'published', 'position', 'for_sale']";
  const PATCH_ATTENDUE = "['name', 'description', 'price', 'currency', 'images', 'published', 'position', 'for_sale']";

  it('POST /api/shop/products : 9 champs, `stock` COMPRIS', () => {
    const s = readFileSync(join(SRC, 'app/api/shop/products/route.ts'), 'utf-8');
    expect(s).toContain(`const ALLOWED_PRODUCT_FIELDS = ${POST_ATTENDUE} as const;`);
  });

  it('PATCH /api/shop/products/[id] : 8 champs, `stock` RETIRÉ (dette 2)', () => {
    const s = readFileSync(join(SRC, 'app/api/shop/products/[id]/route.ts'), 'utf-8');
    expect(s).toContain(`const ALLOWED_PRODUCT_FIELDS = ${PATCH_ATTENDUE} as const;`);
  });

  it('les DEUX listes ne diffèrent que par `stock` — aucun autre écart', () => {
    // Ce qui rendrait la divergence dangereuse, ce serait qu'elle s'élargisse
    // sans que personne le décide. Ce contrôle borne l'écart à un champ.
    const champs = (p: string) =>
      readFileSync(join(SRC, p), 'utf-8')
        .match(/const ALLOWED_PRODUCT_FIELDS = \[([^\]]*)\]/)![1]
        .split(',').map((c) => c.trim().replace(/'/g, '')).filter(Boolean);

    const post = champs('app/api/shop/products/route.ts');
    const patch = champs('app/api/shop/products/[id]/route.ts');
    expect(post).toHaveLength(9);
    expect(patch).toHaveLength(8);
    expect(post.filter((c) => !patch.includes(c))).toEqual(['stock']);
    expect(patch.filter((c) => !post.includes(c))).toEqual([]);
  });

  it("`track_inventory` et `stock_counted_at` n'y figurent toujours pas", () => {
    for (const p of ['app/api/shop/products/route.ts', 'app/api/shop/products/[id]/route.ts']) {
      const bloc = readFileSync(join(SRC, p), 'utf-8').match(/const ALLOWED_PRODUCT_FIELDS = \[[^\]]*\]/)![0];
      expect(bloc, p).not.toContain('track_inventory');
      expect(bloc, p).not.toContain('stock_counted_at');
    }
  });

  it("`for_sale` y figure, dans les DEUX routes (cliquet retourné à l'étape 8, volet A)", () => {
    for (const p of ['app/api/shop/products/route.ts', 'app/api/shop/products/[id]/route.ts']) {
      const bloc = readFileSync(join(SRC, p), 'utf-8').match(/const ALLOWED_PRODUCT_FIELDS = \[[^\]]*\]/)![0];
      expect(bloc, p).toContain("'for_sale'");
    }
  });

  it("DETTE 2 — `stock` présent au POST, ABSENT du PATCH", () => {
    // Cliquet RETOURNÉ. Il exigeait `stock` dans les DEUX listes tant que la
    // dette 2 restait ouverte ; il tient désormais la règle qui la ferme.
    const bloc = (p: string) =>
      readFileSync(join(SRC, p), 'utf-8').match(/const ALLOWED_PRODUCT_FIELDS = \[[^\]]*\]/)![0];
    expect(bloc('app/api/shop/products/route.ts')).toContain("'stock'");
    expect(bloc('app/api/shop/products/[id]/route.ts')).not.toContain("'stock'");
  });

  it("le stock ne se modifie plus que par COMPTAGE ou par VENTE", () => {
    // Les trois seuls écrivains restants, tous en base et tous gardés :
    //   enable_stock_tracking      (étape 3) — pose stock_counted_at
    //   decrement_shop_stock_batch (étape 4) — atomique, respecte track_inventory
    //   cancel_shop_order                    — piloté par stock_decremented
    // Aucune route HTTP ne peut plus poser une valeur absolue sur une ligne
    // existante.
    const chargesEcrites = (file: string) =>
      [...code(file).matchAll(/\.(update|insert)\(\s*(\{[\s\S]*?\})/g)].map((m) => m[2]);
    const coupables = SOURCES
      .filter((f) => chargesEcrites(f).some((c) => /\bstock\s*:/.test(c) && !/stock_counted_at|track_inventory/.test(c)))
      .map(relatif);
    expect(coupables, 'aucun écrivain direct de `stock` en TypeScript').toEqual([]);
  });

  it("`for_sale` n'existe QUE sur les chemins du volet A — nulle part ailleurs", () => {
    // Cliquet RETOURNÉ à l'étape 8, volet A. Il ne disparaît pas : il change
    // de cible. Auparavant il interdisait la colonne partout ; il borne
    // désormais sa diffusion à l'ensemble exact des surfaces décidées.
    const AUTORISES = [
      'src/lib/shop.ts',                                  // types
      'src/app/api/shop/products/route.ts',               // allowlist POST
      'src/app/api/shop/products/[id]/route.ts',          // allowlist PATCH
      'src/app/api/shop/checkout/route.ts',               // garde d'achat
      'src/components/edit/ProductManager.tsx',           // UI marchand
      'src/lib/agent-tools/productResolution.ts',         // commentaire étape 8
      'src/lib/translations/fr.ts', 'src/lib/translations/en.ts',
      'src/lib/translations/es.ts', 'src/lib/translations/ar.ts',
      // ÉTAPE 8, VOLET D — deux entrées ajoutées CONSCIEMMENT. `set_for_sale`
      // se déclare dans `chat` et s'exécute dans `apply` ; aucun des deux ne
      // lit ni n'interprète la valeur — ils la transmettent à la route métier,
      // seule autorité. C'est précisément ce que ce cliquet sert à constater.
      'src/app/api/agent/[slug]/chat/route.ts',           // déclaration de l'outil
      'src/app/api/agent/[slug]/apply/route.ts',          // relais vers PATCH
      // DETTE 6b — une entrée ajoutée CONSCIEMMENT, sur demande de ce cliquet
      // lui-même : la correction 6b l'a fait rougir, ce qui est exactement son
      // office. La route d'estimation de livraison est une surface COMMERCIALE
      // publique ; elle n'écrit ni n'interprète `for_sale`, elle refuse de
      // servir un produit qui ne l'a pas. Le contrat de ce refus est verrouillé
      // par le cliquet dédié, juste en dessous.
      'src/app/api/shipping-estimate/route.ts',           // garde de devis
      // DETTE 6c — trois entrées ajoutées CONSCIEMMENT. L'achetabilité devait
      // atteindre les surfaces publiques : jusqu'ici `for_sale = false` n'était
      // honoré qu'au paiement, si bien qu'un produit retiré de la vente gardait
      // son bouton « Ajouter au panier » et n'était refusé qu'au checkout (409).
      // Aucune de ces trois-là ne REFUSE : elles lisent et transmettent.
      'src/components/edit/productDraft.ts',              // brouillon marchand
      'src/app/sites/[slug]/themes/shared.tsx',           // projection publique
      'src/app/sites/[slug]/produits/[id]/fetchProduct.ts', // fiche produit
      // ÉTAPE 3 du chantier des frontières — une entrée ajoutée CONSCIEMMENT.
      // `set_for_sale` figurait dans `chat/route.ts` (déjà déclaré ci-dessus)
      // au sein du groupe `productFields` ; ce groupe a été extrait dans une
      // primitive d'allowlists positives. Le NOM de l'outil a donc suivi le
      // code. Ce fichier ne lit, n'écrit ni n'interprète `for_sale` : il
      // déclare seulement à quels modes l'outil est proposé.
      'src/lib/agent-tools/toolCapabilities.ts',       // familles d'outils
    ];
    const hors = SOURCES.filter((f) => /for_sale/.test(code(f))).map(relatif)
      .filter((f) => !AUTORISES.includes(f));
    expect(hors, 'for_sale a fui hors du périmètre des volets A et D').toEqual([]);
  });

  it("les fichiers de l'agent TRANSMETTENT `for_sale`, ils ne le jugent jamais", () => {
    // Un outil IA qui déciderait lui-même de l'achetabilité serait une seconde
    // autorité à côté du checkout. Ces deux fichiers n'ont le droit que de
    // valider la FORME de la valeur reçue et de la relayer.
    for (const f of ['app/api/agent/[slug]/chat/route.ts', 'app/api/agent/[slug]/apply/route.ts']) {
      const s = code(join(SRC, f));
      expect(s, f).not.toMatch(/for_sale\s*!==\s*true/);
      expect(s, f).not.toMatch(/\.eq\('for_sale'/);
      expect(s, f).not.toMatch(/from\('shop_products'\)/);
    }
  });

  it("DETTE 6b — le devis de livraison exige `published` ET `for_sale`", () => {
    // Deux routes commerciales PUBLIQUES lisent `shop_products` : le checkout
    // et cette estimation. Elles portaient deux définitions différentes du
    // produit servable — `published` seul ici, la conjonction là-bas. Un
    // produit visible mais non achetable obtenait donc un délai de livraison,
    // et consommait un slot de la file CJ PARTAGÉE avec la création des
    // commandes fournisseur. Ce cliquet interdit la divergence de revenir.
    const s = code(join(SRC, 'app/api/shipping-estimate/route.ts'));
    expect(s).toContain(".eq('published', true)");
    expect(s).toContain(".eq('for_sale', true)");
    // Le refus reste FUSIONNÉ dans le 403 existant : aucun code, aucun
    // message, aucune journalisation propres à l'invendable.
    expect(s.match(/status: 403/g) ?? []).toHaveLength(1);
    expect(s).not.toMatch(/for_sale[\s\S]{0,200}logAnomaly/);
  });

  it("DETTE 6b — la garde précède le compteur et tout appel fournisseur", () => {
    const s = code(join(SRC, 'app/api/shipping-estimate/route.ts'));
    const garde = s.indexOf(".eq('for_sale', true)");
    expect(garde).toBeGreaterThan(-1);
    // Un garde posé après ces trois-là ne protégerait plus rien : la file CJ
    // serait déjà engagée, et le refus aurait déjà consommé la borne.
    expect(garde).toBeLessThan(s.indexOf('logAnomaly('));
    expect(garde).toBeLessThan(s.indexOf('cjCalculateFreight('));
    expect(garde).toBeLessThan(s.indexOf("from('shipping_cache')"));
  });

  it("la garde d'achat exige `published` ET `for_sale`, jamais l'un OU l'autre", () => {
    const s = code(join(SRC, 'app/api/shop/checkout/route.ts'));
    // Conjonction, en `!== true` sur les deux : une colonne manquante de la
    // lecture doit rendre le contrôle PLUS strict, jamais plus permissif.
    expect(s).toContain("sp.published !== true || sp.for_sale !== true");
    expect(s).not.toMatch(/sp\.published === false/);
    expect(s).not.toMatch(/sp\.for_sale === false/);
  });

  it("`for_sale` est bien LU par le checkout (une garde sur un champ non projeté est inerte)", () => {
    const s = code(join(SRC, 'app/api/shop/checkout/route.ts'));
    expect(s).toMatch(/\.select\('price, currency, published, for_sale, cj_vid'\)/);
  });

  it("aucun défaut applicatif de `for_sale` : le DEFAULT vit en base, et nulle part ailleurs", () => {
    // `ShopProductInput.for_sale` doit rester OPTIONNEL, et aucun `?? true`
    // ne doit exister : deux sources de vérité pour un même défaut divergent
    // toujours. Seule l'UI porte un état initial de formulaire.
    const shop = code(join(SRC, 'lib/shop.ts'));
    expect(shop).toContain('for_sale?: boolean;');
    expect(shop).not.toMatch(/for_sale\s*[:=]\s*(true|false)/);
    expect(shop).not.toMatch(/for_sale\s*\?\?/);

    const routes = SOURCES.filter((f) => /app\/api\//.test(relatif(f)));
    for (const f of routes) {
      expect(code(f), `${relatif(f)} ne doit pas reposer le défaut de for_sale`)
        .not.toMatch(/for_sale\s*[:=]\s*(true|false)/);
    }
  });
});

describe("ÉTAPE 5 — `checkStock` conserve sa lecture stricte", () => {
  it('le prédicat reste `!== false`, jamais `=== true`', () => {
    const s = readFileSync(join(SRC, 'lib/shop.ts'), 'utf-8');
    expect(s).toContain('if (product.track_inventory !== false && product.stock < line.quantity)');
    expect(code(join(SRC, 'lib/shop.ts'))).not.toContain('track_inventory === true');
  });
});

describe("ADMISSION — un seul point de décision pour toutes les écritures produit", () => {
  it('les deux routes produit passent par `requireProductOwner`', () => {
    for (const p of ['app/api/shop/products/[id]/route.ts', 'app/api/shop/products/[id]/inventory/route.ts']) {
      const s = readFileSync(join(SRC, p), 'utf-8');
      expect(s, p).toContain("import { requireProductOwner } from '@/lib/auth/require-product-owner'");
      expect(s, p).toContain('await requireProductOwner(req, id)');
    }
  });

  it("aucune des deux ne réimplémente `canTransact` ni `requireSiteOwnerById`", () => {
    for (const p of ['app/api/shop/products/[id]/route.ts', 'app/api/shop/products/[id]/inventory/route.ts']) {
      const s = code(join(SRC, p));
      expect(s, p).not.toContain('canTransact');
      expect(s, p).not.toContain('requireSiteOwnerById');
    }
  });

  it("`requireProductOwner` applique bien propriété PUIS admission, dans cet ordre", () => {
    const s = code(join(SRC, 'lib/auth/require-product-owner.ts'));
    expect(s.indexOf('requireSiteOwnerById')).toBeLessThan(s.indexOf('canTransact('));
    expect(s).toContain('status: 404');
    expect(s).toContain('status: 403');
  });
});

describe("LES SQL DES ÉTAPES 1 À 4 ET M1-7 NE SONT PAS TOUCHÉS PAR L'ÉTAPE 7", () => {
  const SQL = join(REPO, 'supabase/sql');
  const ATTENDUS: Array<[string, RegExp[]]> = [
    ['commerce_admission_orders_require_transacting_site.sql', [
      /create or replace function site_mode_is_transacting\(p_mode smallint\)/,
      /coalesce\(p_mode = any \(array\[2, 3\]::smallint\[\]\), false\)/,
    ]],
    ['shop_products_inventory_policy_step1_add_columns.sql', [
      /add column if not exists track_inventory boolean not null default true/,
      /add column if not exists stock_counted_at timestamptz/,
    ]],
    ['shop_products_inventory_policy_step2_recount_barrier.sql', [
      /create or replace function enforce_stock_tracking_requires_count\(\)/,
      /new\.stock_counted_at > old\.stock_counted_at/,
      /STOCK_TRACKING_REQUIRES_COUNT/,
    ]],
    ['shop_products_inventory_policy_step3_enable_tracking.sql', [
      /create or replace function enable_stock_tracking\(\s*\n\s*p_product_id uuid/,
      /stock_counted_at = clock_timestamp\(\)/,
    ]],
    ['shop_products_inventory_policy_step4_decrement_respects_tracking.sql', [
      /and track_inventory is true/,
      /if found and v_tracked is not true then/,
    ]],
  ];

  for (const [fichier, motifs] of ATTENDUS) {
    it(`${fichier} conserve ses invariants`, () => {
      const s = readFileSync(join(SQL, fichier), 'utf-8');
      for (const m of motifs) expect(s, `${fichier} :: ${m}`).toMatch(m);
    });
  }

  it('shop_products_for_sale_step1_add_column.sql conserve son contrat', () => {
    const s = readFileSync(join(SQL, 'shop_products_for_sale_step1_add_column.sql'), 'utf-8');
    expect(s).toMatch(/add column if not exists for_sale boolean not null default true/);
    // Aucune garde : la décision du volet A est qu'il n'en faut aucune.
    const code = s.replace(/--.*$/gm, '');
    expect(code).not.toMatch(/create trigger/i);
    expect(code).not.toMatch(/check\s*\(/i);
    expect(code).not.toMatch(/\bgrant\b/i);
    expect(code).not.toMatch(/\brevoke\b/i);
  });

  it("aucun SQL n'a réintroduit `mode != 1` ni de repli permissif", () => {
    for (const [fichier] of ATTENDUS) {
      const s = readFileSync(join(SQL, fichier), 'utf-8').replace(/--.*$/gm, '');
      expect(s, fichier).not.toMatch(/mode\s*(!=|<>)\s*1/);
    }
  });

  it("`security invoker` reste le choix uniforme (aucune fonction n'est un primitif de contournement)", () => {
    for (const [fichier] of ATTENDUS) {
      const s = readFileSync(join(SQL, fichier), 'utf-8');
      expect(s, fichier).not.toMatch(/security\s+definer/i);
    }
  });
});

describe("ÉTAPE 8, VOLET A — `for_sale = false` reste VISIBLE", () => {
  // L'invariant qui distingue `for_sale` d'une simple dépublication. Si une
  // seule surface de visibilité se mettait à filtrer sur `for_sale`, le volet
  // A perdrait tout son objet : retirer un produit de la vente le ferait de
  // nouveau disparaître, et il aurait suffi de dépublier.
  const SURFACES: Array<[string, string]> = [
    ['app/sites/[slug]/themes/shared.tsx', 'vitrine publique + aperçu propriétaire'],
    ['app/sites/[slug]/produits/[id]/fetchProduct.ts', 'fiche produit publique'],
    ['app/sitemap.ts', 'indexation SEO'],
  ];

  // DETTE 6c — CLIQUET AFFÛTÉ, PAS AFFAIBLI. Il interdisait toute MENTION de
  // `for_sale` sur ces surfaces ; c'était une approximation commode tant que
  // la vitrine ignorait le champ. Elle le lit désormais — pour décider du
  // BOUTON D'ACHAT, jamais de l'affichage. L'invariant réel, et le seul qui
  // ait toujours compté, est qu'aucune de ces surfaces ne FILTRE dessus :
  // retirer un produit de la vente ne doit pas le faire disparaître, sinon il
  // aurait suffi de le dépublier. C'est cela qui est constaté maintenant.
  for (const [f, role] of SURFACES) {
    it(`${role} ne FILTRE PAS sur for_sale`, () => {
      const s = code(join(SRC, f));
      expect(s, `${f} : la visibilité ne doit jamais dépendre de l'achetabilité`)
        .not.toMatch(/\.eq\(\s*['"]for_sale['"]/);
      expect(s, `${f} : aucune ligne ne doit être écartée sur l'achetabilité`)
        .not.toMatch(/filter\([^)]*for_sale/);
    });
  }

  it('`sitemap.ts` ne connaît toujours PAS `for_sale` : l’indexation ne dépend que de la visibilité', () => {
    expect(code(join(SRC, 'app/sitemap.ts'))).not.toMatch(/for_sale/);
  });

  it("ces surfaces filtrent toujours sur `published` (la visibilité, elle, n'a pas bougé)", () => {
    for (const [f] of SURFACES) {
      expect(code(join(SRC, f)), f).toMatch(/\.eq\('published', true\)/);
    }
  });

  it("SEUL le checkout REFUSE sur `for_sale`", () => {
    // On cible l'idiome de GARDE (`!== true`, fail-closed), pas toute mention
    // du champ : `ProductManager` affiche une étiquette « Pas en vente » via
    // `=== false`, ce qui est de l'affichage — un champ absent n'y déclenche
    // aucune étiquette alarmante, et rien n'y est refusé.
    const porteurs = SOURCES
      .filter((f) => /for_sale\s*!==\s*true/.test(code(f)))
      .map(relatif);
    expect(porteurs).toEqual(['src/app/api/shop/checkout/route.ts']);
  });
});

describe('DETTE 6c — un seul point de décision pour le bouton d’achat', () => {
  const THEMES = [
    'app/sites/[slug]/themes/StorefrontDense.tsx',
    'app/sites/[slug]/themes/FamilyFilter.tsx',
    'app/sites/[slug]/themes/EditorialShopSection.tsx',
    'app/sites/[slug]/themes/VifShopSection.tsx',
    'app/sites/[slug]/themes/NoirShopSection.tsx',
  ];

  it('les CINQ thèmes passent par `canAddToCart`, aucun ne recopie la condition', () => {
    // DEBT-001 avait déjà corrigé Noir et Vif, qui avaient omis une garde
    // qu'Editorial portait. Recopier un troisième terme dans cinq fichiers
    // aurait rejoué cette divergence à coup sûr.
    for (const f of THEMES) {
      const s = code(join(SRC, f));
      expect(s, f).toMatch(/canAddToCart\(p\)/);
      expect(s, `${f} : la condition ne doit plus être écrite en dur`)
        .not.toMatch(/p\.id && p\.priceNumber != null/);
    }
  });

  it('`canAddToCart` porte bien les TROIS termes, et lit l’achetabilité en `!== false`', () => {
    const fn = code(join(SRC, 'app/sites/[slug]/themes/shared.tsx'))
      .match(/export function canAddToCart\([\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/p\?\.id/);
    expect(fn).toMatch(/priceNumber/);
    expect(fn).toMatch(/forSale !== false/);
    expect(fn).not.toMatch(/forSale === true/);
  });

  it('`normalizeProduct` TRANSPORTE `forSale` — sans quoi 4 thèmes sur 5 seraient aveugles', () => {
    // Cette fonction reconstruit l'objet : tout champ non recopié est perdu.
    // Editorial, Noir, Vif et Aurora passent tous par elle.
    const fn = code(join(SRC, 'app/sites/[slug]/themes/shared.tsx'))
      .match(/export function normalizeProduct\([\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/forSale: raw\?\.forSale/);
  });

  it('la fiche produit applique la même règle', () => {
    const s = code(join(SRC, 'app/sites/[slug]/produits/[id]/ProductPageView.tsx'));
    expect(s).toMatch(/product\.forSale \?/);
  });

  it('la projection publique expose `forSale`, et jamais les champs internes', () => {
    const fn = code(join(SRC, 'app/sites/[slug]/themes/shared.tsx'))
      .match(/function mapShopProducts\([\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/forSale: p\.for_sale !== false/);
    for (const interdit of ['stock', 'published', 'track_inventory', 'stock_counted_at']) {
      expect(fn, interdit).not.toMatch(new RegExp(`\\b${interdit}\\b`));
    }
  });
});

describe("ÉTAPE 8, VOLET A — l'interface distingue visibilité et achetabilité", () => {
  const PM = code(join(SRC, 'components/edit/ProductManager.tsx'));

  it('deux cases distinctes, jamais dérivées l\'une de l\'autre', () => {
    expect(PM).toMatch(/checked=\{draft\.published\}/);
    expect(PM).toMatch(/checked=\{draft\.for_sale\}/);
    // Aucune expression ne doit lier les deux valeurs.
    expect(PM).not.toMatch(/for_sale:\s*draft\.published/);
    expect(PM).not.toMatch(/published:\s*draft\.for_sale/);
  });

  // DETTE 6c — ces deux décisions ont été EXTRAITES dans `productDraft.ts`
  // pour devenir vérifiables par comportement (voir productSaleAct.test.ts).
  // Les cliquets suivent le code : même exigence, nouveau fichier.
  const DRAFT = code(join(SRC, 'components/edit/productDraft.ts'));

  it('le payload de sauvegarde porte les deux champs', () => {
    const fn = DRAFT.match(/export function payloadFromDraft\([\s\S]*?\n\}/)![0];
    expect(fn).toContain('published: d.published');
    expect(fn).toContain('for_sale: d.for_sale');
    // ÉTAPE 7 — et toujours pas de stock.
    expect(fn).not.toMatch(/\bstock\b/);
    // Le composant ne recompose rien à côté.
    expect(PM).toContain('payloadFromDraft(draft)');
  });

  it("l'ouverture d'un produit lit `for_sale` en `!== false`, jamais en `=== true`", () => {
    const fn = DRAFT.match(/export function draftFromProduct\([\s\S]*?\n\}/)![0];
    expect(fn).toContain('p.for_sale !== false');
    expect(fn).not.toMatch(/for_sale === true/);
    expect(PM).toContain('draftFromProduct(p)');
  });

  it("DETTE 6c — le formulaire de création part de `for_sale: false` : vendre est un ACTE", () => {
    const empty = DRAFT.match(/export const EMPTY_DRAFT: ProductDraft = \{[\s\S]*?\};/)![0];
    expect(empty).toMatch(/for_sale:\s*false/);
    // La visibilité, elle, n'a pas bougé.
    expect(empty).toMatch(/published:\s*true/);
  });
});
