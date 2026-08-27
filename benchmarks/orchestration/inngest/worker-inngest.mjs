// BANC P-001 -- candidat (b) Inngest : worker en mode CONNECT (connexion
// sortante vers Inngest Cloud, sans URL publique). MEME charge que (a) :
// pipeline 5 etapes, durees deterministes, instrumentation dans la meme base
// de test (bench_job_state / bench_artefacts / bench_exec_log).
//
// Equivalences d'epreuves (candidat (a) -> (b)) :
//   redelivrance apres kill -9  : visibility timeout pgmq -> re-dispatch du
//                                 step par l'orchestrateur cloud (steps
//                                 anterieurs memoises, jamais re-executes) ;
//   re-enfilage idempotent      : etat-avant-message -> `id` d'evenement
//                                 (deduplication cote plateforme) ;
//   annulation                  : flag en base lu avant chaque etape ->
//                                 `cancelOn` natif apparie par job_id ;
//   retry borne (2 tentatives)  : compteur exec_log -> `retries: 1` ;
//   echec propre                : status failed en base -> hook `onFailure`.
import { Inngest } from 'inngest';
import { connect } from 'inngest/connect';
import { pool, ETAPES, dureeMs, sleep } from '../lib.mjs';

if (process.env.INNGEST_DEV) {
  console.error('ARRET : INNGEST_DEV est positionne -- le banc doit mesurer le CLOUD.');
  process.exit(2);
}
if (!process.env.INNGEST_EVENT_KEY || !process.env.INNGEST_SIGNING_KEY) {
  console.error('ARRET : cles Inngest manquantes.');
  process.exit(2);
}

const db = pool();
const inngest = new Inngest({ id: 'deribfy-bench-p001', eventKey: process.env.INNGEST_EVENT_KEY });

const pipeline = inngest.createFunction(
  {
    id: 'bench-pipeline',
    retries: 1, // = 2 tentatives au total (epreuve E4)
    cancelOn: [{ event: 'bench/job.cancel', if: 'event.data.job_id == async.data.job_id' }],
    onFailure: async ({ event }) => {
      const jobId = event?.data?.event?.data?.job_id;
      if (jobId) {
        await db.query(
          `update bench_job_state set status='failed', updated_at=now() where job_id=$1`,
          [jobId],
        );
      }
    },
  },
  { event: 'bench/job.run' },
  async ({ event, step }) => {
    const { job_id, fail_step } = event.data;
    for (let e = 1; e <= ETAPES.length; e++) {
      // step.run : memoise cote orchestrateur -- une etape terminee n'est
      // JAMAIS re-executee, meme apres kill -9 du worker.
      await step.run(`etape-${e}-${ETAPES[e - 1]}`, async () => {
        await db.query(
          `insert into bench_exec_log (job_id, etape, evt) values ($1,$2,'start')`,
          [job_id, e],
        );
        await db.query(
          `update bench_job_state set status='running', updated_at=now()
           where job_id=$1 and status in ('pending','running')`,
          [job_id],
        );
        if (fail_step === e) {
          await db.query(
            `insert into bench_exec_log (job_id, etape, evt) values ($1,$2,'erreur')`,
            [job_id, e],
          );
          throw new Error(`echec simule etape ${e}`);
        }
        await sleep(dureeMs(job_id, e)); // le "travail" -- fenetre du kill -9
        await db.query(
          `insert into bench_artefacts (job_id, etape, contenu) values ($1,$2,$3)
           on conflict (job_id, etape) do nothing`,
          [job_id, e, `artefact:${ETAPES[e - 1]}`],
        );
        await db.query(
          `insert into bench_exec_log (job_id, etape, evt) values ($1,$2,'ok')`,
          [job_id, e],
        );
        if (e === ETAPES.length) {
          await db.query(
            `update bench_job_state set status='done', etape=$2, updated_at=now() where job_id=$1`,
            [job_id, e],
          );
        }
        return { etape: e };
      });
    }
    return { job_id, etapes: ETAPES.length };
  },
);

const WORKER = process.env.BENCH_WORKER_ID ?? String(process.pid);
console.log(`[worker-inngest ${WORKER}] connexion a Inngest Cloud...`);
const conn = await connect({
  apps: [{ client: inngest, functions: [pipeline] }],
  instanceId: `bench-${WORKER}`,
});
console.log(`[worker-inngest ${WORKER}] connecte (etat: ${conn.state})`);

let stopping = false;
const arret = async () => {
  if (stopping) return;
  stopping = true;
  console.log(`[worker-inngest ${WORKER}] arret propre`);
  try { await conn.close(); } catch {}
  process.exit(0);
};
process.on('SIGTERM', arret);
process.on('SIGINT', arret);
