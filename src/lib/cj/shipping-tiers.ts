// ============================================================
// Logique de regroupement des options logistiques CJ.
// Source UNIQUE, partagee par le cron shipping-cache et l'endpoint
// shipping-estimate (pas de duplication).
// ============================================================

export type ShippingTier = {
  tier: 'eco' | 'standard' | 'express';
  name: string;
  cost: number;
  days_min: number | null;
  days_max: number | null;
};

/** CJ renvoie logisticAging "2-5" : on extrait les deux bornes. */
export function parseAging(aging: unknown): { min: number | null; max: number | null } {
  if (typeof aging !== 'string') return { min: null, max: null };
  const parts = aging.split('-').map((p) => Number(p.trim()));
  const min = Number.isFinite(parts[0]) ? parts[0] : null;
  const max = Number.isFinite(parts[1]) ? parts[1] : (Number.isFinite(parts[0]) ? parts[0] : null);
  return { min, max };
}

/** Borne basse des options logistiques (la moins chere). */
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

/** Regroupe les options logistiques CJ en 3 tiers : eco / standard / express.
 *  - eco     : le moins cher
 *  - express : le plus rapide (borne haute la plus basse), a prix raisonnable
 *  - standard: meilleur compromis prix + delai, distinct des deux autres
 *  Un plafond (3x le moins cher) ecarte les aberrations (DHL, fret maritime). */
export function pickThreeTiers(options: unknown): ShippingTier[] | null {
  const list = Array.isArray(options) ? options : [];
  const valid = list
    .map((o: any) => ({
      name: String(o?.logisticName ?? ''),
      cost: Number(o?.logisticPrice ?? o?.price ?? o?.freightAmount),
      aging: String(o?.logisticAging ?? ''),
    }))
    .filter((o) => Number.isFinite(o.cost) && o.cost >= 0);
  if (valid.length === 0) return null;

  const pmin = (a: string) => { const n = Number(a.split('-')[0]); return Number.isFinite(n) ? n : 999; };
  const pmax = (a: string) => { const parts = a.split('-'); const n = Number(parts[1] ?? parts[0]); return Number.isFinite(n) ? n : 999; };

  const eco = valid.reduce((a, b) => (b.cost < a.cost ? b : a));
  const cap = eco.cost * 3;
  const pool = valid.filter((o) => o.cost <= cap);

  const express = pool.reduce((a, b) => {
    const am = pmax(a.aging), bm = pmax(b.aging);
    if (bm !== am) return bm < am ? b : a;
    const amn = pmin(a.aging), bmn = pmin(b.aging);
    if (bmn !== amn) return bmn < amn ? b : a;
    return b.cost < a.cost ? b : a;
  });

  const rest = pool.filter((o) => o.name !== eco.name && o.name !== express.name);
  const standard = (rest.length ? rest : pool).reduce((a, b) => {
    const sa = a.cost + pmax(a.aging) * 0.5;
    const sb = b.cost + pmax(b.aging) * 0.5;
    return sb < sa ? b : a;
  });

  const build = (tier: 'eco' | 'standard' | 'express', o: typeof eco): ShippingTier => ({
    tier, name: o.name, cost: o.cost,
    days_min: parseAging(o.aging).min, days_max: parseAging(o.aging).max,
  });
  const tiers = [build('eco', eco), build('standard', standard), build('express', express)];
  const seen = new Set<string>();
  return tiers.filter((t) => { const k = t.name + t.cost; if (seen.has(k)) return false; seen.add(k); return true; });
}
