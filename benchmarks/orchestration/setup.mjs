// BANC P-001 -- applique setup.sql (rejouable). Refuse toute base contenant
// des objets du produit Deribfy : le banc ne tourne QUE sur une base jetable.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './lib.mjs';

const db = pool();
const garde = await db.query(
  `select count(*)::int n from information_schema.tables
   where table_schema='public' and table_name in ('sites','shop_orders','marketing_assets')`,
);
if (garde.rows[0].n > 0) {
  console.error('REFUS : cette base contient des tables du produit Deribfy. Le banc exige une base JETABLE.');
  process.exit(3);
}
const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'setup.sql'), 'utf8');
await db.query(sql);
console.log('setup.sql applique (file bench_jobs + tables du banc).');
process.exit(0);
