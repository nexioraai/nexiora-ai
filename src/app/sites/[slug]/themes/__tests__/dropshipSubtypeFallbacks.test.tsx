import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { showsVisitorCatalogSearch } from '../catalogSearchVisibility';
import ProductModal from '../ProductModal';
import CartShell from '../CartShell';
import { getCartLabels } from '../cartLabels';

// ============================================================
// LOT 1 / L1-02 + L1-05 -- LES QUATRE REPLIS VERS `reseller`.
//
// CE QUI EXISTAIT. Quatre couches transformaient un sous-type ABSENT en
// `reseller`, chacune pour son compte, aucune ne consultant les autres :
//   page.tsx / preview  `dropshipType={site.dropship_type || 'reseller'}`
//   AuroraTheme         idem
//   CatalogSearch       `dropshipType = 'reseller'` (defaut de parametre)
// et trois d'entre elles montaient la barre de recherche sur une NEGATION
// (`!== 'pod_brand'`), qui laissait donc passer l'absence.
//
// LE PLUS DANGEREUX ETAIT LE MOINS VISIBLE. Le defaut de parametre de
// `CatalogSearch` pilote `isPodCustom`, donc le televerseur de design. La
// mutation `dropshipType = 'pod_custom'` a survecu aux 2973 tests : aucun ne
// le regardait. Ce fichier existe d'abord pour cela.
// ============================================================

