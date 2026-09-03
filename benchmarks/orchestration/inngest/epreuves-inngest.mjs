// BANC P-001 -- candidat (b) Inngest : les 5 epreuves du protocole, meme
// journal JSONL, memes verdicts stricts que le candidat (a). Voir la table
// d'equivalence en tete de worker-inngest.mjs.
import { spawn } from 'node:child_process';
import { mkdirSync, appendFileSync, openSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Inngest } from 'inngest';
import { pool, sleep, FAST, ETAPES, dureeMs } from '../lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const db = pool();
if (!process.env.INNGEST_EVENT_KEY || !process.env.INNGEST_SIGNING_KEY) {
  console.error('ARRET : cles Inngest manquantes.');
  process.exit(2);
}
const inngest = new Inngest({ id: 'deribfy-bench-p001', eventKey: process.env.INNGEST_EVENT_KEY });

mkdirSync(join(HERE, 'results'), { recursive: true });
mkdirSync(join(HERE, 'results', 'worker-logs'), { recursive: true });
const JOURNAL = join(
  HERE, 'results',
  `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-epreuves-inngest.jsonl`,
);
const log = (epreuve, event, data = {}) => {
  const ligne = { t: new Date().toISOString(), officiel: !FAST, candidat: 'b-inngest', epreuve, event, ...data };
  appendFileSync(JOURNAL, JSON.stringify(ligne) + '\n');
  console.log(`[${epreuve}] ${event}`, JSON.stringify(data));
};

// --- Workers connect : registre + mise a mort garantie + logs captures. ---
const actifs = new Set();
function lancerWorker(id) {
  const fd = openSync(join(HERE, 'results', 'worker-logs', `${id}.log`), 'a');
  const w = spawn(process.execPath, [join(HERE, 'worker-inngest.mjs')], {
    env: { ...process.env, BENCH_WORKER_ID: id },
    stdio: ['ignore', fd, fd],
  });
  actifs.add(w);
  w.on('exit', () => actifs.delete(w));
  return w;
}
async function tuerTousLesWorkers() {
  for (const w of actifs) w.kill('SIGTERM');
  const t0 = Date.now();
  while (actifs.size > 0 && Date.now() - t0 < 6000) await sleep(200);
  for (const w of actifs) w.kill('SIGKILL');
  while (actifs.size > 0) await sleep(100);
}

async function attendre(cond, timeoutMs, quoi) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await cond()) return true;
    await sleep(400);
  }
  throw new Error(`timeout d'attente : ${quoi}`);
}
const execCount = async (job, etape, evt) =>
  (await db.query(
    `select count(*)::int n from bench_exec_log where job_id=$1 and etape=$2 and evt=$3`,
    [job, etape, evt],
  )).rows[0].n;
const statut = async (job) =>
  (await db.query(`select status from bench_job_state where job_id=$1`, [job])).rows[0]?.status;
const artefactsDupliques = async () =>
  (await db.query(
    `select count(*)::int n from (
       select job_id, etape from bench_artefacts group by 1,2 having count(*)>1) d`,
  )).rows[0].n;
async function creerEtat(job, payload = {}) {
  await db.query(
    `insert into bench_job_state (job_id, payload) values ($1,$2)
     on conflict (job_id) do nothing`,
    [job, payload],
  );
}
// Envoi idempotent : l'`id` d'evenement est la cle de deduplication plateforme.
const envoyer = (job, extra = {}) =>
  inngest.send({ name: 'bench/job.run', id: `run-${job}`, data: { job_id: job, ...extra } });

function budgetMs(jobs, margeMs) {
  // Inngest execute les runs en parallele : budget = pire job sequentiel + marge.
  let pire = 0;
  for (const j of jobs) {
    let t = 0;
    for (let e = 1; e <= ETAPES.length; e++) t += dureeMs(j, e);
    pire = Math.max(pire, t);
  }
  return pire + ETAPES.length * 3000 + margeMs;
}

