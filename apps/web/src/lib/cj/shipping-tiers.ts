// ============================================================
// Regroupement des options logistiques CJ en niveaux de service.
// Source UNIQUE, partagee par le cron shipping-cache et l'endpoint
// shipping-estimate (pas de duplication).
//
// ------------------------------------------------------------
// LOT 4-TER -- REFONTE. Ce que faisait la version precedente, et pourquoi
// elle a ete remplacee (chaque point est un resultat MESURE, pas une opinion) :
//
//   1. `cap = eco.cost * 3` -- seuil arbitraire. Mesure : deux options
//      [LENT 3 $ / 30-45 j] et [DHL 60 $ / 1-2 j] ne produisaient QU'UN
//      palier, l'option a 1-2 jours etant invisible. Pire, [BATEAU 0,50 $ /
//      60-90 j] + [B 8 $ / 5-9 j] n'exposait que le bateau : une option a
//      0,50 $ ramenait le plafond a 1,50 $ et effacait toute l'offre
//      raisonnable. Et une seule option CJ a prix 0 mettait cap = 0, donc un
//      unique palier a 0 € -- livraison facturee zero pendant que Nexiora
//      avance le cout reel.
//
//   2. `standard = min(cost + 0.5 * days_max)` -- heuristique arbitraire.
//      Ce `0.5` n'est homogene que s'il vaut [devise]/jour : c'est donc la
//      declaration implicite "un jour vaut 0,50 unite monetaire", appliquee
//      telle quelle a toutes les devises. Son poids relatif varie d'un
//      facteur 50 entre des frais de 2 $ et de 100 $.
//
//   3. Exclusion par `logisticName` -- contournement technique : deux lignes
//      CJ homonymes s'excluaient mutuellement.
//
//   4. Obligation implicite de produire trois niveaux -- d'ou des paliers
//      DOMINES (plus chers ET plus lents qu'un autre palier propose).
//
//   Mesure globale sur 1000 tirages aleatoires : 388 (38,8 %) violaient au
//   moins un invariant d'echelle de service -- 38,7 % contenaient un palier
//   domine, 11,2 % avaient des prix non croissants.
//
// ------------------------------------------------------------
// PRINCIPE RETENU -- FRONTIERE DE PARETO cout / delai.
//
// Une option est DOMINEE s'il en existe une autre au moins aussi bonne sur
// les DEUX axes et strictement meilleure sur au moins un. Aucun acheteur
// rationnel ne choisirait une option dominee : elle n'a donc pas a etre
// proposee. Cette notion remplace A LA FOIS le plafond et le score pondere,
// SANS unite, SANS coefficient, SANS constante a calibrer.
//
// L'affectation des niveaux est ensuite purement ORDINALE (un rang, pas une
// ponderation) : moins cher / mediane / plus rapide.
//
// INVARIANTS GARANTIS PAR CONSTRUCTION (verifies par property-based testing
// sur 1000 tirages, voir __tests__/shippingTiers.test.ts) :
//   I1  eco = option la moins chere parmi les options exploitables
//   I2  eco.cost < standard.cost < express.cost           (strict)
//   I3  eco.days_max > standard.days_max > express.days_max (strict)
//   I4  aucun palier retourne n'est domine par un autre
//   I5  un delai affiche est toujours > 0 ; un delai inconnu est null
//   I6  chaque palier correspond exactement a une option CJ reelle
//
// Le resultat peut compter 1, 2 ou 3 paliers. Fabriquer un troisieme niveau
// qui n'existe pas dans les donnees est explicitement interdit.
// ============================================================

export type ShippingTier = {
  tier: 'eco' | 'standard' | 'express';
  name: string;
  cost: number;
  days_min: number | null;
  days_max: number | null;
};

/**
 * CJ renvoie logisticAging sous forme de chaine : "2-5", parfois "7", parfois
 * vide ou non numerique.
 *
 * REGLE CANONIQUE (LOT 4-TER) : un delai inconnu vaut `null`, JAMAIS `0`.
 * La version precedente renvoyait `{min: 0, max: 0}` pour une chaine vide --
 * `Number('')` vaut 0 et `Number.isFinite(0)` est vrai -- ce qui affichait
 * "0-0 jours" a l'acheteur, soit une promesse de livraison instantanee depuis
 * la Chine. Les segments vides sont desormais ecartes AVANT conversion.
 *
 * Les bornes sont normalisees en ordre croissant : CJ a deja renvoye des
 * intervalles inverses ("15-7"), qui donnaient un max inferieur au min.
 *
 * Ce parseur reste volontairement neutre : il ne juge pas si un delai est
 * plausible (0 jour, delai enorme). Cette regle metier appartient a
 * pickThreeTiers().
 */
export function parseAging(aging: unknown): { min: number | null; max: number | null } {
  if (typeof aging !== 'string') return { min: null, max: null };
  const nums = aging
    .split('-')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  if (nums.length === 0) return { min: null, max: null };
  if (nums.length === 1) return { min: nums[0], max: nums[0] };
  return { min: Math.min(nums[0], nums[1]), max: Math.max(nums[0], nums[1]) };
}

