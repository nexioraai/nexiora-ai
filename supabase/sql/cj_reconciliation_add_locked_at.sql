-- MODE 3 — Reseller/CJ — conception A+ reconciliation/retry.
--
-- Objectif unique de cette migration : dater l'acquisition du verrou
-- cj_pay_status='processing' pour pouvoir distinguer un verrou légitimement
-- en cours (worker toujours actif) d'un verrou abandonné (crash/timeout
-- avant écriture d'un état terminal) — cf. audit Reseller/CJ, §6.
--
-- Purement additive, backward-compatible :
--   - colonne nullable, aucun défaut requis ;
--   - IF NOT EXISTS : rejouable sans effet si déjà appliquée ;
--   - aucune contrainte CHECK ajoutée sur cj_pay_status : aucune contrainte
--     de ce type n'a été trouvée dans les migrations commitées ni dans le
--     code (cancel_shop_order écrit déjà 'canceled' sans qu'aucune
--     contrainte ne bloque cette valeur) — ajouter une nouvelle valeur
--     ('blocked_terminal', 'blocked_unknown') ne nécessite donc aucune
--     modification de schéma, uniquement du code applicatif.
--
-- IMPORTANT (à vérifier manuellement avant/juste après application) :
-- cette absence de contrainte est établie par preuve indirecte (code
-- existant fonctionnel), pas par lecture directe du schéma live (aucun
-- accès SQL arbitraire disponible pour cette tâche). Si une contrainte
-- CHECK existe malgré tout et bloque 'blocked_terminal'/'blocked_unknown',
-- l'écriture applicative échouera immédiatement et bruyamment (jamais
-- silencieusement) — vérifier `\d shop_orders` dans l'éditeur SQL Supabase
-- avant mise en production si un doute subsiste.

alter table shop_orders
  add column if not exists cj_pay_locked_at timestamptz;

comment on column shop_orders.cj_pay_locked_at is
  'Horodatage de la dernière acquisition du verrou cj_pay_status=''processing''. NULL si jamais verrouillée. Permet au cron de réconciliation de détecter et reprendre un verrou abandonné après crash.';
