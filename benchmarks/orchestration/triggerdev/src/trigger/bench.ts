// BANC P-001 -- candidat (c) Trigger.dev : MEME charge que (a) et (b).
// Pipeline = tache parent orchestrant 5 taches-etapes enfants via
// triggerAndWait + idempotencyKey (equivalence de la memoisation).
//
// Equivalences d'epreuves (documentees, cf. protocole) :
//   redelivrance apres mort du worker : les workers sont MANAGES par la
//     plateforme -- equivalence = MORT BRUTALE du processus de tache en
//     pleine etape (process.exit(1) a la 1re tentative), reprise par le
//     retry de la tache enfant ;
//   memoisation : idempotencyKey par (job, etape) -- une etape terminee
//     n'est pas re-executee si le parent est rejoue ;
//   re-emission idempotente : idempotencyKey au declenchement du parent ;
//   annulation : runs.cancel (API) sur le run parent ;
//   retry borne : retry.maxAttempts = 2 sur la tache enfant, echec definitif
//     remonte au parent qui marque l'etat failed ;
//   durabilite sans worker : pas de worker a retirer (runtime managee) --
//     equivalence = declenchements DIFFERES (delay), fenetre prouvee vide
//     puis execution automatique.
import { task } from "@trigger.dev/sdk/v3";
import pg from "pg";

const ETAPES = ["intake", "resolve", "compile-sim", "verify-sim", "publish-sim"];

// COPIE EXACTE de lib.mjs (comparabilite inter-candidats) -- durees du
// protocole uniquement : la campagne cloud est toujours OFFICIELLE.
function dureeMs(jobId: string, etape: number): number {
  let h = 0;
  for (const c of `${jobId}:${etape}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 5000 + (h % 25000);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let _pool: pg.Pool | undefined;
function db(): pg.Pool {
  _pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  return _pool;
}

type EtapePayload = {
  job_id: string;
  etape: number;
  fail_step?: number;
  crash_once_step?: number;
};

export const benchEtape = task({
  id: "bench-etape",
  retry: { maxAttempts: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 4000, factor: 1.5, randomize: false },
  maxDuration: 120,
  run: async (p: EtapePayload) => {
    const c = db();
    await c.query(`insert into bench_exec_log (job_id, etape, evt) values ($1,$2,'start')`, [p.job_id, p.etape]);
    await c.query(
      `update bench_job_state set status='running', updated_at=now()
       where job_id=$1 and status in ('pending','running')`,
      [p.job_id],
    );
    if (p.fail_step === p.etape) {
      await c.query(`insert into bench_exec_log (job_id, etape, evt) values ($1,$2,'erreur')`, [p.job_id, p.etape]);
      throw new Error(`echec simule etape ${p.etape}`);
    }
    if (p.crash_once_step === p.etape) {
      // Mort BRUTALE du processus en pleine etape (equivalence kill -9),
      // UNE seule fois : la "premiere tentative" est detectee par l'etat en
      // base (0 ligne 'erreur' pour cette etape), independamment des champs
      // de contexte du SDK -- robuste aux changements de version majeure.
      const deja = await c.query(
        `select count(*)::int n from bench_exec_log where job_id=$1 and etape=$2 and evt='erreur'`,
        [p.job_id, p.etape],
      );
      if (deja.rows[0].n === 0) {
        await c.query(`insert into bench_exec_log (job_id, etape, evt) values ($1,$2,'erreur')`, [p.job_id, p.etape]);
        process.exit(1);
      }
    }
    await sleep(dureeMs(p.job_id, p.etape));
    await c.query(
      `insert into bench_artefacts (job_id, etape, contenu) values ($1,$2,$3)
       on conflict (job_id, etape) do nothing`,
      [p.job_id, p.etape, `artefact:${ETAPES[p.etape - 1]}`],
    );
    await c.query(`insert into bench_exec_log (job_id, etape, evt) values ($1,$2,'ok')`, [p.job_id, p.etape]);
    if (p.etape === ETAPES.length) {
      await c.query(
        `update bench_job_state set status='done', etape=$2, updated_at=now() where job_id=$1`,
        [p.job_id, p.etape],
      );
    }
    return { etape: p.etape };
  },
});

export const benchPipeline = task({
  id: "bench-pipeline",
  retry: { maxAttempts: 1 },
  maxDuration: 600,
  run: async (p: { job_id: string; fail_step?: number; crash_once_step?: number }) => {
    for (let e = 1; e <= ETAPES.length; e++) {
      const r = await benchEtape.triggerAndWait(
        { job_id: p.job_id, etape: e, fail_step: p.fail_step, crash_once_step: p.crash_once_step },
        { idempotencyKey: `${p.job_id}-etape-${e}` },
      );
      if (!r.ok) {
        await db().query(
          `update bench_job_state set status='failed', updated_at=now() where job_id=$1`,
          [p.job_id],
        );
        throw new Error(`etape ${e} en echec definitif`);
      }
    }
    return { job_id: p.job_id, etapes: ETAPES.length };
  },
});
