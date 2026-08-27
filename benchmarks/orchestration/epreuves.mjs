// BANC P-001 -- les 5 epreuves du protocole, journal JSONL, verdicts stricts.
// v2 (2026-08-27) -- lecons de la campagne 1 (journal du meme jour conserve) :
//   1. chaque epreuve TUE ses workers dans un finally (la v1 a laisse fuir un
//      worker apres un echec, contaminant l'isolation des epreuves suivantes) ;
//   2. le timeout d'E2 est CALCULE depuis les durees deterministes reelles,
//      plus une marge -- la v1 utilisait 600 s < somme reelle (~525 s+overhead),
//      produisant un faux ECHEC alors que le critere de fond etait satisfait ;
//   3. purge de file + verification de residus entre epreuves ;
//   4. E5 PROUVE sa fenetre sans worker (exec_log vide avant redemarrage).
import { spawn } from 'node:child_process';
import { mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  pool, enqueueJob, annuler, etat, sleep, FAST, VT_S, ETAPES, dureeMs,
} from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const db = pool();
mkdirSync(join(HERE, 'results'), { recursive: true });
const JOURNAL = join(
  HERE, 'results',
  `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-epreuves.jsonl`,
);
const log = (epreuve, event, data = {}) => {
  const ligne = { t: new Date().toISOString(), officiel: !FAST, epreuve, event, ...data };
  appendFileSync(JOURNAL, JSON.stringify(ligne) + '\n');
  console.log(`[${epreuve}] ${event}`, JSON.stringify(data));
};

// --- Gestion stricte des workers : registre + mise a mort garantie. ---
const actifs = new Set();
function lancerWorker(id) {
  const w = spawn(process.execPath, [join(HERE, 'worker.mjs')], {
    env: { ...process.env, BENCH_WORKER_ID: id },
    stdio: 'ignore',
  });
  actifs.add(w);
  w.on('exit', () => actifs.delete(w));
  return w;
}
async function tuerTousLesWorkers() {
  for (const w of actifs) w.kill('SIGTERM');
  const t0 = Date.now();
  while (actifs.size > 0 && Date.now() - t0 < 5000) await sleep(200);
  for (const w of actifs) w.kill('SIGKILL'); // aucun survivant, jamais
  while (actifs.size > 0) await sleep(100);
}

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
  )).rows[0].n;

// Duree totale deterministe d'un lot de jobs pour W workers + marge.
function budgetMs(jobs, workers, margeMs) {
  let total = 0;
  for (const j of jobs) for (let e = 1; e <= ETAPES.length; e++) total += dureeMs(j, e);
  const overhead = jobs.length * ETAPES.length * 2000; // aller-retours DB + polling
  return Math.ceil((total + overhead) / workers) + margeMs;
}

// Isolation : purge de file entre epreuves (l'etat des epreuves passees reste
// en tables -- prefixes distincts -- mais plus AUCUN message ni worker actif).
async function isoler(nom) {
  await tuerTousLesWorkers();
  await db.query(`select pgmq.purge_queue('bench_jobs')`);
  const q = await db.query(`select * from pgmq.metrics('bench_jobs')`);
  log(nom, 'isolation', { queue_length: q.rows[0]?.queue_length ?? 0, workers_actifs: actifs.size });
}

let verdicts = [];
async function epreuve(nom, fn) {
  await isoler(nom);
  log(nom, 'debut');
  try {
    await fn();
    verdicts.push({ nom, verdict: 'REUSSIE' });
    log(nom, 'REUSSIE');
  } catch (e) {
    verdicts.push({ nom, verdict: 'ECHEC', raison: e.message });
    log(nom, 'ECHEC', { raison: e.message });
  } finally {
    await tuerTousLesWorkers(); // lecon v2 : aucune fuite possible
  }
}

// Campagne reproductible : depart sur tables vides.
await db.query(`truncate bench_job_state, bench_artefacts, bench_exec_log`);
await db.query(`select pgmq.purge_queue('bench_jobs')`);
log('CAMPAGNE', 'reset', { vt_s: VT_S, officiel: !FAST });

