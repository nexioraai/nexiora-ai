import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ============================================================
// ÉTAPE 7 — À QUI L'OUTIL D'INVENTAIRE EST-IL PROPOSÉ.
//
// Test structurel (le composant et `getToolsForSite` ne sont pas exportés ;
// même méthodologie que OrderManager.processingVisibility.test.ts).
//
// L'enjeu n'est pas cosmétique : proposer un outil de comptage à une vitrine
// Mode 1 serait une promesse fausse — la route le refuserait en 403 après que
// le marchand a cliqué « approuver ». La frontière de l'outil doit être la
// MÊME que celle de l'admission au commerce (`canTransact` : {2, 3}).
// ============================================================

const CHAT = readFileSync(join(__dirname, '../../chat/route.ts'), 'utf-8');
const APPLY = readFileSync(join(__dirname, '../route.ts'), 'utf-8');

describe('count_product_stock — exposition par mode', () => {
  it("l'outil est déclaré dans allTools", () => {
    expect(CHAT).toMatch(/name: 'count_product_stock',/);
  });

  it("il prend `product_name`, JAMAIS un identifiant de produit", () => {
    const bloc = CHAT.match(/name: 'count_product_stock',[\s\S]*?required: \[[^\]]*\],/)![0];
    expect(bloc).toMatch(/product_name:\s*\{\s*type:\s*'string'/);
    expect(bloc).toMatch(/units:\s*\{\s*type:\s*'integer'/);
    expect(bloc).not.toMatch(/product_id/);
    expect(bloc).toMatch(/required: \['product_name', 'units', 'reason'\]/);
  });

  it("le groupe `inventory` ne contient QUE cet outil", () => {
    expect(CHAT).toMatch(/const inventory = \['count_product_stock'\];/);
  });

  it('Mode 2 le reçoit', () => {
    const bloc = CHAT.match(/if \(mode === 2\) \{[\s\S]*?\n  \}/)![0];
    expect(bloc).toContain('...inventory');
  });

  it('Mode 3 le reçoit', () => {
    const bloc = CHAT.match(/if \(mode === 3\) \{[\s\S]*?\n  \}/)![0];
    expect(bloc).toContain('...inventory');
  });

  it("Mode 1 ne le reçoit JAMAIS — un stock n'existe pas pour une vitrine", () => {
    const bloc = CHAT.match(/if \(mode === 1\) \{[\s\S]*?\n  \}/)![0];
    expect(bloc).not.toContain('inventory');
    expect(bloc).not.toContain('count_product_stock');
  });

  it("il est dans l'allowlist d'exécution de /apply (sans quoi il serait refusé)", () => {
    const bloc = APPLY.match(/const ALLOWED_TOOLS = new Set\(\[[\s\S]*?\]\);/)![0];
    expect(bloc).toContain("'count_product_stock'");
  });
});

// ============================================================
// ÉTAPE 8, VOLET D — CLIQUET RETOURNÉ.
//
// Il interdisait `set_price`, `set_currency`, `set_for_sale` et `for_sale`
// dans chat et apply, tant que le volet D n'était pas ouvert. Il ne disparaît
// pas : il change de cible et vérifie désormais que les trois outils sont
// déclarés EXACTEMENT là où ils doivent l'être, et nulle part ailleurs.
// ============================================================
describe('ÉTAPE 8, VOLET D — les trois outils produit', () => {
  const OUTILS = ['set_price', 'set_currency', 'set_for_sale'] as const;

  for (const nom of OUTILS) {
    it(`\`${nom}\` est déclaré dans allTools ET dans l'allowlist d'exécution`, () => {
      expect(CHAT).toMatch(new RegExp(`name: '${nom}',`));
      const bloc = APPLY.match(/const ALLOWED_TOOLS = new Set\(\[[\s\S]*?\]\);/)![0];
      expect(bloc).toContain(`'${nom}'`);
    });
  }

  it('le groupe `productFields` ne contient QUE ces trois outils', () => {
    expect(CHAT).toMatch(/const productFields = \['set_price', 'set_currency', 'set_for_sale'\];/);
  });

  it('chacun prend `product_name`, JAMAIS un identifiant de produit', () => {
    for (const nom of OUTILS) {
      const bloc = CHAT.match(new RegExp(`name: '${nom}',[\\s\\S]*?required: \\[[^\\]]*\\],`))![0];
      expect(bloc, nom).toMatch(/product_name:\s*\{\s*type:\s*'string'/);
      expect(bloc, nom).not.toMatch(/product_id/);
      expect(bloc, nom).toMatch(/required: \['product_name',/);
    }
  });

  it('Modes 2 et 3 les reçoivent ; le Mode 1 JAMAIS', () => {
    const m1 = CHAT.match(/if \(mode === 1\) \{[\s\S]*?\n  \}/)![0];
    const m2 = CHAT.match(/if \(mode === 2\) \{[\s\S]*?\n  \}/)![0];
    const m3 = CHAT.match(/if \(mode === 3\) \{[\s\S]*?\n  \}/)![0];
    expect(m2).toContain('...productFields');
    expect(m3).toContain('...productFields');
    // Une vitrine n'a pas de shop_products : `canTransact` le refuserait de
    // toute façon en 403, et proposer un outil voué au refus est une promesse
    // fausse.
    expect(m1).not.toContain('productFields');
    for (const nom of OUTILS) expect(m1, nom).not.toContain(nom);
  });

  it("`for_sale` n'apparaît dans chat/apply QUE via l'outil et son champ", () => {
    // Le cliquet d'origine interdisait toute mention. Il borne désormais :
    // aucun de ces deux fichiers ne doit lire, écrire ou interpréter
    // `for_sale` autrement qu'en le transmettant à la route métier.
    expect(APPLY).not.toMatch(/for_sale\s*!==\s*true/);
    expect(APPLY).not.toMatch(/\.eq\('for_sale'/);
    expect(CHAT).not.toMatch(/\.eq\('for_sale'/);
  });
});

describe('NON-RÉGRESSION ÉTAPE 0 — le Mode 2 ne récupère pas les outils produit jsonb', () => {
  it('`manualProducts` reste réservé au Mode 1', () => {
    const m2 = CHAT.match(/if \(mode === 2\) \{[\s\S]*?\n  \}/)![0];
    expect(m2).not.toContain('manualProducts');
    const m1 = CHAT.match(/if \(mode === 1\) \{[\s\S]*?\n  \}/)![0];
    expect(m1).toContain('...manualProducts');
  });
});

describe("NON-RÉGRESSION — le harnais de lecture de l'agent n'a pas été touché", () => {
  it("CURRENT SITE STATE ne contient toujours AUCUN produit shop_products", () => {
    const bloc = CHAT.match(/CURRENT SITE STATE[\s\S]{0,2000}/)![0];
    expect(bloc).not.toContain('shop_products');
    expect(bloc).not.toContain('track_inventory');
  });

  it("aucun outil de LECTURE n'a été ajouté (tous les outils restent des actes)", () => {
    for (const interdit of ['list_products', 'get_products', 'read_products', 'search_products']) {
      expect(CHAT).not.toContain(interdit);
      expect(APPLY).not.toContain(interdit);
    }
  });

  it("le volet D n'a introduit AUCUNE route API nouvelle", () => {
    // Les trois outils passent par `PATCH /api/shop/products/[id]`, qui
    // existait déjà et dont l'allowlist porte déjà price/currency/for_sale.
    // Une route sœur n'aurait fait que dupliquer requireProductOwner.
    expect(APPLY).toMatch(/\/api\/shop\/products\/\$\{resolved\.product\.id\}`/);
    expect(APPLY).not.toMatch(/\/set-price|\/set-currency|\/for-sale/);
  });
});

// ============================================================
// ÉTAPE 8, VOLET B — LE CATALOGUE MODE 1 NE S'ADRESSE PLUS PAR INDEX.
//
// Cliquets structurels : ils rendent visible au premier `vitest run` toute
// tentative de revenir au ciblage par position, de dupliquer la règle de
// résolution, ou de faire déborder ces outils hors du Mode 1.
// ============================================================
const CARD = readFileSync(join(__dirname, '../../../../../../components/edit/AIAgentChat.tsx'), 'utf-8');

describe('ÉTAPE 8, VOLET B — `propose_product_remove` / `_update`', () => {
  const CIBLES = ['propose_product_remove', 'propose_product_update'] as const;

  for (const nom of CIBLES) {
    it(`\`${nom}\` prend \`product_name\` et PLUS \`index\``, () => {
      const bloc = CHAT.match(new RegExp(`name: '${nom}',[\\s\\S]*?required: \\[[^\\]]*\\],`))![0];
      expect(bloc, nom).toMatch(/product_name:\s*\{\s*type:\s*'string'/);
      expect(bloc, nom).not.toMatch(/\bindex\b/);
      expect(bloc, nom).toMatch(/required: \['product_name',/);
    });
  }

  it("`propose_product_add` reste INCHANGÉ : aucun ciblage, aucune unicité", () => {
    const bloc = CHAT.match(/name: 'propose_product_add',[\s\S]*?required: \[[^\]]*\],/)![0];
    expect(bloc).toMatch(/required: \['name', 'reason'\]/);
    expect(bloc).not.toMatch(/product_name/);
    expect(bloc).not.toMatch(/\bindex\b/);
  });

  it('les deux branches de /apply résolvent par nom et refusent toute ambiguïté', () => {
    for (const nom of CIBLES) {
      const branche = APPLY.match(new RegExp(`case '${nom}': \\{[\\s\\S]*?\\n      \\}`))![0];
      expect(branche, nom).toContain('resolveProductByName(current, product_name)');
      expect(branche, nom).toContain('resolutionMessage(resolved)');
      expect(branche, nom).toMatch(/status: resolved\.reason === 'not_found' \? 404 : 409/);
      // L'index ne peut plus venir de l'appelant : il est RECALCULÉ.
      expect(branche, nom).toContain('current.indexOf(resolved.product)');
      expect(branche, nom).not.toMatch(/tool_input\.index|const \{ index \}/);
    }
  });

  it("AUCUNE seconde implémentation de résolution n'a été écrite dans /apply", () => {
    // Décision D1 : une seule règle, partagée. Une résolution locale
    // dupliquerait le refus d'ambiguïté — la divergence entre implémentations
    // que requireProductOwner a servi à défaire.
    const code = APPLY.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/toLocaleLowerCase\(\)/);
    expect(code).not.toMatch(/\.filter\([^)]*normalize/);
  });

  it('ces outils restent réservés au Mode 1', () => {
    const m1 = CHAT.match(/if \(mode === 1\) \{[\s\S]*?\n  \}/)![0];
    const m2 = CHAT.match(/if \(mode === 2\) \{[\s\S]*?\n  \}/)![0];
    const m3 = CHAT.match(/if \(mode === 3\) \{[\s\S]*?\n  \}/)![0];
    expect(m1).toContain('...manualProducts');
    expect(m2).not.toContain('manualProducts');
    expect(m3).not.toContain('manualProducts');
    expect(CHAT).toMatch(/const manualProducts = \['propose_product_add', 'propose_product_remove', 'propose_product_update'\];/);
  });

  it("le catalogue M1 reste `sites.products` : aucune écriture `shop_products` dans /apply", () => {
    const code = APPLY.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/from\('shop_products'\)/);
  });
});

describe("ÉTAPE 8, VOLET B — la carte d'approbation montre le NOM", () => {
  it('`propose_product_remove` affiche `product_name`, plus aucun `#index`', () => {
    const bloc = CARD.match(/case 'propose_product_remove':[\s\S]*?case 'propose_product_update':/)![0];
    expect(bloc).toContain('input.product_name');
    expect(bloc).not.toContain('input.index');
    expect(bloc).not.toContain('#{input');
  });

  it('`propose_product_update` affiche `product_name` ET le champ visé', () => {
    const bloc = CARD.match(/case 'propose_product_update':[\s\S]*?case '/)![0];
    expect(bloc).toContain('input.product_name');
    expect(bloc).toContain('input.field');
    expect(bloc).not.toContain('input.index');
  });

  it("le harnais d'approbation n'a PAS été touché", () => {
    // Seuls deux résumés visuels changent. `hasPendingTools` reste le garde
    // qui interdit tout outil de lecture, et il ne doit pas bouger.
    expect(CARD).toMatch(/const hasPendingTools = \(\): boolean => \{/);
    expect(CARD).toMatch(/b\.type === 'tool_use' && toolStates\[b\.id\]\?\.status === 'pending'/);
  });
});

// ============================================================
// DETTE 4 (volet gallery) — CLIQUETS.
// Rendent visible au premier `vitest run` tout retour au ciblage par
// position, toute duplication de la règle de résolution, ou tout débordement
// hors du Mode 1/2.
// ============================================================
describe('DETTE 4 — `propose_gallery_remove` cible par URL', () => {
  it('prend `image_url` et PLUS `index`', () => {
    const bloc = CHAT.match(/name: 'propose_gallery_remove',[\s\S]*?required: \[[^\]]*\],/)![0];
    expect(bloc).toMatch(/image_url:\s*\{\s*type:\s*'string'/);
    expect(bloc).not.toMatch(/\bindex\b/);
    expect(bloc).toMatch(/required: \['image_url', 'reason'\]/);
  });

  it('`propose_gallery_clear` reste INCHANGÉ : aucun ciblage', () => {
    const bloc = CHAT.match(/name: 'propose_gallery_clear',[\s\S]*?required: \[[^\]]*\],/)![0];
    expect(bloc).toMatch(/required: \['reason'\]/);
    expect(bloc).not.toMatch(/image_url|\bindex\b/);
  });

  it('la branche /apply résout par URL et refuse toute ambiguïté', () => {
    const branche = APPLY.match(/case 'propose_gallery_remove': \{[\s\S]*?\n      \}/)![0];
    expect(branche).toContain('resolveGalleryImage(current, image_url)');
    expect(branche).toContain('galleryResolutionMessage(resolved)');
    expect(branche).toMatch(/status: resolved\.reason === 'not_found' \? 404 : 409/);
    // La position est RECALCULÉE, jamais fournie par l'appelant.
    expect(branche).toContain('resolved.index');
    expect(branche).not.toMatch(/tool_input\.index|const \{ index \}/);
  });

  it('`propose_gallery_clear` n\'a pas été transformé en suppression par URL', () => {
    const branche = APPLY.match(/case 'propose_gallery_clear': \{[\s\S]*?\n      \}/)![0];
    expect(branche).toContain('updates.gallery = []');
    expect(branche).not.toContain('resolveGalleryImage');
  });

  it("la résolution d'URL n'est PAS celle des noms de produit", () => {
    // `resolveProductByName` passe en minuscules — correct pour un nom tapé
    // par un humain, DANGEREUX pour une URL : `/A.jpg` y trouverait `/a.jpg`
    // et supprimerait une image non désignée.
    const branche = APPLY.match(/case 'propose_gallery_remove': \{[\s\S]*?\n      \}/)![0];
    expect(branche).not.toContain('resolveProductByName');
    const RESOLVER = readFileSync(join(__dirname, '../../../../../../lib/agent-tools/galleryResolution.ts'), 'utf-8');
    expect(RESOLVER).not.toMatch(/toLocaleLowerCase|toLowerCase/);
  });

  it('ces outils restent réservés aux Modes 1 et 2', () => {
    const m1 = CHAT.match(/if \(mode === 1\) \{[\s\S]*?\n  \}/)![0];
    const m2 = CHAT.match(/if \(mode === 2\) \{[\s\S]*?\n  \}/)![0];
    const m3 = CHAT.match(/if \(mode === 3\) \{[\s\S]*?\n  \}/)![0];
    expect(m1).toContain('...content');
    expect(m2).toContain('...content');
    expect(m3).not.toContain('...content');
    expect(CHAT).toMatch(/'propose_gallery_remove', 'propose_gallery_clear'\]/);
  });

  it('la carte d\'approbation montre l\'URL, plus aucun `#index`', () => {
    const bloc = CARD.match(/case 'propose_gallery_remove':[\s\S]*?case 'propose_gallery_clear':/)![0];
    expect(bloc).toContain('input.image_url');
    expect(bloc).not.toContain('input.index');
    expect(bloc).not.toContain('#{input');
  });

  it('`testimonials` n\'a PAS été touché — il reste adressé par index', () => {
    // Volet suivant du plan. Le confondre avec `gallery` ici serait sortir du
    // périmètre : sa clé n'est pas unique, et l'arbitrage retenu est
    // l'injection dans CURRENT SITE STATE, pas la résolution par valeur.
    for (const outil of ['propose_testimonial_remove', 'propose_testimonial_update']) {
      const bloc = CHAT.match(new RegExp(`name: '${outil}',[\\s\\S]*?required: \\[[^\\]]*\\],`))![0];
      expect(bloc, outil).toMatch(/index:\s*\{\s*type:\s*'integer'/);
    }
  });
});