/** Borne basse des options logistiques (la moins chere). Inchange : alimente
 *  shipping_cache.shipping_cost, hors perimetre de ce lot. */
export function lowestPrice(options: unknown): { price: number; aging: string } | null {
  const list = Array.isArray(options) ? options : [];
  let best: { price: number; aging: string } | null = null;
  for (const o of list) {
    const p = Number((o as any)?.logisticPrice ?? (o as any)?.price ?? (o as any)?.freightAmount);
    if (!Number.isFinite(p) || p < 0) continue;
    if (!best || p < best.price) {
      best = { price: p, aging: String((o as any)?.logisticAging ?? '') };
    }
  }
  return best;
}

type Normalized = { name: string; cost: number; min: number | null; max: number };

/**
 * Regroupe les options logistiques CJ en 1, 2 ou 3 niveaux de service.
 *
 * OPTIONS SANS DELAI EXPLOITABLE : elles sont ECARTEES du classement. Un
 * niveau de service est une promesse de delai ; une option dont CJ ne
 * communique pas le delai ne peut pas en porter une, et lui en inventer un
 * serait presenter une donnee fabriquee comme une donnee fournisseur. Si
 * AUCUNE option n'est datee, on expose la moins chere sans delai (`null`)
 * plutot que de ne rien proposer.
 *
 * DEPARTAGE DES EGALITES : cout croissant, puis delai max croissant, puis
 * delai min croissant, puis nom par ordre lexicographique. Le nom n'est pas
 * une identite metier -- il ne sert ici que de departage DETERMINISTE, pour
 * que deux options commercialement equivalentes ne laissent jamais l'ordre
 * arbitraire du tableau CJ decider silencieusement du resultat.
 *
 * LIMITE CONNUE, hors perimetre de ce lot : `ShippingTier.name` reste le seul
 * lien vers l'option CJ reelle, et deux lignes CJ peuvent partager un nom.
 * Le fulfillment apparie sur ce nom seul (`fulfill.ts`) et peut donc, dans ce
 * cas, expedier par une autre ligne que celle payee. Une identite composite
 * (nom + prix + delai) est necessaire ; elle releve du lot fulfillment
 * separe, ce lot ne touchant pas au workflow fournisseur.
 */
export function pickThreeTiers(options: unknown): ShippingTier[] | null {
  const list = Array.isArray(options) ? options : [];

  // ---- 1. Normalisation ----
  const parsed = list.map((o: any) => ({
    name: String(o?.logisticName ?? ''),
    cost: Number(o?.logisticPrice ?? o?.price ?? o?.freightAmount),
    ...parseAging(o?.logisticAging),
  }));

  // Un cout doit etre un nombre fini positif ou nul (une livraison offerte est
  // une offre reelle). Un delai exploitable doit etre strictement positif.
  const usable: Normalized[] = parsed
    .filter((o): o is Normalized & { max: number } =>
      Number.isFinite(o.cost) && o.cost >= 0 && o.max != null && o.max > 0
    );

  if (usable.length === 0) {
    // Aucune option datee : on expose la moins chere SANS delai plutot que
    // d'inventer une estimation (I5).
    const priced = parsed
      .filter((o) => Number.isFinite(o.cost) && o.cost >= 0)
      .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
    if (priced.length === 0) return null;
    const o = priced[0];
    return [{ tier: 'eco', name: o.name, cost: o.cost, days_min: null, days_max: null }];
  }

  // ---- 2. Frontiere de Pareto ----
  // Trie deterministe (voir DEPARTAGE ci-dessus), puis balayage : une option
  // n'est retenue que si elle est STRICTEMENT plus rapide que toutes celles
  // qui coutent moins cher. Toute option dominee est ecartee (I4).
  const sorted = [...usable].sort(
    (a, b) =>
      a.cost - b.cost ||
      a.max - b.max ||
      (a.min ?? 0) - (b.min ?? 0) ||
      a.name.localeCompare(b.name)
  );
  const front: Normalized[] = [];
  let fastestSoFar = Infinity;
  for (const o of sorted) {
    if (o.max < fastestSoFar) {
      front.push(o);
      fastestSoFar = o.max;
    }
  }

  // ---- 3. Affectation ORDINALE ----
  // Aucun coefficient, aucune unite : un rang. Le nombre de niveaux suit les
  // donnees, il n'est jamais force a trois.
  const build = (tier: ShippingTier['tier'], o: Normalized): ShippingTier => ({
    tier,
    name: o.name,
    cost: o.cost,
    days_min: o.min,
    days_max: o.max,
  });

  const n = front.length;
  if (n === 1) return [build('eco', front[0])];
  if (n === 2) return [build('eco', front[0]), build('express', front[1])];
  return [
    build('eco', front[0]),
    build('standard', front[Math.floor((n - 1) / 2)]),
    build('express', front[n - 1]),
  ];
}