let verdicts = [];
async function epreuve(nom, fn) {
  await tuerTousLesWorkers();
  log(nom, 'debut');
  try {
    await fn();
    verdicts.push({ nom, verdict: 'REUSSIE' });
    log(nom, 'REUSSIE');
  } catch (e) {
    verdicts.push({ nom, verdict: 'ECHEC', raison: e.message });
    log(nom, 'ECHEC', { raison: e.message });
  } finally {
    await tuerTousLesWorkers();
  }
}

// --- Campagne reproductible + ENREGISTREMENT de l'app (sync initiale). ---
await db.query(`truncate bench_job_state, bench_artefacts, bench_exec_log`);
log('CAMPAGNE', 'reset', { candidat: 'b-inngest' });
{
  const reg = lancerWorker('reg');
  await sleep(12000);
  if (reg.exitCode !== null) {
    const tail = readFileSync(join(HERE, 'results', 'worker-logs', 'reg.log'), 'utf8').slice(-800);
    log('CAMPAGNE', 'ECHEC enregistrement app', { exit: reg.exitCode, log: tail });
    console.error('Connexion Inngest impossible -- voir journal. Campagne annulee.');
    process.exit(1);
  }
  log('CAMPAGNE', 'app enregistree (connect OK)');
  await tuerTousLesWorkers();
}

// ---------- EPREUVE 1 : kill -9 pendant l'etape 3, reprise, 0 doublon ----------
await epreuve('E1-kill9', async () => {
  const J = 'ie1-job';
  await creerEtat(J);
  lancerWorker('ie1-a');
  await sleep(3000);
  await envoyer(J);
  await attendre(async () => (await execCount(J, 3, 'start')) >= 1,
    budgetMs([J], 240000), 'etape 3 demarree');
  const tKill = Date.now();
  for (const w of actifs) { w.kill('SIGKILL'); actifs.delete(w); }
  log('E1-kill9', 'worker tue en pleine etape 3 (SIGKILL)');
  lancerWorker('ie1-b');
  await attendre(async () => (await execCount(J, 3, 'start')) >= 2,
    600000, 'redelivrance de l etape 3');
  const redeliv = Math.round((Date.now() - tKill) / 1000);
  await attendre(async () => (await statut(J)) === 'done', budgetMs([J], 300000), 'job termine');
  const e1 = await execCount(J, 1, 'start'); // memoisation : jamais re-execute
  const arte = (await db.query(
    `select count(*)::int n from bench_artefacts where job_id=$1`, [J])).rows[0].n;
  log('E1-kill9', 'mesures', {
    reexecutions_etape3: await execCount(J, 3, 'start'),
    etape1_executions: e1, redelivrance_s: redeliv,
    artefacts: arte, dupliques: await artefactsDupliques(),
  });
  if (arte !== ETAPES.length) throw new Error(`artefacts=${arte}, attendu ${ETAPES.length}`);
  if (e1 !== 1) throw new Error(`etape 1 executee ${e1} fois : la memoisation n a pas tenu`);
});

// ---------- EPREUVE 2 : "crash orchestrateur" -> re-emission idempotente ----------
await epreuve('E2-orchestrateur', async () => {
  const jobs = Array.from({ length: 6 }, (_, i) => `ie2-job-${i + 1}`);
  for (const j of jobs) await creerEtat(j);
  lancerWorker('ie2');
  await sleep(3000);
  for (const j of jobs.slice(0, 3)) await envoyer(j); // "crash" apres 3
  for (const j of jobs) await envoyer(j);             // re-emission complete (memes ids)
  await attendre(async () => {
    for (const j of jobs) if ((await statut(j)) !== 'done') return false;
    return true;
  }, budgetMs(jobs, 300000), 'les 6 jobs termines');
  const arte = (await db.query(
    `select count(*)::int n from bench_artefacts where job_id like 'ie2-job-%'`)).rows[0].n;
  const demarrages = (await db.query(
    `select count(*)::int n from bench_exec_log where job_id like 'ie2-job-%' and etape=1 and evt='start'`)).rows[0].n;
  log('E2-orchestrateur', 'mesures', { jobs: jobs.length, artefacts: arte, demarrages_etape1: demarrages, dupliques: await artefactsDupliques() });
  if (arte !== 6 * ETAPES.length) throw new Error(`artefacts=${arte}, attendu ${6 * ETAPES.length}`);
  if (demarrages !== 6) throw new Error(`${demarrages} demarrages pour 6 jobs : deduplication non tenue`);
});

