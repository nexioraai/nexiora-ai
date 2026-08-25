import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { MODE2_CHECKOUT_POLICY } from '../checkoutPolicy';
import { MODE3_CHECKOUT_POLICY } from '@/lib/mode3/checkoutPolicy';

// ============================================================
// M2-07 / M2-08 — LE CHEMIN DE PAIEMENT MODE 2 N'EXECUTE PLUS DE LOGIQUE
// FOURNISSEUR.
//
// CE QUI S'Y TROUVAIT. Deux choses, sur toute commande Mode 2 :
//   * une temporisation de 1,1 s, conditionnee au seul `previewOnly`, dont la
//     raison ecrite est « CJ limite a 1 req/s » -- un quota qu'une boutique
//     locale ne consomme jamais ;
//   * `buildSupplierGroups`, qui interroge `shop_products` a la recherche
//     d'un `cj_vid`.
//
// LE SECOND ETAIT INERTE, ET C'EST MESURE : un article `catalog-` est refuse
// en 409 par `admitsCatalogSupplier` AVANT ce bloc, et aucun `shop_products`
// d'un site Mode 2 ne peut porter de `cj_vid` (exclu des allowlists POST et
// PATCH, aucun GRANT PostgREST, 0 ligne en production). Le premier, lui,
// coutait reellement 1,1 s par commande.
//
// LA QUESTION EST NOMMEE, PAS EMPRUNTEE. `requiresResolvedShipping` existait
// et coincide -- mais elle demande si un devis est EXIGE POUR VENDRE, pas
// s'il faut ALLER LE CHERCHER. `modeCapabilities` dit deja qu'« un marchand
// pourrait vouloir des tarifs transporteur » : un tel marchand consulterait
// sans exiger. Reutiliser le champ voisin rendrait ce cas inexprimable.
// ============================================================

const RACINE = join(__dirname, '../../../..');
const CHECKOUT = readFileSync(join(RACINE, 'src/app/api/shop/checkout/route.ts'), 'utf-8');
const code = CHECKOUT.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

describe('M2-07 / M2-08 — la politique porte la reponse', () => {
  it('le denominateur est reel — le source du checkout a bien ete lu', () => {
    expect(code.length).toBeGreaterThan(5000);
    expect(code).toContain('MODE2_CHECKOUT_POLICY');
  });

  it('le Mode 2 n’interroge aucun fournisseur pour la livraison', () => {
    expect(MODE2_CHECKOUT_POLICY.consultsSupplierShipping).toBe(false);
  });

  it('le Mode 3, si', () => {
    expect(MODE3_CHECKOUT_POLICY.consultsSupplierShipping).toBe(true);
  });

  it('🔴 la question reste DISTINCTE de `requiresResolvedShipping`', () => {
    // Ce test ne verifie pas que les deux champs sont egaux -- il verifie
    // qu'ils sont DEUX. Les fusionner rendrait inexprimable un marchand qui
    // consulte un transporteur sans exiger de devis.
    const champs = Object.keys(MODE2_CHECKOUT_POLICY);
    expect(champs).toContain('requiresResolvedShipping');
    expect(champs).toContain('consultsSupplierShipping');
  });
});

describe('M2-07 — 🔴 la temporisation de quota est gardee par le domaine', () => {
  it('elle depend desormais de la politique', () => {
    expect(code).toMatch(/policy\.consultsSupplierShipping && !previewOnly/);
  });

  it('🔴 aucune temporisation inconditionnelle ne subsiste', () => {
    expect(code).not.toMatch(/if \(!previewOnly\) await new Promise/);
  });
});

describe('M2-08 — 🔴 le devis fournisseur est garde par le domaine', () => {
  it('🔴 la garde precede l’appel, elle ne le suit pas', () => {
    const garde = code.indexOf('consultsSupplierShipping && countryCode');
    const appel = code.indexOf('buildSupplierGroups(items');
    expect(garde, 'garde absente').toBeGreaterThan(-1);
    expect(appel, 'appel absent').toBeGreaterThan(-1);
    expect(garde).toBeLessThan(appel);
  });
});

describe('M2-07 / M2-08 — 🔒 non-regression : le forfait reste la valeur Mode 2', () => {
  it('`shippingAmount` part du forfait avant toute consultation', () => {
    // En sautant le bloc, le Mode 2 conserve exactement ce qu'il obtenait :
    // le devis retombait toujours sur `flat`, valeur deja portee.
    expect(code).toMatch(/const flat = Number\(site\.shipping_flat\)/);
    expect(code).toMatch(/let shippingAmount = flat/);
  });

  it('le devis n’ecrase le forfait que s’il n’est PAS `flat` — regle inchangee', () => {
    expect(code).toMatch(/quote\.source !== 'flat' && quote\.amount > 0/);
  });

  it('🔒 le Mode 3 conserve ses deux exigences', () => {
    expect(MODE3_CHECKOUT_POLICY.requiresResolvedShipping).toBe(true);
    expect(MODE3_CHECKOUT_POLICY.requiresDeliverableCountry).toBe(true);
    expect(MODE2_CHECKOUT_POLICY.requiresResolvedShipping).toBe(false);
    expect(MODE2_CHECKOUT_POLICY.requiresDeliverableCountry).toBe(false);
  });

  it('🔒 la commission Mode 2 reste nulle, quels que soient les montants', () => {
    // Les deux fonctions ignorent leurs parametres A DESSEIN cote Mode 2 ;
    // on les leur passe quand meme, pour exercer le contrat partage et non
    // l'implementation.
    expect(MODE2_CHECKOUT_POLICY.commission(1000)).toBe(0);
    expect(MODE2_CHECKOUT_POLICY.applicationFee(500, 20, 0)).toBe(0);
  });
});
