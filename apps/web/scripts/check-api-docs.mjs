#!/usr/bin/env node
/**
 * P0-3.9.7 — Vérifie que docs/API.md couvre réellement les routes sous
 * src/app/api/**, dans les deux sens :
 *   1. toute route.ts doit avoir un chemin correspondant documenté ;
 *   2. tout chemin documenté doit correspondre à une route existante
 *      (détecte la documentation obsolète après suppression d'une route).
 *
 * Ne vérifie pas le contenu de la documentation (paramètres, réponses,
 * auth) — seulement sa couverture. Pur Node, sans dépendance, même
 * philosophie que woorri-edu/apps/web/scripts/check-boundaries.mjs.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = join(REPO_ROOT, 'src/app/api');
const DOC_FILE = join(REPO_ROOT, 'docs/API.md');

function listRouteFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listRouteFiles(full));
    else if (entry === 'route.ts') out.push(full);
  }
  return out;
}

function toApiPath(file) {
  return '/api/' + relative(API_DIR, file).replace(/\/route\.ts$/, '');
}

const realPaths = new Set(listRouteFiles(API_DIR).map(toApiPath));

const docContent = readFileSync(DOC_FILE, 'utf8');
const docPaths = new Set();
for (const m of docContent.matchAll(/`(\/api\/[a-zA-Z0-9\-_/[\]]*)`/g)) {
  docPaths.add(m[1]);
}

const missing = [...realPaths].filter((p) => !docPaths.has(p)).sort();
const stale = [...docPaths].filter((p) => !realPaths.has(p)).sort();

if (missing.length === 0 && stale.length === 0) {
  console.log(`check-api-docs: ${realPaths.size} routes, toutes documentées dans docs/API.md.`);
  process.exit(0);
}

if (missing.length > 0) {
  console.error(`check-api-docs: ${missing.length} route(s) non documentée(s) :`);
  for (const p of missing) console.error(`  ${p}`);
}
if (stale.length > 0) {
  console.error(`check-api-docs: ${stale.length} chemin(s) documenté(s) mais introuvable(s) sur disque :`);
  for (const p of stale) console.error(`  ${p}`);
}
process.exit(1);
