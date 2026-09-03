// BANC P-001 -- candidat (c) Trigger.dev (cloud manage) : les 5 epreuves du
// protocole, meme journal JSONL, memes verdicts stricts. Equivalences
// documentees en tete de src/trigger/bench.ts. Aucun worker local : les
// executions ont lieu sur l'infrastructure managee de Trigger.dev.
import { mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tasks, runs } from '@trigger.dev/sdk/v3';
import { pool, sleep, ETAPES, dureeMs } from '../lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const db = pool();
if (!process.env.TRIGGER_SECRET_KEY) {
  console.error('ARRET : TRIGGER_SECRET_KEY manquante.');
  process.exit(2);
}
if (!process.env.TRIGGER_SECRET_KEY.startsWith('tr_prod_')) {
  console.error('ARRET : cle non-Production -- la campagne officielle exige tr_prod_.');
  process.exit(2);
}

mkdirSync(join(HERE, 'results'), { recursive: true });
const JOURNAL = join(
  HERE, 'results',
  `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-epreuves-triggerdev.jsonl`,
);
const log = (epreuve, event, data = {}) => {
  const ligne = { t: new Date().toISOString(), officiel: true, candidat: 'c-triggerdev', epreuve, event, ...data };
  appendFileSync(JOURNAL, JSON.stringify(ligne) + '\n');
  console.log(`[${epreuve}] ${event}`, JSON.stringify(data));
};

async function attendre(cond, timeoutMs, quoi) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await cond()) return true;
    await sleep(500);
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
const declencher = (job, extra = {}, opts = {}) =>
  tasks.trigger('bench-pipeline', { job_id: job, ...extra }, { idempotencyKey: `run-${job}`, ...opts });

// Budget : etapes sequentielles par job + surcout d'ordonnancement manage
// (demarrage machine, planification par tache enfant) + marge.
function budgetMs(jobs, margeMs) {
  let pire = 0;
  for (const j of jobs) {
    let t = 0;
    for (let e = 1; e <= ETAPES.length; e++) t += dureeMs(j, e);
    pire = Math.max(pire, t);
  }
  return pire + ETAPES.length * 15000 + margeMs;
}

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

await db.query(`truncate bench_job_state, bench_artefacts, bench_exec_log`);
log('CAMPAGNE', 'reset', { candidat: 'c-triggerdev', execution: 'cloud manage, version deployee 20260827.1' });

// ---------- EPREUVE 1 : mort brutale du processus en pleine etape 3 ----------
await epreuve('E1-kill9', async () => {
  const J = 'tc-e1-job';
  await creerEtat(J);
  await declencher(J, { crash_once_step: 3 });
  await attendre(async () => (await execCount(J, 3, 'erreur')) >= 1,
    budgetMs([J], 300000), 'crash de l etape 3 (process.exit en pleine etape)');
  log('E1-kill9', 'processus de tache mort en pleine etape 3');
  await attendre(async () => (await statut(J)) === 'done', budgetMs([J], 480000), 'job termine');
  const starts3 = await execCount(J, 3, 'start');
  const starts1 = await execCount(J, 1, 'start');
  const arte = (await db.query(
    `select count(*)::int n from bench_artefacts where job_id=$1`, [J])).rows[0].n;
  const tps = await db.query(
    `select evt, quand from bench_exec_log where job_id=$1 and etape=3 order by quand`, [J]);
  const err1 = tps.rows.find((r) => r.evt === 'erreur');
  const start2 = tps.rows.filter((r) => r.evt === 'start')[1];
  const redeliv = err1 && start2 ? Math.round((start2.quand - err1.quand) / 1000) : null;
  log('E1-kill9', 'mesures', {
    reexecutions_etape3: starts3, etape1_executions: starts1,
    redelivrance_s: redeliv, artefacts: arte, dupliques: await artefactsDupliques(),
    note: 'etapes 1-2 non re-executees structurellement (le parent survit au crash de l enfant) ; idempotencyKey par etape en garde supplementaire',
  });
  if (starts3 !== 2) throw new Error(`etape 3 executee ${starts3} fois, attendu 2`);
  if (starts1 !== 1) throw new Error(`etape 1 executee ${starts1} fois : re-execution indue`);
  if (arte !== ETAPES.length) throw new Error(`artefacts=${arte}, attendu ${ETAPES.length}`);
});

