-- Bloc 2 (extension Admin) — surveillance anti-régression visible dans l'Admin.
-- A executer manuellement dans l'editeur SQL Supabase (aucun outillage de
-- migration automatise n'existe dans ce repo — meme convention que
-- fulfillment_tables.sql).
--
-- Alimentee par l'etape "Report system health" de .github/workflows/ci.yml,
-- a chaque execution de la CI (succes ou echec). Lue par
-- /api/admin/system-health, affichee sur /admin/system-health.
--
-- RLS activee SANS policy permissive : refus par defaut pour anon/authenticated.
-- Le service role (utilise par supabaseAdmin cote app, et par le secret CI
-- SUPABASE_SERVICE_ROLE_KEY) contourne toujours RLS, donc rien ne change
-- pour /api/admin/system-health ni pour le script de reporting -- seule la
-- cle publique anon (NEXT_PUBLIC_SUPABASE_ANON_KEY, exposee cote client)
-- perd tout acces direct a cette table. Choix delibere : je n'ai pas pu
-- verifier si cron_runs/checkout_anomalies ont reellement RLS active côté
-- Supabase (aucun acces direct au projet), donc plutot que de supposer et
-- de reproduire une eventuelle faille, cette table est verrouillee par
-- defaut des sa creation.

create table if not exists system_health_checks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  commit_sha text not null,
  branch text not null,
  workflow_run_url text,
  overall_status text not null,       -- 'success' | 'failure'
  typecheck_status text not null,     -- 'success' | 'failure'
  build_status text not null,         -- 'success' | 'failure'
  total_tests integer not null default 0,
  failed_tests integer not null default 0,
  -- [{ domainId, status, failures: [{ test, message }] }] — un domaine
  -- n'apparait ici que s'il a echoue. La liste des domaines SURVEILLES
  -- (qu'ils aient echoue ou non) vient de DOMAIN_REGISTRY (code), pas de
  -- cette table — voir src/lib/architecture/domainRegistry.ts.
  domains jsonb not null default '[]'::jsonb,
  -- Echecs de tests qui n'appartiennent a aucun domaine enregistre —
  -- garantit que le rapport reste utile meme pour des tests hors du
  -- systeme de frontieres de domaine.
  raw_failures jsonb not null default '[]'::jsonb
);

create index if not exists idx_system_health_checks_created_at
  on system_health_checks(created_at desc);

create index if not exists idx_system_health_checks_branch_created_at
  on system_health_checks(branch, created_at desc);

alter table system_health_checks enable row level security;
-- Aucune policy créée volontairement : anon/authenticated n'ont donc aucun
-- accès (ni lecture ni écriture). Seul le service role (bypass RLS by
-- design côté Postgres/Supabase) peut lire ou écrire cette table.
