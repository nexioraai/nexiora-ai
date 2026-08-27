// BANC P-001 -- worker : lit pgmq, execute l'etape, gere SIGTERM proprement.
// Un kill -9 (SIGKILL) ne laisse RIEN faire -- c'est le but de l'epreuve 1 :
// la redelivrance par visibility timeout doit suffire.
import { pool, executerEtape, VT_S, sleep } from './lib.mjs';

const db = pool();
let stop = false;
process.on('SIGTERM', () => { stop = true; });
process.on('SIGINT', () => { stop = true; });

const WORKER = process.env.BENCH_WORKER_ID ?? String(process.pid);
console.log(`[worker ${WORKER}] demarre (vt=${VT_S}s)`);

while (!stop) {
  const r = await db.query(`select * from pgmq.read('bench_jobs', $1, 1)`, [VT_S]);
  if (r.rows.length === 0) { await sleep(400); continue; }
  const { msg_id, message } = r.rows[0];
  const { job_id, etape } = message;
  try {
    const verdict = await executerEtape(db, job_id, etape);
    // Dans TOUS les cas termines (ok/cancelled/failed/stale) le message est
    // consomme ; seule une mort brutale le laisse revenir par expiration vt.
    await db.query(`select pgmq.delete('bench_jobs', $1::bigint)`, [msg_id]);
    console.log(`[worker ${WORKER}] job=${job_id} etape=${etape} -> ${verdict}`);
  } catch (e) {
    // Echec d'etape : message consomme, re-enfile pour retry (borne en amont).
    await db.query(`select pgmq.delete('bench_jobs', $1::bigint)`, [msg_id]);
    await db.query(`select pgmq.send('bench_jobs', $1::jsonb)`, [
      JSON.stringify({ job_id, etape }),
    ]);
    console.log(`[worker ${WORKER}] job=${job_id} etape=${etape} -> erreur (${e.message}), re-enfile`);
  }
}
console.log(`[worker ${WORKER}] arret propre`);
process.exit(0);