// ---------- EPREUVE 3 : annulation en etape 2 (cancelOn) ----------
await epreuve('E3-annulation', async () => {
  const J = 'ie3-job';
  await creerEtat(J);
  lancerWorker('ie3');
  await sleep(3000);
  await envoyer(J);
  await attendre(async () => (await execCount(J, 2, 'start')) >= 1,
    budgetMs([J], 240000), 'etape 2 demarree');
  await inngest.send({ name: 'bench/job.cancel', data: { job_id: J } });
  log('E3-annulation', 'evenement cancel emis');
  await sleep(FAST ? 8000 : 45000); // l'etape en cours peut finir, rien apres
  const e3 = await execCount(J, 3, 'start');
  const s = await statut(J);
  log('E3-annulation', 'mesures', { status: s, etape3_executee: e3 });
  if (e3 !== 0) throw new Error('une etape posterieure a l annulation a ete executee');
  if (s === 'done') throw new Error('le job est alle au bout malgre l annulation');
});

// ---------- EPREUVE 4 : echec repete -> exactement 2 tentatives puis failed ----------
await epreuve('E4-retry-borne', async () => {
  const J = 'ie4-job';
  await creerEtat(J, { fail_step: 2 });
  lancerWorker('ie4');
  await sleep(3000);
  await envoyer(J, { fail_step: 2 });
  await attendre(async () => (await statut(J)) === 'failed',
    budgetMs([J], 480000), 'status failed (via onFailure)');
  const tent = await execCount(J, 2, 'start');
  log('E4-retry-borne', 'mesures', { tentatives_etape2: tent });
  if (tent !== 2) throw new Error(`tentatives=${tent}, attendu exactement 2 (retries: 1)`);
});

// ---------- EPREUVE 5 : durabilite sans worker (fenetre PROUVEE vide) ----------
await epreuve('E5-durabilite', async () => {
  const jobs = ['ie5-job-1', 'ie5-job-2'];
  for (const j of jobs) await creerEtat(j);
  // AUCUN worker connecte : les evenements partent, rien ne doit s'executer.
  for (const j of jobs) await envoyer(j);
  await sleep(FAST ? 10000 : 60000);
  const pendant = (await db.query(
    `select count(*)::int n from bench_exec_log where job_id like 'ie5-%'`)).rows[0].n;
  if (pendant !== 0) throw new Error(`contamination : ${pendant} execution(s) pendant la fenetre sans worker`);
  log('E5-durabilite', 'fenetre sans worker prouvee vide');
  lancerWorker('ie5');
  await attendre(async () => {
    for (const j of jobs) if ((await statut(j)) !== 'done') return false;
    return true;
  }, budgetMs(jobs, 300000), 'jobs termines apres reconnexion');
  log('E5-durabilite', 'mesures', { jobs: jobs.length, dupliques: await artefactsDupliques() });
});

log('SYNTHESE', 'verdicts', { verdicts, journal: JOURNAL });
const echecs = verdicts.filter((v) => v.verdict !== 'REUSSIE').length;
console.log(`\n${5 - echecs}/5 epreuves reussies (candidat b-inngest) -- journal : ${JOURNAL}`);
process.exit(echecs === 0 ? 0 : 1);