// ---------- EPREUVE 2 : re-emission idempotente (12 envois -> 6 runs) ----------
await epreuve('E2-orchestrateur', async () => {
  const jobs = Array.from({ length: 6 }, (_, i) => `tc-e2-job-${i + 1}`);
  for (const j of jobs) await creerEtat(j);
  for (const j of jobs.slice(0, 3)) await declencher(j); // "crash" apres 3
  for (const j of jobs) await declencher(j);             // re-emission complete
  const budget = budgetMs(jobs, 600000);
  log('E2-orchestrateur', 'budget calcule', { budget_s: Math.round(budget / 1000) });
  await attendre(async () => {
    for (const j of jobs) if ((await statut(j)) !== 'done') return false;
    return true;
  }, budget, 'les 6 jobs termines');
  const arte = (await db.query(
    `select count(*)::int n from bench_artefacts where job_id like 'tc-e2-job-%'`)).rows[0].n;
  const demarrages = (await db.query(
    `select count(*)::int n from bench_exec_log where job_id like 'tc-e2-job-%' and etape=1 and evt='start'`)).rows[0].n;
  log('E2-orchestrateur', 'mesures', { jobs: jobs.length, artefacts: arte, demarrages_etape1: demarrages, dupliques: await artefactsDupliques() });
  if (arte !== 6 * ETAPES.length) throw new Error(`artefacts=${arte}, attendu ${6 * ETAPES.length}`);
  if (demarrages !== 6) throw new Error(`${demarrages} demarrages pour 6 jobs : deduplication non tenue`);
});

// ---------- EPREUVE 3 : annulation en etape 2 (runs.cancel) ----------
await epreuve('E3-annulation', async () => {
  const J = 'tc-e3-job';
  await creerEtat(J);
  const h = await declencher(J);
  await attendre(async () => (await execCount(J, 2, 'start')) >= 1,
    budgetMs([J], 300000), 'etape 2 demarree');
  await runs.cancel(h.id);
  log('E3-annulation', 'runs.cancel emis', { run_id: h.id });
  await sleep(45000); // l'etape en cours peut finir, rien apres
  const e3 = await execCount(J, 3, 'start');
  const s = await statut(J);
  log('E3-annulation', 'mesures', { status: s, etape3_executee: e3 });
  if (e3 !== 0) throw new Error('une etape posterieure a l annulation a ete executee');
  if (s === 'done') throw new Error('le job est alle au bout malgre l annulation');
});

// ---------- EPREUVE 4 : echec repete -> exactement 2 tentatives puis failed ----------
await epreuve('E4-retry-borne', async () => {
  const J = 'tc-e4-job';
  await creerEtat(J, { fail_step: 2 });
  await declencher(J, { fail_step: 2 });
  await attendre(async () => (await statut(J)) === 'failed',
    budgetMs([J], 480000), 'status failed');
  const tent = await execCount(J, 2, 'start');
  log('E4-retry-borne', 'mesures', { tentatives_etape2: tent });
  if (tent !== 2) throw new Error(`tentatives=${tent}, attendu exactement 2 (maxAttempts: 2)`);
});

// ---------- EPREUVE 5 : durabilite -- declenchements differes (equivalence) ----------
await epreuve('E5-durabilite', async () => {
  const jobs = ['tc-e5-job-1', 'tc-e5-job-2'];
  for (const j of jobs) await creerEtat(j);
  // Runtime managee : pas de worker a retirer. Equivalence documentee :
  // l'etat des runs DIFFERES vit cote plateforme pendant une fenetre ou
  // RIEN ne s'execute, puis reprend seul.
  for (const j of jobs) await declencher(j, {}, { delay: '60s' });
  await sleep(55000);
  const pendant = (await db.query(
    `select count(*)::int n from bench_exec_log where job_id like 'tc-e5-%'`)).rows[0].n;
  if (pendant !== 0) throw new Error(`contamination : ${pendant} execution(s) pendant la fenetre differee`);
  log('E5-durabilite', 'fenetre differee prouvee vide (55 s)');
  await attendre(async () => {
    for (const j of jobs) if ((await statut(j)) !== 'done') return false;
    return true;
  }, budgetMs(jobs, 480000), 'jobs termines apres la fenetre');
  log('E5-durabilite', 'mesures', { jobs: jobs.length, dupliques: await artefactsDupliques() });
});

log('SYNTHESE', 'verdicts', { verdicts, journal: JOURNAL });
const echecs = verdicts.filter((v) => v.verdict !== 'REUSSIE').length;
console.log(`\n${5 - echecs}/5 epreuves reussies (candidat c-triggerdev) -- journal : ${JOURNAL}`);
process.exit(echecs === 0 ? 0 : 1);
