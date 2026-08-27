// BANC P-001 -- coeur partage : DB, machine a etats, etapes simulees.
import pg from 'pg';

export const ETAPES = ['intake', 'resolve', 'compile-sim', 'verify-sim', 'publish-sim'];
export const MAX_TENTATIVES_ETAPE = 2;
export const FAST = process.env.BENCH_FAST === '1';
export const VT_S = FAST ? 8 : 60; // visibility timeout pgmq (redelivrance)

let _pool;
export function pool() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL manquant -- voir README (prerequis non contournable).');
    process.exit(2);
  }
  _pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  return _pool;
}

// Duree deterministe par (job, etape) : protocole = 5-30 s ; FAST = 0.3-1.2 s.
export function dureeMs(jobId, etape) {
  let h = 0;
  for (const c of `${jobId}:${etape}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FAST ? 300 + (h % 900) : 5000 + (h % 25000);
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ré-enfilage idempotent (epreuve 2) : l'etat est la source de verite ; le
// message n'est envoye que si l'etat vient d'etre cree.
export async function enqueueJob(db, jobId, payload = {}) {
  const ins = await db.query(
    `insert into bench_job_state (job_id, payload) values ($1, $2)
     on conflict (job_id) do nothing returning job_id`,
    [jobId, payload],
  );
  if (ins.rowCount === 1) {
    await db.query(`select pgmq.send('bench_jobs', $1::jsonb)`, [
      JSON.stringify({ job_id: jobId, etape: 1 }),
    ]);
    return true;
  }
  return false;
}

export async function etat(db, jobId) {
  const r = await db.query(`select * from bench_job_state where job_id=$1`, [jobId]);
  return r.rows[0] ?? null;
}

export async function annuler(db, jobId) {
  await db.query(
    `update bench_job_state set status='cancelled', updated_at=now()
     where job_id=$1 and status in ('pending','running')`,
    [jobId],
  );
}

// Execute UNE etape d'un job (appele par le worker apres lecture pgmq).
// Retourne 'ok' | 'cancelled' | 'failed' | 'stale'.
export async function executerEtape(db, jobId, etapeN) {
  const s = await etat(db, jobId);
  if (!s) return 'stale';
  if (s.status === 'cancelled') return 'cancelled';
  if (s.status === 'failed' || s.status === 'done') return 'stale';
  if (s.etape !== etapeN) return 'stale'; // message perime (deja traite)

  // Retry borne (epreuve 4) : tentatives comptees par le journal.
  const t = await db.query(
    `select count(*)::int n from bench_exec_log where job_id=$1 and etape=$2 and evt='start'`,
    [jobId, etapeN],
  );
  if (t.rows[0].n >= MAX_TENTATIVES_ETAPE) {
    await db.query(
      `update bench_job_state set status='failed', updated_at=now() where job_id=$1`,
      [jobId],
    );
    return 'failed';
  }

  await db.query(
    `insert into bench_exec_log (job_id, etape, evt) values ($1,$2,'start')`,
    [jobId, etapeN],
  );
  await db.query(
    `update bench_job_state set status='running', updated_at=now() where job_id=$1`,
    [jobId],
  );

  // Echec deterministe (epreuve 4) : payload.fail_step.
  if (s.payload?.fail_step === etapeN) {
    await db.query(
      `insert into bench_exec_log (job_id, etape, evt) values ($1,$2,'erreur')`,
      [jobId, etapeN],
    );
    throw new Error(`echec simule etape ${etapeN}`);
  }

  await sleep(dureeMs(jobId, etapeN)); // le "travail" -- fenetre du kill -9

  // Artefact IDEMPOTENT : unique par (job, etape) quoi qu'il arrive.
  await db.query(
    `insert into bench_artefacts (job_id, etape, contenu) values ($1,$2,$3)
     on conflict (job_id, etape) do nothing`,
    [jobId, etapeN, `artefact:${ETAPES[etapeN - 1]}`],
  );
  await db.query(
    `insert into bench_exec_log (job_id, etape, evt) values ($1,$2,'ok')`,
    [jobId, etapeN],
  );

  const derniere = etapeN >= ETAPES.length;
  await db.query(
    `update bench_job_state
       set etape=$2, status=$3, updated_at=now()
     where job_id=$1 and etape=$4 and status='running'`,
    [jobId, derniere ? etapeN : etapeN + 1, derniere ? 'done' : 'pending', etapeN],
  );
  if (!derniere) {
    await db.query(`select pgmq.send('bench_jobs', $1::jsonb)`, [
      JSON.stringify({ job_id: jobId, etape: etapeN + 1 }),
    ]);
  }
  return 'ok';
}
