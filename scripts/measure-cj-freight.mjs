#!/usr/bin/env node
// ============================================================
// MESURE CJ -- freightCalculate. LECTURE SEULE, HORS APPLICATION.
//
// Ce script existe parce que quatre etapes du plan shipping (LOT 5 quantite,
// frais CJ, devis panier, final shipping) sont conditionnees a des faits
// fournisseur que NOUS N'AVONS JAMAIS MESURES. Aucune de ces etapes ne doit
// etre concue sur une hypothese : ce script produit les JSON bruts qui
// serviront de seule source.
//
// CE QU'IL NE FAIT JAMAIS, par construction :
//   - il n'appelle QUE /authentication/getAccessToken et
//     /logistic/freightCalculate. Jamais createOrderV2, jamais aucune
//     ecriture chez CJ.
//   - il ne touche PAS a Supabase. Il n'importe donc pas le code du depot
//     (`cjFetch` -> `acquireCjSlot()` -> UPDATE cj_rate_limiter), et
//     n'entre pas en contention avec la file de creation des commandes.
//   - il n'ecrit rien hors du dossier de sortie demande.
//   - il ne demarre pas sans --confirm : aucun appel CJ ne peut partir par
//     accident.
//
// CADENCE (option A) : sleep local de 1100 ms entre deux appels, superieur a
// la limite CJ de 1 req/s. Ce script ne partageant PAS la file globale, le
// lancer pendant un pic de fulfillment pourrait faire depasser le QPS cote
// compte CJ -- a lancer a un moment calme. ~15-20 appels au total.
//
// Ce script ne conclut RIEN sur les tarifs CJ. Le mode --summarize se borne a
// decrire ce que les JSON bruts contiennent, champ par champ, sans
// interpretation ni valeur reconstituee. Un champ absent est rapporte absent.
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CJ_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';
const SLOT_MS = 1100;
const TIMEOUT_MS = 30_000;
const DEFAULT_QUANTITIES = [1, 2, 3, 5, 10, 20];

// ---------- arguments ----------
const argv = process.argv.slice(2);
const many = (k) => argv.filter((a) => a.startsWith(`--${k}=`)).map((a) => a.slice(k.length + 3));
const one = (k, d = null) => (many(k)[0] ?? d);
const flag = (k) => argv.includes(`--${k}`);

const vids = many('vid');
// `catalog_products.supplier_product_id` est un PID (produit), pas un VID
// (variante) -- fulfill.ts:369 et shipping-cache:120/204 le confirment, et
// `freightCalculate` exige un VID. Quand seuls des PID sont disponibles, une
// resolution prealable est necessaire, en LECTURE SEULE, via
// /product/variant/query : un appel par PID, la premiere variante retenue,
// exactement comme le fait le cron shipping-cache (:167-169).
const pids = many('pid');
const countries = many('country').map((c) => c.trim().toUpperCase());
const quantities = one('quantities')
  ? one('quantities').split(',').map((n) => parseInt(n, 10)).filter((n) => Number.isInteger(n) && n > 0)
  : DEFAULT_QUANTITIES;
const outDir = resolve(one('out', 'measures/raw'));

function usage(reason) {
  console.error(`\n[measure-cj-freight] REFUS DE DEMARRER : ${reason}\n`);
  console.error(`Usage :
  node scripts/measure-cj-freight.mjs --vid=<VID> [--vid=<VID2> ...] \\
                                      --country=<ISO2> [--country=<ISO2> ...] \\
                                      [--quantities=1,2,3,5,10,20] \\
                                      [--out=measures/raw] \\
                                      --confirm

  --vid         VID CJ REEL (shop_products.cj_vid). Au moins 1.
                Au moins 2 pour mesurer le devis panier multi-VID.
  --pid         PID CJ (catalog_products.supplier_product_id), resolu en VID
                via /product/variant/query -- 1 appel supplementaire par PID.
                Combinable avec --vid.
  --country     Code pays ISO2 de destination. Au moins 1.
  --quantities  Defaut : ${DEFAULT_QUANTITIES.join(',')}
  --out         Dossier des JSON bruts. Defaut : measures/raw
  --confirm     OBLIGATOIRE. Sans lui, aucun appel CJ n'est emis.

Mode hors ligne, aucun appel reseau :
  node scripts/measure-cj-freight.mjs --summarize [--out=measures/raw]
`);
  process.exit(2);
}

// ---------- environnement ----------
function readEnvLocal() {
  const p = resolve('.env.local');
  if (!existsSync(p)) return {};
  const env = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${CJ_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return { httpStatus: res.status, json: await res.json() };
  } finally {
    clearTimeout(t);
  }
}

