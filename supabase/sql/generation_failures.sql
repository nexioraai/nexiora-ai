-- Correction A+ de l'incident "boutique en ligne mode 2" (contradiction entre
-- getSectorPrompt('shop') et les regles Mode 2/3 sur le champ "products").
-- A executer manuellement dans l'editeur SQL Supabase (aucun outillage de
-- migration automatise n'existe dans ce repo -- meme convention que
-- system_health_checks.sql / fulfillment_tables.sql).
--
-- Journalise chaque echec de generation (JSON.parse ou GeneratedSiteSchema
-- rejete) avec assez de contexte pour diagnostiquer sans reproduire une
-- generation reelle (stop_reason, distinction JSON malforme vs schema
-- rejete, fin du texte brut -- pas le debut, une troncature se manifeste a
-- la fin). Alimentee par src/lib/generationFailures.ts, appelee depuis
-- src/app/api/chat/route.ts.
--
-- RLS activee SANS policy permissive : meme choix que system_health_checks
-- (DEBT-004) -- anon/authenticated n'ont aucun acces, seul le service role
-- (deja utilise par ce endpoint) peut lire/ecrire.

create table if not exists generation_failures (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_id uuid,
  owner_email text,
  requested_mode integer,        -- siteMode connu avant l'appel (chemin onboarding-chat), null si wizard classique
  detected_sector text not null, -- valeur de detectSector() au moment de l'echec
  failure_type text not null,    -- 'json_parse' | 'schema_validation'
  stop_reason text,              -- stop_reason renvoye par l'API Anthropic ('end_turn' | 'max_tokens' | ...)
  zod_issues jsonb,              -- issues structurees si failure_type = 'schema_validation'
  parse_error text,              -- message si failure_type = 'json_parse'
  raw_response_tail text not null, -- derniers ~3000 caracteres du texte brut renvoye par le modele
  message_excerpt text not null    -- 500 premiers caracteres du message utilisateur ayant declenche la generation
);

create index if not exists idx_generation_failures_created_at
  on generation_failures(created_at desc);

create index if not exists idx_generation_failures_failure_type
  on generation_failures(failure_type, created_at desc);

alter table generation_failures enable row level security;
-- Aucune policy creee volontairement : anon/authenticated n'ont donc aucun
-- acces (ni lecture ni ecriture). Seul le service role (bypass RLS by design
-- cote Postgres/Supabase, utilise par supabaseAdmin dans generationFailures.ts)
-- peut lire ou ecrire cette table.
