// BANC P-001 -- les 5 epreuves du protocole, journal JSONL, verdicts stricts.
// Un echec d'epreuve = candidat disqualifie (protocole P-001).
import { spawn } from 'node:child_process';
import { mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, enqueueJob, annuler, etat, sleep, FAST, VT_S, ETAPES } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const db = pool();
mkdirSync(join(HERE, 'results'), { recursive: true });
const JOURNAL = join(HERE, 'results', `${new Date().toISOString().slice(0, 10)}-epreuves.jsonl`);
const log = (epreuve, event, data = {}) => {
  const ligne = { t: new Date().toISOString(), officiel: !FAST, epreuve, event, ...data };
  appendFileSync(JOURNAL, JSON.stringify(ligne) + '\n');
  console.log(`[${epreuve}] ${event}`, JSON.stringify(data));
};

const lancerWorker = (id) =>
  spawn(process.execPath, [join(HERE, 'worker.mjs')], {
    env: { ...process.env, BENCH_WORKER_ID: id },
    stdio: 'ignore',
  });

async function attendre(cond, timeoutMs, quoi) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await cond()) return true;
    await sleep(250);
  }
  throw new Error(`timeout d'attente : ${quoi}`);
}
const execCount = async (job, etape, evt) =>
  (await db.query(
    `select count(*)::int n from bench_exec_log where job_id=$1 and etape=$2 and evt=$3`,
    [job, etape, evt],
  )).rows[0].n;
const artefactsDupliques = async () =>
  (await db.query(
    `select count(*)::int n from (
       select job_id, etape from bench_artefacts group by 1,2 having count(*)>1) d`,
  )).rows[0].n; // structurellement 0 (PK) -- verification de forme

let verdicts = [];
async function epreuve(nom, fn) {
  log(nom, 'debut');
  try {
    await fn();
    verdicts.push({ nom, verdict: 'REUSSIE' });
    log(nom, 'REUSSIE');
  } catch (e) {
    verdicts.push({ nom, verdict: 'ECHEC', raison: e.message });
    log(nom, 'ECHEC', { raison: e.message });
  }
}

// ---------- EPREUVE 1 : kill -9 pendant l'etape 3, reprise, 0 doublon ----------
await epreuve('E1-kill9', async () => {
  const J = 'e1-job';
  await enqueueJob(db, J);
  const w1 = lancerWorker('e1-a');
  await attendre(async () => (await execCount(J, 3, 'start')) >= 1, 180000, 'etape 3 demarree');
  w1.kill('SIGKILL');
  log('E1-kill9', 'worker tue en pleine etape 3 (SIGKILL)');
  const w2 = lancerWorker('e1-b');
  // Redelivrance apres expiration du visibility timeout, puis fin du job.
  await attendre(async () => (await etat(db, J))?.status === 'done', (VT_S + 120) * 1000, 'job termine');
  w2.kill('SIGTERM');
  const reexec = await execCount(J, 3, 'start');
  const arte = (await db.query(`select count(*)::int n from bench_artefacts where job_id=$1`, [J])).rows[0].n;
  log('E1-kill9', 'mesures', { reexecutions_etape3: reexec, artefacts: arte, dupliques: await artefactsDupliques() });
  if (reexec < 2) throw new Error('aucune re-execution observee : le kill n a pas teste la redelivrance');
  if (arte !== ETAPES.length) throw new Error(`artefacts=${arte}, attendu ${ETAPES.length}`);
});

// ---------- EPREUVE 2 : crash orchestrateur -> re-enfilage idempotent ----------
await epreuve('E2-orchestrateur', async () => {
  const jobs = Array.from({ length: 6 }, (_, i) => `e2-job-${i + 1}`);
  for (const j of jobs.slice(0, 3)) await enqueueJob(db, j); // "crash" apres 3
  for (const j of jobs) await enqueueJob(db, j);             // relance complete
  const w = lancerWorker('e2');
  await attendre(async () => {
    for (const j of jobs) if ((await etat(db, j))?.status !== 'done') return false;
    return true;
  }, 600000, 'les 6 jobs termines');
  w.kill('SIGTERM');
  const n = (await db.query(
    `select count(*)::int n from bench_job_state where job_id like 'e2-job-%'`)).rows[0].n;
  if (n !== 6) throw new Error(`jobs=${n}, attendu 6 (perte ou duplication)`);
  log('E2-orchestrateur', 'mesures', { jobs: n, dupliques: await artefactsDupliques() });
});

// ---------- EPREUVE 3 : annulation en etape 2 ----------
await epreuve('E3-annulation', async () => {
  const J = 'e3-job';
  await enqueueJob(db, J);
  const w = lancerWorker('e3');
  await attendre(async () => (await execCount(J, 2, 'start')) >= 1, 120000, 'etape 2 demarree');
  await annuler(db, J);
  await sleep(FAST ? 4000 : 35000); // l'etape en cours se termine, rien apres
  w.kill('SIGTERM');
  const s = await etat(db, J);
  const e3 = await execCount(J, 3, 'start');
  log('E3-annulation', 'mesures', { status: s.status, etape3_executee: e3 });
  if (s.status !== 'cancelled') throw new Error(`status=${s.status}, attendu cancelled`);
  if (e3 !== 0) throw new Error('une etape posterieure a l annulation a ete executee');
});

// ---------- EPREUVE 4 : echec repete -> retry borne puis failed propre ----------
await epreuve('E4-retry-borne', async () => {
  const J = 'e4-job';
  await enqueueJob(db, J, { fail_step: 2 });
  const w = lancerWorker('e4');
  await attendre(async () => (await etat(db, J))?.status === 'failed', 300000, 'status failed');
  w.kill('SIGTERM');
  const tent = await execCount(J, 2, 'start');
  log('E4-retry-borne', 'mesures', { tentatives_etape2: tent });
  if (tent !== 2) throw new Error(`tentatives=${tent}, attendu exactement 2 (borne)`);
});

// ---------- EPREUVE 5 : etat durable sans worker ----------
await epreuve('E5-durabilite', async () => {
  const jobs = ['e5-job-1', 'e5-job-2'];
  for (const j of jobs) await enqueueJob(db, j);
  await sleep(FAST ? 10000 : 60000); // aucun worker : rien ne vit en memoire
  const w = lancerWorker('e5');
  await attendre(async () => {
    for (const j of jobs) if ((await etat(db, j))?.status !== 'done') return false;
    return true;
  }, 600000, 'jobs termines apres redemarrage');
  w.kill('SIGTERM');
  log('E5-durabilite', 'mesures', { jobs: jobs.length });
});

log('SYNTHESE', 'verdicts', { verdicts, journal: JOURNAL });
const echecs = verdicts.filter((v) => v.verdict !== 'REUSSIE').length;
console.log(`\n${5 - echecs}/5 epreuves reussies -- journal : ${JOURNAL}`);
process.exit(echecs === 0 ? 0 : 1);