async function get(path, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${CJ_BASE}${path}`, { headers, signal: ctrl.signal });
    return { httpStatus: res.status, json: await res.json() };
  } finally {
    clearTimeout(t);
  }
}

// ============================================================
// MODE MESURE
// ============================================================
async function measure() {
  const env = readEnvLocal();
  const email = process.env.CJ_EMAIL || env.CJ_EMAIL;
  const apiKey = process.env.CJ_API_KEY || env.CJ_API_KEY;
  if (!email || !apiKey) usage('CJ_EMAIL / CJ_API_KEY introuvables (.env.local ou environnement).');

  mkdirSync(outDir, { recursive: true });

  // Un seul appel d'authentification pour toute la campagne.
  const auth = await post('/authentication/getAccessToken', { apiKey });
  const token = auth.json?.data?.accessToken;
  if (!token) {
    console.error('[measure-cj-freight] Authentification CJ echouee :', auth.json?.message || auth.httpStatus);
    process.exit(1);
  }
  console.log('[measure-cj-freight] authentifie. Cadence : 1 appel / %d ms.', SLOT_MS);

  // --- Resolution PID -> VID (lecture seule), si des PID ont ete fournis ---
  const resolved = [...vids];
  for (const pid of pids) {
    await sleep(SLOT_MS);
    const { httpStatus, json } = await get(`/product/variant/query?pid=${encodeURIComponent(pid)}`, { 'CJ-Access-Token': token });
    const list = Array.isArray(json?.data) ? json.data : [];
    const vid = list[0]?.vid || list[0]?.variantId || null;
    // Brut conserve : la resolution fait partie de la piece justificative.
    writeFileSync(join(outDir, `RESOLVE_${pid}.json`), JSON.stringify(
      { pid, requestedAt: new Date().toISOString(), httpStatus, variantCount: list.length, resolvedVid: vid, response: json }, null, 2));
    if (!vid) {
      console.error('[measure-cj-freight] PID %s : aucune variante exploitable -- ARRET.', pid);
      process.exit(1);
    }
    console.log('  PID %s -> VID %s  (%d variantes)', pid, vid, list.length);
    resolved.push(vid);
  }
  if (resolved.length === 0) usage('aucun VID exploitable apres resolution.');

  // Plan d'appels : mono-produit par quantite, puis panier multi-VID.
  const plan = [];
  for (const country of countries) {
    for (const vid of resolved) {
      for (const q of quantities) {
        plan.push({ label: `${vid}__${country}__q${q}`, country, products: [{ vid, quantity: q }] });
      }
    }
    if (resolved.length >= 2) {
      const [a, b] = resolved;
      plan.push({ label: `BASKET_${a}+${b}__${country}__q1x1`, country, products: [{ vid: a, quantity: 1 }, { vid: b, quantity: 1 }] });
      plan.push({ label: `BASKET_${a}+${b}__${country}__q2x2`, country, products: [{ vid: a, quantity: 2 }, { vid: b, quantity: 2 }] });
      plan.push({ label: `BASKET_${a}+${b}__${country}__q3x3`, country, products: [{ vid: a, quantity: 3 }, { vid: b, quantity: 3 }] });
    }
  }

  console.log('[measure-cj-freight] %d appels prevus (~%d s).', plan.length, Math.ceil((plan.length * SLOT_MS) / 1000));

  let ok = 0, ko = 0;
  for (const [i, step] of plan.entries()) {
    await sleep(SLOT_MS);
    const body = { startCountryCode: 'CN', endCountryCode: step.country, products: step.products };
    let record;
    try {
      const { httpStatus, json } = await post('/logistic/freightCalculate', body, { 'CJ-Access-Token': token });
      record = { label: step.label, requestedAt: new Date().toISOString(), request: body, httpStatus, response: json };
      if (json?.result) ok++; else ko++;
    } catch (e) {
      record = { label: step.label, requestedAt: new Date().toISOString(), request: body, error: String(e?.message || e) };
      ko++;
    }
    // JSON BRUT, jamais transforme : c'est la piece justificative.
    writeFileSync(join(outDir, `${step.label}.json`), JSON.stringify(record, null, 2));
    console.log('  [%d/%d] %s -> %s', i + 1, plan.length, step.label, record.error ? 'ERREUR' : `HTTP ${record.httpStatus}`);
  }

  console.log('\n[measure-cj-freight] termine. %d reponses, %d echecs. Bruts : %s', ok, ko, outDir);
  console.log('Resume descriptif : node scripts/measure-cj-freight.mjs --summarize --out=%s', outDir);
}

// ============================================================
// MODE RESUME -- hors ligne, aucun appel reseau.
// Decrit ce que les bruts contiennent. N'interprete rien, ne reconstitue
// aucune valeur absente, ne conclut rien.
// ============================================================
function summarize() {
  if (!existsSync(outDir)) usage(`dossier introuvable : ${outDir}`);
  const files = readdirSync(outDir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) usage(`aucun JSON brut dans ${outDir} -- la mesure n'a pas encore ete executee.`);

  const runs = files.map((f) => ({ file: f, ...JSON.parse(readFileSync(join(outDir, f), 'utf8')) }));
  const opts = (r) => (Array.isArray(r.response?.data) ? r.response.data : []);

  console.log(`\n# RESUME DESCRIPTIF -- ${runs.length} appels\n`);

  // 1. Presence des champs de frais. Absent = absent, jamais 0.
  console.log('## 1. Champs de frais presents dans les reponses\n');
  const FEES = ['logisticPrice', 'logisticPriceCn', 'logisticAging', 'taxesFee', 'clearanceOperationFee', 'totalPostageFee'];
  const seen = Object.fromEntries(FEES.map((k) => [k, 0]));
  let nOpts = 0;
  for (const r of runs) for (const o of opts(r)) { nOpts++; for (const k of FEES) if (o[k] !== undefined && o[k] !== null) seen[k]++; }
  for (const k of FEES) {
    const n = seen[k];
    console.log(`  ${k.padEnd(24)} ${n === 0 ? 'ABSENT de toutes les options' : `${n}/${nOpts} options`}`);
  }

  // 2. Linearite du tarif en quantite : prix(q) / (q x prix(1)).
  console.log('\n## 2. Tarif en fonction de la quantite  --  ratio = prix(q) / (q x prix(1))\n');
  const mono = runs.filter((r) => (r.request?.products || []).length === 1);
  const byKey = {};
  for (const r of mono) {
    const p = r.request.products[0];
    for (const o of opts(r)) {
      const k = `${p.vid}__${r.request.endCountryCode}__${o.logisticName}`;
      (byKey[k] ||= {})[p.quantity] = Number(o.logisticPrice);
    }
  }
  for (const [k, byQ] of Object.entries(byKey)) {
    const base = byQ[1];
    const cells = Object.keys(byQ).map(Number).sort((a, b) => a - b)
      .map((q) => `q${q}=${byQ[q]}${base ? ` (r=${(byQ[q] / (q * base)).toFixed(3)})` : ''}`);
    console.log(`  ${k}\n      ${cells.join('  ')}`);
  }
  console.log('\n  r ~ 1.000 : tarif proportionnel a la quantite.');
  console.log('  r < 1     : degressif.   r > 1 : penalisant.   base absente : ratio non calcule.');

  // 3. Stabilite du classement des options selon la quantite.
  console.log('\n## 3. Classement des options par prix, a chaque quantite\n');
  const rank = {};
  for (const r of mono) {
    const p = r.request.products[0];
    const k = `${p.vid}__${r.request.endCountryCode}`;
    (rank[k] ||= {})[p.quantity] = opts(r).slice()
      .sort((a, b) => Number(a.logisticPrice) - Number(b.logisticPrice))
      .map((o) => o.logisticName);
  }
  for (const [k, byQ] of Object.entries(rank)) {
    const qs = Object.keys(byQ).map(Number).sort((a, b) => a - b);
    const ref = JSON.stringify(byQ[qs[0]]);
    const stable = qs.every((q) => JSON.stringify(byQ[q]) === ref);
    console.log(`  ${k} : ${stable ? 'IDENTIQUE a toutes les quantites' : 'VARIE selon la quantite'}`);
    for (const q of qs) console.log(`      q${String(q).padEnd(3)} ${byQ[q].join(' < ')}`);
  }

  // 4. Devis panier multi-VID vs somme des devis unitaires.
  console.log('\n## 4. Devis panier multi-VID\n');
  const baskets = runs.filter((r) => (r.request?.products || []).length > 1);
  if (baskets.length === 0) {
    console.log('  Aucun appel panier dans ce jeu de mesures (il en faut au moins 2 VID).');
  } else {
    for (const r of baskets) {
      const names = opts(r).map((o) => o.logisticName);
      console.log(`  ${r.label}`);
      console.log(`      methodes retournees : ${names.length ? names.join(', ') : 'AUCUNE'}`);
      for (const o of opts(r)) {
        const sum = r.request.products.reduce((acc, p) => {
          const u = byKey[`${p.vid}__${r.request.endCountryCode}__${o.logisticName}`]?.[p.quantity];
          return acc === null || u === undefined ? null : acc + u;
        }, 0);
        console.log(`      ${String(o.logisticName).padEnd(28)} panier=${o.logisticPrice}   somme des devis unitaires=${sum === null ? 'non mesuree' : sum}`);
      }
    }
  }

  console.log('\n---\nChaque chiffre ci-dessus provient d\'un fichier de ' + outDir + '. Aucune valeur n\'est reconstituee.');
}

// ---------- entree ----------
if (flag('summarize')) {
  summarize();
} else {
  if (vids.length === 0 && pids.length === 0) usage('ni --vid ni --pid fourni. Des identifiants CJ reels sont indispensables.');
  if (countries.length === 0) usage('aucun --country fourni.');
  if (countries.some((c) => !/^[A-Z]{2}$/.test(c))) usage('--country doit etre un code ISO2 (ex: CA, US, FR).');
  if (quantities.length === 0) usage('--quantities ne contient aucun entier positif.');
  if (!flag('confirm')) usage('--confirm absent. Ce script emet de VRAIS appels a l\'API CJ et consomme des API Points ; il ne demarre jamais sans confirmation explicite.');
  await measure();
}