const RACINE = join(__dirname, '../../../../../..');
const lire = (p: string) => readFileSync(join(RACINE, p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const MONTAGES = [
  'src/app/sites/[slug]/page.tsx',
  'src/app/preview/[slug]/page.tsx',
  'src/app/sites/[slug]/themes/AuroraTheme.tsx',
] as const;

// ------------------------------------------------------------
describe('LOT 1 / L1-02 -- la regle de montee de la barre de recherche', () => {
  it.each(['reseller', 'pod_custom'])('%s -> la vitrine expose la recherche catalogue', (t) => {
    expect(showsVisitorCatalogSearch(t)).toBe(true);
  });

  it('pod_brand ne l\'expose pas : ses produits viennent des designs du marchand', () => {
    expect(showsVisitorCatalogSearch('pod_brand')).toBe(false);
  });

  it.each([null, undefined, '', 'RESELLER', 'pod-brand', 'legacy_mode_x', 3, {}, []])(
    '%s -> AUCUNE barre de recherche : allowlist positive, fail-closed',
    (v) => {
      expect(showsVisitorCatalogSearch(v)).toBe(false);
    }
  );

  it('la regle est la MEME que celle qui charge les selections (shared.tsx)', () => {
    // La capacite fantome mesuree en production venait exactement de leur
    // divergence : la barre etait montee (negation) alors que le chargement
    // des selections, lui, etait deja une liste positive et ne rendait rien.
    const shared = sansCommentaires(lire('src/app/sites/[slug]/themes/shared.tsx'));
    const [, condition] = shared.match(/data\.mode === 3 && \(([^)]*)\)/) ?? [];
    expect(condition).toBeTruthy();
    for (const t of ['reseller', 'pod_custom']) {
      expect(condition).toContain(`'${t}'`);
      expect(showsVisitorCatalogSearch(t)).toBe(true);
    }
    expect(condition).not.toContain("'pod_brand'");
    expect(showsVisitorCatalogSearch('pod_brand')).toBe(false);
  });
});

// ------------------------------------------------------------
describe('LOT 1 / L1-02 -- AUCUN repli silencieux ne subsiste dans les couches appelantes', () => {
  it.each([...MONTAGES, 'src/app/sites/[slug]/themes/CatalogSearch.tsx'])(
    '%s ne fabrique plus de sous-type',
    (f) => {
      const src = sansCommentaires(lire(f));
      expect(src).not.toMatch(/dropship_?[Tt]ype\s*\|\|\s*'/);
      expect(src).not.toMatch(/dropship_?[Tt]ype\s*\?\?\s*'/);
    }
  );

  it.each(MONTAGES)('%s consulte l\'autorite, jamais sa propre negation', (f) => {
    const src = sansCommentaires(lire(f));
    expect(src).toContain('showsVisitorCatalogSearch(site.dropship_type)');
    expect(src).not.toMatch(/dropship_type\s*!==\s*'pod_brand'/);
  });

  it('CatalogSearch n\'a PLUS de valeur par defaut pour `dropshipType` -- la mutation C5 meurt ici', () => {
    const src = sansCommentaires(lire('src/app/sites/[slug]/themes/CatalogSearch.tsx'));
    const [, signature] = src.match(/export default function CatalogSearch\(\{([^}]*)\}/) ?? [];
    expect(signature).toBeTruthy();
    // La signature contient `dropshipType`, et SANS `=` derriere.
    expect(signature).toMatch(/\bdropshipType\b/);
    expect(signature).not.toMatch(/\bdropshipType\s*=/);
  });

  it('le televerseur de design reste commande par une egalite STRICTE', () => {
    const src = sansCommentaires(lire('src/app/sites/[slug]/themes/CatalogSearch.tsx'));
    expect(src).toContain("isPodCustom={dropshipType === 'pod_custom'}");
  });

  it('l\'autorite de rendu n\'importe aucune des trois autorites voisines', () => {
    // La coincidence de valeur n'est pas une dependance (doctrine etape A) :
    // ces regles doivent pouvoir diverger sans se contredire.
    const src = lire('src/app/sites/[slug]/themes/catalogSearchVisibility.ts');
    expect(src).not.toMatch(/^import /m);
  });
});

// ------------------------------------------------------------
describe('LOT 2 / DEBT-048 -- LES TROIS MONTAGES PORTENT LA MEME GARDE', () => {
  // CE TEST A CHANGE DE CAMP, ET C'ETAIT SA FONCTION. Au LOT 1 il verrouillait
  // un CONSTAT -- « AuroraTheme n'a toujours pas sa garde de mode » -- pour
  // qu'une correction de repli ne ferme pas DEBT-048 par effet de bord, sans
  // examen. Le LOT 2 l'a examinee et corrigee : le constat est reecrit
  // sciemment, en garantie.
  it('les trois surfaces exigent `mode === 3` avant de consulter le sous-type', () => {
    for (const f of [...MONTAGES]) {
      expect(sansCommentaires(lire(f)), f).toMatch(
        /site\.mode === 3 && showsVisitorCatalogSearch\(site\.dropship_type\)/
      );
    }
  });

  it('la regle de rendu ne connait deliberement pas le mode', () => {
    const src = sansCommentaires(lire('src/app/sites/[slug]/themes/catalogSearchVisibility.ts'));
    expect(src).not.toMatch(/\bmode\b/);
  });
});

// ------------------------------------------------------------
describe('LOT 1 / L1-02 -- COMPORTEMENT REEL : le televerseur de design', () => {
  const PRODUIT = {
    id: 'cp-1', supplier_id: 'printful', supplier_product_id: 'sp-1',
    name: 'T-Shirt', description: 'Un t-shirt', price: 20,
    images: ['https://img.test/1.png'], shipping_days_min: 5, shipping_days_max: 10,
    warehouse_country: 'US',
  };

  function rendre(isPodCustom: boolean | undefined) {
    return renderToStaticMarkup(
      <CartShell primary="#111111" labels={getCartLabels('fr')} slug="boutique" mode={3} products={[]} shippingFlat={0}>
        <ProductModal product={PRODUIT as never} primary="#111111" lang="fr" theme="editorial" onClose={() => {}} slug="boutique" isPodCustom={isPodCustom} />
      </CartShell>
    );
  }

  // `DesignCanvas` est la surface reellement observable : c'est elle que
  // `isPodCustom` monte ou non. On mesure le rendu, pas la presence du prop.
  const marqueurCanvas = /design|upload|televers/i;

  it('isPodCustom=true -> la surface de design est rendue', () => {
    expect(marqueurCanvas.test(rendre(true))).toBe(true);
  });

  it('isPodCustom=false -> aucune surface de design', () => {
    expect(marqueurCanvas.test(rendre(false))).toBe(false);
  });

  it('isPodCustom ABSENT (le cas exact produit par un sous-type absent) -> aucune surface de design', () => {
    expect(marqueurCanvas.test(rendre(undefined))).toBe(false);
  });
});
