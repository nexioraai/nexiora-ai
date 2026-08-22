-- MODE 3 — Reseller/CJ — audit rate-limit A+ (question posée à répétition :
-- "le throttle 1100ms est-il réellement global au compte CJ ?"). Réponse
-- honnête avant cette migration : NON, chaque invocation serverless a son
-- propre minuteur mémoire, aucune coordination entre instances.
--
-- Cette table est le socle d'un rate-limiter GLOBAL réel : une ligne
-- singleton, réclamée atomiquement (UPDATE...WHERE...RETURNING, même
-- primitif déjà prouvé fiable cette session pour le verrou de claim
-- fulfillment — 8/8 essais concurrents réels, mutex par ligne shop_orders).
--
-- Purement additive : nouvelle table, aucune colonne existante touchée.
-- Le code (src/lib/cj/rateLimiter.ts) dégrade gracieusement si cette table
-- n'existe pas encore (délai fixe de repli) -- contrairement à la migration
-- précédente (cj_pay_locked_at), un déploiement AVANT application de celle-ci
-- ne casse rien, juste ne bénéficie pas encore de la coordination globale.

create table if not exists cj_rate_limiter (
  id integer primary key,
  last_call_at timestamptz not null default (now() - interval '10 seconds')
);

insert into cj_rate_limiter (id, last_call_at)
values (1, now() - interval '10 seconds')
on conflict (id) do nothing;

comment on table cj_rate_limiter is
  'Ligne singleton (id=1) : horodatage du dernier appel CJ réellement effectué, toutes instances/routes confondues. Réclamée atomiquement pour garantir le débit CJ (~1 req/s) à l''échelle du compte, pas seulement par processus.';