// ---------- EPREUVE 1 : kill -9 pendant l'etape 3, reprise, 0 doublon ----------
await epreuve('E1-kill9', async () => {
  const J = 'e1-job';
  await enqueueJob(db, J);
  const w1 = lancerWorker('e1-a');
  await attendre(async () => (await execCount(J, 3, 'start')) >= 1,
    budgetMs([J], 1, 60000), 'etape 3 demarree');
  w1.kill('SIGKILL');
  actifs.delete(w1);
  log('E1-kill9', 'worker tue en pleine etape 3 (SIGKILL)');
  lancerWorker('e1-b');
  await attendre(async () => (await etat(db, J))?.status === 'done',
    budgetMs([J], 1, (VT_S + 90) * 1000), 'job termine');
  const reexec = await execCount(J, 3, 'start');
  const arte = (await db.query(
    `select count(*)::int n from bench_artefacts where job_id=$1`, [J])).rows[0].n;
  log('E1-kill9', 'mesures', { reexecutions_etape3: reexec, artefacts: arte, dupliques: await artefactsDupliques() });
  if (reexec < 2) throw new Error('aucune re-execution observee : la redelivrance n a pas ete testee');
  if (arte !== ETAPES.length) throw new Error(`artefacts=${arte}, attendu ${ETAPES.length}`);
});

// ---------- EPREUVE 2 : crash orchestrateur -> re-enfilage idempotent ----------
await epreuve('E2-orchestrateur', async () => {
  const jobs = Array.from({ length: 6 }, (_, i) => `e2-job-${i + 1}`);
  for (const j of jobs.slice(0, 3)) await enqueueJob(db, j); // "crash" apres 3
  for (const j of jobs) await enqueueJob(db, j);             // relance complete
  const budget = budgetMs(jobs, 2, 120000);
  log('E2-orchestrateur', 'budget calcule', { workers: 2, budget_s: Math.round(budget / 1000) });
  lancerWorker('e2-a');
  lancerWorker('e2-b');
  await attendre(async () => {
    for (const j of jobs) if ((await etat(db, j))?.status !== 'done') return false;
    return true;
  }, budget, 'les 6 jobs termines');
  const n = (await db.query(
    `select count(*)::int n from bench_job_state where job_id like 'e2-job-%'`)).rows[0].n;
  const arte = (await db.query(
    `select count(*)::int n from bench_artefacts where job_id like 'e2-job-%'`)).rows[0].n;
  log('E2-orchestrateur', 'mesures', { jobs: n, artefacts: arte, dupliques: await artefactsDupliques() });
  if (n !== 6) throw new Error(`jobs=${n}, attendu 6 (perte ou duplication)`);
  if (arte !== 6 * ETAPES.length) throw new Error(`artefacts=${arte}, attendu ${6 * ETAPES.length}`);
});

// ---------- EPREUVE 3 : annulation en etape 2 ----------
await epreuve('E3-annulation', async () => {
  const J = 'e3-job';
  await enqueueJob(db, J);
  lancerWorker('e3');
  await attendre(async () => (await execCount(J, 2, 'start')) >= 1,
    budgetMs([J], 1, 60000), 'etape 2 demarree');
  await annuler(db, J);
  await sleep(FAST ? 4000 : 35000); // l'etape en cours se termine, rien apres
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
  lancerWorker('e4');
  await attendre(async () => (await etat(db, J))?.status === 'failed',
    budgetMs([J], 1, 120000), 'status failed');
  const tent = await execCount(J, 2, 'start');
  log('E4-retry-borne', 'mesures', { tentatives_etape2: tent });
  if (tent !== 2) throw new Error(`tentatives=${tent}, attendu exactement 2 (borne)`);
});

// ---------- EPREUVE 5 : etat durable sans worker (fenetre PROUVEE vide) ----------
await epreuve('E5-durabilite', async () => {
  const jobs = ['e5-job-1', 'e5-job-2'];
  for (const j of jobs) await enqueueJob(db, j);
  await sleep(FAST ? 10000 : 60000); // aucun worker : rien ne vit en memoire
  // Preuve de la fenetre (lecon v2) : AUCUNE execution ne doit avoir eu lieu.
  const pendant = (await db.query(
    `select count(*)::int n from bench_exec_log where job_id like 'e5-%'`)).rows[0].n;
  if (pendant !== 0) throw new Error(`contamination : ${pendant} execution(s) pendant la fenetre sans worker`);
  log('E5-durabilite', 'fenetre sans worker prouvee vide');
  lancerWorker('e5');
  await attendre(async () => {
    for (const j of jobs) if ((await etat(db, j))?.status !== 'done') return false;
    return true;
  }, budgetMs(jobs, 1, 120000), 'jobs termines apres redemarrage');
  log('E5-durabilite', 'mesures', { jobs: jobs.length, dupliques: await artefactsDupliques() });
});

log('SYNTHESE', 'verdicts', { verdicts, journal: JOURNAL });
const echecs = verdicts.filter((v) => v.verdict !== 'REUSSIE').length;
console.log(`\n${5 - echecs}/5 epreuves reussies -- journal : ${JOURNAL}`);
process.exit(echecs === 0 ? 0 : 1);
