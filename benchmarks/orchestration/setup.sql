-- BANC P-001 -- installation (rejouable, jamais sur la base de production).
create extension if not exists pgmq;

-- File des messages : un message = une etape d'un job.
select pgmq.create('bench_jobs') where not exists (
  select 1 from pgmq.list_queues() where queue_name = 'bench_jobs'
);

-- Machine a etats explicite (ARCHITECTURE section 14 : etat inspectable en SQL).
create table if not exists bench_job_state (
  job_id     text primary key,
  etape      int  not null default 1,          -- prochaine etape a executer (1..5)
  status     text not null default 'pending'
             check (status in ('pending','running','done','cancelled','failed')),
  payload    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Artefacts idempotents : LA preuve d'epreuve 1/2 -- une (job, etape) ne peut
-- produire qu'UN artefact, quelle que soit la redelivrance.
create table if not exists bench_artefacts (
  job_id   text not null,
  etape    int  not null,
  contenu  text not null,
  cree_le  timestamptz not null default now(),
  primary key (job_id, etape)
);

-- Journal d'executions : detecte les RE-executions (attendues apres kill -9)
-- sans jamais violer l'unicite des artefacts.
create table if not exists bench_exec_log (
  id      bigint generated always as identity primary key,
  job_id  text not null,
  etape   int  not null,
  evt     text not null check (evt in ('start','ok','erreur')),
  quand   timestamptz not null default now()
);
