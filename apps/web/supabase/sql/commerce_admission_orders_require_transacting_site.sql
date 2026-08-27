-- =============================================================
-- PHASE M1-7 -- VERROU BASE DE DONNEES DE L'ADMISSION COMMERCIALE
--
-- Pendant SQL du module `src/lib/commerce-admission/canTransact.ts` (M1-1).
-- A executer manuellement dans l'editeur SQL Supabase : ce depot n'a aucun
-- outillage de migration automatise -- meme convention que
-- shop_order_status_machine.sql, sites_archive_rpc.sql,
-- shop_orders_fulfillment_domain_step*.sql. Ce fichier documente l'etat
-- REELLEMENT deploye ; il n'est rejoue par aucun pipeline.
--
-- ============================================================
-- L'INVARIANT POSE ICI, ET RIEN D'AUTRE
--
--     UNE COMMANDE NE PEUT EXISTER QUE POUR UN SITE EXPLICITEMENT
--     COMMERCANT, C'EST-A-DIRE sites.mode IN (2, 3).
--
-- Il se lit dans les deux sens, et les deux sont necessaires -- l'un sans
-- l'autre ne serait qu'une intention :
--
--   A. On ne cree pas une commande sur un site non commercant.
--   B. On ne rend pas non commercant un site qui porte deja des commandes.
--
-- Sans (B), (A) serait contournable en deux temps sans jamais rien violer :
-- creer la commande sur un site mode 2, puis basculer le site en mode 1.
-- L'etat final serait exactement celui que (A) interdit.
--
-- CE QUE CE VERROU N'EST PAS. Ce n'est pas du ROUTAGE. Il ne dit pas QUI
-- execute la vente -- cette question appartient a `fulfillment_domain` et a
-- `order-domain/resolve.ts`, et elle se pose EN AVAL, sur une commande deja
-- legitime. Ce fichier ne mentionne donc jamais `fulfillment_domain` : faire
-- dependre l'ADMISSION du domaine d'EXECUTION rejouerait exactement la
-- confusion que neuf phases ont servi a defaire. C'est une propriete
-- verifiee mecaniquement, pas une promesse : voir le test
-- src/lib/commerce-admission/__tests__/dbInvariant.test.ts.
--
-- ============================================================
-- MESURE PREALABLE EN PRODUCTION (2026-08-24), ET NON SUPPOSITION
--
-- La condition d'arret de M1-7 etait l'existence de donnees commerciales
-- historiques incompatibles avec l'invariant. Elle a ete levee par mesure
-- directe sur la base de production :
--
--   * denominateur          : shop_orders = 26 ; sites = 14, dont 4 en mode 1
--   * commandes incompatibles (LEFT JOIN shop_orders -> sites, retenant
--     site inexistant OU mode NULL OU mode NOT IN (2,3)) : 0 ligne
--   * repartition des 26    : 100 % mode_site = 3, fulfillment_domain =
--                             'supplier', du 2026-07-06 au 2026-08-22
--
-- CONSEQUENCE DIRECTE SUR LA FORME DE CE SCRIPT : aucune exemption
-- historique, aucune clause de grandfathering, aucun NOT VALID, aucune
-- regularisation. Le verrou s'applique a la totalite des lignes, passees
-- comprises, parce que la totalite des lignes le respecte deja. AUCUNE
-- commande n'est creee, modifiee ni supprimee par ce script.
--
-- Une exemption historique aurait ete une dette permanente introduite pour
-- un ensemble vide -- exactement le genre de fallback permissif que ce
-- chantier existe pour supprimer.
--
-- ============================================================
-- ETAT REEL DU SCHEMA, MESURE AVANT ECRITURE (introspection PostgREST de la
-- base de production, 2026-08-24) -- chacun de ces points change la forme du
-- script, aucun n'est suppose :
--
--   * sites.id            uuid, PRIMARY KEY
--   * sites.mode          SMALLINT, et NULLABLE (absent de `required`).
--                         => `new.mode NOT IN (2,3)` vaudrait NULL quand le
--                         mode est NULL, donc `if` faux, donc AUCUNE erreur
--                         levee : un fail-open silencieux. C'est la raison
--                         technique precise pour laquelle tout test de mode
--                         de ce fichier passe par site_mode_is_transacting(),
--                         qui coalesce en `false`.
--   * shop_orders.site_id uuid, NOT NULL, FOREIGN KEY -> sites.id
--                         (ON DELETE RESTRICT, cf. sites_archive_rpc.sql)
--   * shop_orders.fulfillment_domain NOT NULL (phase 2 etape 4 bien deployee)
--
-- POURQUOI LA FK NE SUFFIT PAS, ALORS QU'ELLE EXISTE DEJA. Une FK garantit
-- que le site EXISTE. Elle ne dit rien de son MODE, et surtout elle ne dit
-- rien du mode FUTUR : elle laisserait passer les deux moities du contournement
-- en deux temps decrit plus haut. La FK et ce verrou repondent a deux
-- questions differentes.
--
-- POURQUOI PAS UN CHECK. Un CHECK ne peut pas lire une autre table.
-- POURQUOI PAS UNE RLS POLICY. `service_role` la contourne integralement --
-- or `service_role` est precisement le seul role qui ecrit dans shop_orders.
-- POURQUOI PAS UN REVOKE. Sans effet sur le proprietaire de la table.
-- POURQUOI UN TRIGGER. Il s'applique a TOUS les roles, `service_role` et SQL
-- direct compris. Ce n'est pas une hypothese : ce depot applique deja ce
-- patron a ces deux tables exactement (shop_order_status_machine.sql,
-- shop_orders_fulfillment_domain_step3, reject_order_if_site_archived).
--
-- LIMITE HONNETE, IDENTIQUE A CELLE DEJA ACCEPTEE POUR `status` ET POUR
-- `fulfillment_domain` : un role SUPERUSER peut desactiver un trigger
-- (ALTER TABLE ... DISABLE TRIGGER, ou session_replication_role='replica').
-- PostgreSQL n'offre pas mieux. La garantie porte sur tout usage normal,
-- applicatif comme manuel.
--
-- IDEMPOTENT : `create or replace function` + `drop trigger if exists`.
-- Rejouable sans effet de bord.
-- =============================================================


-- -------------------------------------------------------------
-- 1/4 -- LA DEFINITION UNIQUE DE L'ALLOWLIST, COTE BASE.
--
-- POURQUOI UNE FONCTION DEDIEE PLUTOT QUE LA LISTE INLINE DANS CHAQUE
-- TRIGGER. Deux triggers ont besoin de la meme reponse. Ecrire la liste deux
-- fois, c'est accepter qu'un jour l'une soit modifiee sans l'autre -- et
-- l'ecart serait invisible : chaque trigger continuerait de fonctionner,
-- simplement en desaccord avec l'autre. La liste n'existe donc qu'ICI, en un
-- seul exemplaire, dans toute la base.
--
-- POURQUOI UNE ALLOWLIST ET NON `mode <> 1`. Ecrire « tout sauf le mode 1 »
-- fait du commerce le comportement PAR DEFAUT : un mode 4 ajoute demain
-- serait commercant sans que personne l'ait decide, et aucun test ne le
-- verrait. L'allowlist inverse la charge de la preuve -- un mode ne commerce
-- que s'il a ete inscrit ici, explicitement. C'est mot pour mot la regle deja
-- posee cote TypeScript dans TRANSACTING_SITE_MODES, et c'est la meme lecon
-- que la garde `= 'supplier'` de la phase 3 : on nomme ce qu'on autorise,
-- jamais ce qu'on exclut.
--
-- FAIL-CLOSED SUR NULL, EXPLICITEMENT. `p_mode = any(...)` vaut NULL quand
-- p_mode est NULL -- et un `if NULL then raise` ne leve JAMAIS. Le
-- `coalesce(..., false)` n'est pas une precaution decorative : il est la
-- seule chose qui empeche un site de mode NULL d'etre traite comme
-- commercant. sites.mode EST nullable en production (mesure ci-dessus).
--
-- IMMUTABLE : la fonction ne lit aucune table et ne depend que de son
-- argument -- ce qui autorise le planificateur a l'evaluer une seule fois.
-- -------------------------------------------------------------
create or replace function site_mode_is_transacting(p_mode smallint)
returns boolean
language sql
immutable
parallel safe
as $$
  select coalesce(p_mode = any (array[2, 3]::smallint[]), false);
$$;

comment on function site_mode_is_transacting(smallint) is
  'Ce mode de site est-il explicitement admis a produire un artefact commercial ? Allowlist positive : seuls 2 et 3 le sont. NULL, 0, 1 et tout mode futur non inscrit obtiennent false (fail-closed). Pendant SQL de TRANSACTING_SITE_MODES (src/lib/commerce-admission/canTransact.ts) -- les deux listes doivent rester identiques, propriete verifiee par src/lib/commerce-admission/__tests__/dbInvariant.test.ts. Ne decide QUE de l''admission : ni du routage d''execution (fulfillment_domain), ni du stock, ni du paiement.';


-- -------------------------------------------------------------
-- 2/4 -- SENS A : UNE COMMANDE NAIT SUR UN SITE COMMERCANT.
--
-- Couvre INSERT et UPDATE OF site_id. Le second n'est pas theorique : sans
-- lui, on ne pourrait pas creer une commande sur un site mode 1, mais on
-- pourrait l'y DEPLACER apres coup -- meme etat final, meme violation.
--
-- SITE INTROUVABLE => REFUS. Ce cas est reellement atteignable malgre la FK :
-- un trigger BEFORE INSERT s'execute AVANT la verification de la contrainte
-- de cle etrangere. A cet instant precis, le site peut ne pas exister (et
-- new.site_id peut meme etre NULL, le NOT NULL n'etant pas encore verifie).
-- La regle est donc explicite et sans exception : UN SITE INEXISTANT N'EST
-- JAMAIS CONSIDERE COMME COMMERCANT. On ne se repose pas sur la FK pour
-- refuser -- on refuse d'abord, la FK refuserait ensuite.
--
-- `FOR SHARE` -- FERMETURE D'UNE COURSE REELLE, PAS UNE PRECAUTION DE STYLE.
-- Sans verrou, deux transactions concurrentes peuvent violer l'invariant sans
-- qu'aucune des deux ne voie quoi que ce soit d'anormal :
--     T1 : INSERT commande sur le site X (mode 2) -> le trigger A voit mode 2, accepte
--     T2 : UPDATE sites SET mode = 1 WHERE id = X -> le trigger B ne voit
--          aucune commande (celle de T1 n'est pas encore validee), accepte
--     les deux valident -> une commande existe sur un site mode 1.
-- C'est une ecriture oblique (write skew) classique, et les deux triggers
-- pris isolement sont impuissants contre elle. `FOR SHARE` sur la ligne du
-- site la ferme : un UPDATE de sites prend un verrou FOR NO KEY UPDATE, qui
-- est INCOMPATIBLE avec FOR SHARE -- T2 attend donc la fin de T1, puis
-- reevalue et voit la commande.
--
-- (`FOR KEY SHARE` serait insuffisant ici : il est justement compatible avec
-- FOR NO KEY UPDATE, donc il ne bloquerait pas le changement de mode.)
--
-- PRIVILEGE EXIGE PAR `FOR SHARE`, ET SA CONSEQUENCE : PostgreSQL demande le
-- privilege UPDATE sur au moins une colonne de la table verrouillee, en plus
-- de SELECT. `service_role` -- le seul role qui ecrit dans shop_orders (cf.
-- 4/4) -- le detient sur `sites`. Un role qui ne le detiendrait pas obtiendrait
-- « permission denied », c'est-a-dire un REFUS de l'INSERT : degrade, mais
-- fail-closed. Aucun manque de privilege ne peut se transformer en
-- autorisation.
--
-- COUT REEL DE CE VERROU, MESURE ET NON SUPPOSE : FOR SHARE est compatible
-- avec lui-meme -- deux commandes simultanees sur le meme site ne s'attendent
-- jamais. Le seul conflit possible est avec un UPDATE de la ligne du site,
-- et les ecritures de shop_orders passent par PostgREST, qui n'execute qu'UNE
-- instruction par requete HTTP : le verrou est donc tenu le temps d'un seul
-- INSERT. Aucune transaction longue n'existe sur ce chemin.
--
-- ROUND-TRIP TOLERE. Reecrire le MEME site_id n'est pas un deplacement :
-- meme convention que enforce_shop_order_status_transition() et
-- enforce_fulfillment_domain_immutable(). Cela protege d'un futur code qui
-- inclurait la colonne dans un UPDATE sans vouloir la changer.
-- -------------------------------------------------------------
create or replace function enforce_shop_order_site_is_transacting()
returns trigger
language plpgsql
security invoker
as $$
declare
  v_mode smallint;
begin
  -- Reecriture du meme site : ce n'est pas un deplacement.
  if TG_OP = 'UPDATE' and new.site_id is not distinct from old.site_id then
    return new;
  end if;

  select s.mode into v_mode
  from sites s
  where s.id = new.site_id
  for share;

  if not found then
    raise exception
      'ORDER_SITE_NOT_TRANSACTING: site_id=% introuvable (op=%). Un site inexistant n''est jamais commercant : une commande ne peut exister que pour un site explicitement commercant (sites.mode IN (2,3)).',
      new.site_id, TG_OP
      using errcode = 'P0001';
  end if;

  if not site_mode_is_transacting(v_mode) then
    raise exception
      'ORDER_SITE_NOT_TRANSACTING: site_id=% mode=% (op=%). Une commande ne peut exister que pour un site explicitement commercant (sites.mode IN (2,3)) : une vitrine presente un business, elle ne le fait pas commercer.',
      new.site_id, coalesce(v_mode::text, 'NULL'), TG_OP
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_shop_order_site_is_transacting_insert on shop_orders;
create trigger trg_shop_order_site_is_transacting_insert
  before insert on shop_orders
  for each row
  execute function enforce_shop_order_site_is_transacting();

-- `before update OF site_id` : le trigger ne se reveille QUE si la colonne
-- figure dans le SET. Un UPDATE de `status` ou de `tracking_number` seul ne le
-- declenche pas -- cout nul sur les 23 chemins d'UPDATE existants de
-- shop_orders, et aucun verrou FOR SHARE pris sur leur passage.
drop trigger if exists trg_shop_order_site_is_transacting_update on shop_orders;
create trigger trg_shop_order_site_is_transacting_update
  before update of site_id on shop_orders
  for each row
  execute function enforce_shop_order_site_is_transacting();


-- -------------------------------------------------------------
-- 3/4 -- SENS B : UN SITE QUI PORTE DES COMMANDES NE PEUT PLUS SORTIR DE
-- L'ALLOWLIST.
--
-- PORTEE STRICTEMENT LIMITEE A M1-7, ET C'EST DELIBERE. Ce trigger ne se
-- prononce QUE sur une chose : l'incompatibilite entre un mode non commercant
-- et des commandes DEJA EXISTANTES. Il ne dit rien de la politique generale
-- des transitions de mode -- quelles transitions sont legitimes en soi, dans
-- quel sens, sous quelles conditions produit. Cette question appartient a
-- M1-8 et n'est pas prejugee ici.
--
-- Concretement : un site SANS commande n'est pas concerne par ce trigger, et
-- 2 -> 3 comme 3 -> 2 restent libres. Interdire ces cas ici serait decider a
-- la place de M1-8, sans l'avoir mesure.
--
-- POURQUOI `site_mode_is_transacting(new.mode)` EN SORTIE ANTICIPEE PLUTOT
-- QUE `new.mode = 1`. Meme raison qu'au 1/4, et le piege est ici encore plus
-- discret : passer un site en mode NULL ou en mode 4 le rendrait tout aussi
-- non commercant qu'un mode 1, et une condition ecrite sur `1` laisserait
-- passer les deux en silence.
--
-- `old.id` ET NON `new.id` : les commandes existantes referencent l'identite
-- ACTUELLE de la ligne. (Un changement de `sites.id` serait de toute facon
-- refuse par la FK ON DELETE RESTRICT de shop_orders.)
-- -------------------------------------------------------------
create or replace function enforce_site_mode_keeps_orders_valid()
returns trigger
language plpgsql
security invoker
as $$
declare
  v_orders bigint;
begin
  -- Reecriture de la meme valeur : ce n'est pas une transition.
  if new.mode is not distinct from old.mode then
    return new;
  end if;

  -- Le site reste commercant : hors du perimetre de M1-7.
  if site_mode_is_transacting(new.mode) then
    return new;
  end if;

  select count(*) into v_orders
  from shop_orders
  where site_id = old.id;

  if v_orders > 0 then
    raise exception
      'SITE_MODE_WOULD_ORPHAN_ORDERS: % -> % (site_id=%, commandes=%). Un site qui porte des commandes ne peut pas devenir non commercant : ces ventes cesseraient d''etre rattachees a un site autorise a vendre. Les commandes existantes doivent d''abord etre traitees, jamais supprimees pour debloquer ce changement.',
      coalesce(old.mode::text, 'NULL'), coalesce(new.mode::text, 'NULL'), old.id, v_orders
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- `before update OF mode` : aucun autre UPDATE de sites (nom, theme,
-- publication, domaine, contenu genere...) ne reveille ce trigger.
drop trigger if exists trg_site_mode_keeps_orders_valid on sites;
create trigger trg_site_mode_keeps_orders_valid
  before update of mode on sites
  for each row
  execute function enforce_site_mode_keeps_orders_valid();


-- -------------------------------------------------------------
-- 4/4 -- PRIVILEGES.
--
-- ORDRE IMPERATIF : ces REVOKE doivent rester APRES les `create trigger`.
-- PostgreSQL exige EXECUTE sur la fonction au moment du CREATE TRIGGER, mais
-- PAS a son declenchement -- propriete prouvee comportementalement sur cette
-- base le 2026-08-22 (cf. phase2_privileges_hardening.sql, meme patron).
--
-- OBJECTIF CHIFFRE : `fn_exposees` doit rester a 0, la valeur de reference
-- etablie par phase2_privileges_hardening.sql. Trois fonctions sont ajoutees
-- ici ; sans ces REVOKE, PostgreSQL accorderait EXECUTE a PUBLIC par defaut et
-- ce compteur passerait a 3.
--
-- CAS PARTICULIER DE site_mode_is_transacting() : contrairement a une fonction
-- trigger, elle est APPELEE depuis le corps des deux fonctions ci-dessus --
-- et pour un appel ordinaire, PostgreSQL verifie bien EXECUTE au moment de
-- l'appel. Le GRANT doit donc couvrir tout role capable d'ecrire dans
-- shop_orders.site_id ou dans sites.mode.
--
-- QUELS ROLES, MESURE ET NON SUPPOSE : lot_g_final_field_level_authorization.sql
-- REVOKE UPDATE/INSERT/DELETE sur `sites` a anon et authenticated, puis
-- re-GRANT UPDATE colonne par colonne sur 41 colonnes dont `mode` est
-- EXPLICITEMENT exclu (liste des 18 colonnes protegees, verifiee
-- comportementalement). Et le bilan de phase2 releve `ecritures=1` --
-- l'unique privilege d'ecriture restant pour anon/authenticated sur toute la
-- base, qui est precisement ce GRANT UPDATE sur sites. anon et authenticated
-- n'ont donc AUCUNE ecriture possible sur shop_orders, ni sur sites.mode.
-- `service_role` suffit.
--
-- ET SI CE CONSTAT CHANGEAIT UN JOUR ? Un role sans EXECUTE obtiendrait
-- « permission denied for function site_mode_is_transacting » -- c'est-a-dire
-- un REFUS de l'ecriture. Degrade, mais fail-closed : il n'existe aucun
-- chemin par lequel l'absence de privilege devienne une autorisation.
-- -------------------------------------------------------------
revoke all on function site_mode_is_transacting(smallint) from public, anon, authenticated;
grant execute on function site_mode_is_transacting(smallint) to service_role;

revoke all on function enforce_shop_order_site_is_transacting() from public, anon, authenticated;
grant execute on function enforce_shop_order_site_is_transacting() to service_role;

revoke all on function enforce_site_mode_keeps_orders_valid() from public, anon, authenticated;
grant execute on function enforce_site_mode_keeps_orders_valid() to service_role;


-- =============================================================
-- VERIFICATIONS APRES APPLICATION
-- =============================================================
--
-- A. LECTURE SEULE -- inventaire de ce qui est reellement installe, et sur
-- quelles colonnes exactement. La colonne `portee` est le point important :
-- un trigger dont la portee se serait elargie a toute la table (colonnes NULL)
-- couterait un verrou FOR SHARE sur chaque UPDATE de commande.
--
--   select t.tgname,
--          c.relname as table_cible,
--          case when t.tgattr = '' or t.tgattr is null then 'TOUTE LA TABLE'
--               else (select string_agg(a.attname, ', ')
--                     from unnest(string_to_array(t.tgattr::text, ' ')::int[]) k
--                     join pg_attribute a on a.attrelid = t.tgrelid and a.attnum = k)
--          end as portee,
--          t.tgenabled
--   from pg_trigger t join pg_class c on c.oid = t.tgrelid
--   where not t.tgisinternal
--     and c.relname in ('shop_orders', 'sites')
--   order by c.relname, t.tgname;
--   -- attendu, pour les 3 triggers de M1-7 :
--   --   sites       | trg_site_mode_keeps_orders_valid           | mode    | O
--   --   shop_orders | trg_shop_order_site_is_transacting_insert  | TOUTE LA TABLE | O
--   --   shop_orders | trg_shop_order_site_is_transacting_update  | site_id | O
--   -- (`TOUTE LA TABLE` est normal pour un trigger INSERT : la clause
--   --  `UPDATE OF` n'existe pas a l'INSERT.)
--   -- tgenabled = 'O' pour les trois : un 'D' signifierait trigger DESACTIVE,
--   -- donc verrou inexistant -- STOP.
--   -- Cette requete affiche AUSSI les triggers preexistants
--   -- (reject_order_if_site_archived, trg_enforce_shop_order_status_*,
--   -- trg_enforce_fulfillment_domain_immutable) : leur presence confirme
--   -- qu'aucun `drop trigger` de ce script n'a emporte autre chose.
--
-- B. LECTURE SEULE -- `fn_exposees` doit valoir 0, comme avant ce script
--    (reference phase2_privileges_hardening.sql, production 2026-08-22).
--
--   select count(*) as fn_exposees
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and (has_function_privilege('anon', p.oid, 'EXECUTE')
--       or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
--   -- attendu : 0. Toute autre valeur = un REVOKE du 4/4 a ete oublie.
--
-- C. LECTURE SEULE -- l'invariant tient sur les donnees DEJA EN BASE.
--    C'est la requete de diagnostic de M1-7, rejouee apres coup : elle doit
--    continuer a retourner 0. Si elle retournait une ligne APRES installation,
--    cela signifierait qu'un chemin d'ecriture a echappe aux triggers.
--
--   select count(*) as commandes_hors_invariant
--   from shop_orders o
--   left join sites s on s.id = o.site_id
--   where s.id is null or not site_mode_is_transacting(s.mode);
--   -- attendu : 0 (mesure du 2026-08-24 : 26 commandes, toutes sur mode 3)
--
-- D. LECTURE SEULE -- index de couverture du sens B. Le trigger de sites
--    compte les commandes du site : sans index sur shop_orders(site_id), ce
--    comptage est un parcours complet de table. Sans objet a 26 lignes,
--    a surveiller a l'echelle.
--
--   select indexname, indexdef from pg_indexes
--   where tablename = 'shop_orders' and indexdef like '%site_id%';
--   -- si vide : envisager `create index concurrently ... on shop_orders(site_id)`.
--   -- Volontairement NON cree ici : ce serait une optimisation non mesuree,
--   -- hors du contrat de M1-7.
-- =============================================================


-- =============================================================
-- E. PREUVE COMPORTEMENTALE COMPLETE -- 20 cas.
--
-- Sans elle, tout ce qui precede ne serait qu'une intention. Meme convention
-- que shop_order_status_machine.sql : chaque etape produit un NOTICE
-- 'REUSSI', ou interrompt le bloc avec 'TEST FAILED' en identifiant
-- precisement l'etape en cause. Aucune ambiguite : soit les 20 NOTICE
-- apparaissent, soit une erreur nomme l'etape qui a devie.
--
-- AUCUNE ECRITURE DURABLE, PAR CONSTRUCTION ET NON PAR DISCIPLINE. Le bloc
-- se termine TOUJOURS par une exception volontaire : PostgreSQL annule alors
-- l'integralite de la transaction, y compris les sites et commandes jetables
-- creees en cours de route. Il n'y a pas de `delete` de nettoyage a oublier,
-- et un arret premature ne laisse rien derriere lui non plus. Les NOTICE,
-- eux, ont deja ete envoyes au client et survivent au rollback.
--
-- AUCUNE DONNEE REELLE N'EST LUE NI TOUCHEE, a une exception pres et
-- assumee : un `select ... limit 1` sur `sites` sert a EMPRUNTER des valeurs
-- valides (owner_id, theme, cj_*) pour les sites jetables. Emprunter plutot
-- que deviner garantit que les INSERT de fixtures ne se heurtent pas a une
-- contrainte CHECK sans rapport avec M1-7 -- un echec de fixture ressemblerait
-- a un echec de verrou.
--
-- MESSAGE FINAL ATTENDU :
--   ERROR: M1-7 : 20/20 preuves passees -- rollback volontaire, aucune ecriture conservee.
-- C'est le SUCCES. Toute autre erreur est un echec.
-- =============================================================
DO $$
DECLARE
  v_owner   uuid;
  v_theme   text;
  v_margin  numeric;
  v_round   text;
  v_s1      uuid;  -- mode 1    (vitrine)
  v_s2      uuid;  -- mode 2    (commercant, portera une commande)
  v_s3      uuid;  -- mode 3    (commercant, portera une commande)
  v_sn      uuid;  -- mode NULL (inconnu)
  v_s4      uuid;  -- mode 4    (futur, non inscrit dans l'allowlist)
  v_sfree   uuid;  -- mode 2    (commercant, ne portera JAMAIS de commande)
  v_o2      uuid;  -- commande du site mode 2
  v_o3      uuid;  -- commande du site mode 3
  v_ghost   uuid := gen_random_uuid();  -- site_id qui n'existe pas
  v_n       integer := 0;
BEGIN
  select s.owner_id, s.theme, s.cj_margin_percent, s.cj_round_mode
    into v_owner, v_theme, v_margin, v_round
  from sites s limit 1;
  if v_owner is null then
    raise exception 'TEST FAILED (fixtures) : aucun site existant dont emprunter des valeurs valides';
  end if;

  -- Identifiants generes AVANT l'INSERT, jamais relus par nom : une relecture
  -- par nom pourrait ramener une autre ligne du meme proprietaire et faire
  -- porter les preuves sur un site reel. Ici, chaque id est connu d'avance.
  v_s1 := gen_random_uuid(); v_s2 := gen_random_uuid(); v_s3    := gen_random_uuid();
  v_sn := gen_random_uuid(); v_s4 := gen_random_uuid(); v_sfree := gen_random_uuid();

  insert into sites (id, slug, name, theme, published, cj_margin_percent, cj_round_mode, owner_id, mode)
  values
    (v_s1,    'm17-'||v_s1,    'M1-7 jetable mode 1',    v_theme, false, v_margin, v_round, v_owner, 1),
    (v_s2,    'm17-'||v_s2,    'M1-7 jetable mode 2',    v_theme, false, v_margin, v_round, v_owner, 2),
    (v_s3,    'm17-'||v_s3,    'M1-7 jetable mode 3',    v_theme, false, v_margin, v_round, v_owner, 3),
    (v_sn,    'm17-'||v_sn,    'M1-7 jetable mode NULL', v_theme, false, v_margin, v_round, v_owner, null),
    (v_s4,    'm17-'||v_s4,    'M1-7 jetable mode 4',    v_theme, false, v_margin, v_round, v_owner, 4),
    (v_sfree, 'm17-'||v_sfree, 'M1-7 jetable sans cmd',  v_theme, false, v_margin, v_round, v_owner, 2);
  raise notice 'Fixtures creees : 6 sites jetables (modes 1, 2, 3, NULL, 4, 2-sans-commande).';

  -- ---------------------------------------------------------
  -- SENS A / INSERT -- les refus (1 a 5).
  -- 'pending' et un fulfillment_domain licite sont fournis UNIQUEMENT pour
  -- satisfaire les contraintes preexistantes (machine a etats, NOT NULL) :
  -- si l'INSERT est refuse, ce doit etre par le verrou de M1-7 et par rien
  -- d'autre -- d'ou la verification stricte du prefixe de l'erreur.
  -- ---------------------------------------------------------
  begin
    insert into shop_orders (site_id, status, total, currency, payment_provider, fulfillment_domain)
    values (v_s1, 'pending', 0, 'usd', 'stripe', 'merchant');
    raise exception 'TEST FAILED (1) : INSERT sur un site mode 1 aurait du etre REFUSE';
  exception when others then
    if sqlerrm like 'ORDER_SITE_NOT_TRANSACTING%' then v_n := v_n + 1;
      raise notice 'TEST 1 REUSSI : INSERT sur site mode 1 refuse.';
    else raise exception 'TEST FAILED (1, erreur inattendue) : %', sqlerrm; end if;
  end;

  begin
    insert into shop_orders (site_id, status, total, currency, payment_provider, fulfillment_domain)
    values (v_sn, 'pending', 0, 'usd', 'stripe', 'merchant');
    raise exception 'TEST FAILED (2) : INSERT sur un site mode NULL aurait du etre REFUSE';
  exception when others then
    if sqlerrm like 'ORDER_SITE_NOT_TRANSACTING%' then v_n := v_n + 1;
      raise notice 'TEST 2 REUSSI : INSERT sur site mode NULL refuse (fail-closed).';
    else raise exception 'TEST FAILED (2, erreur inattendue) : %', sqlerrm; end if;
  end;

  begin
    insert into shop_orders (site_id, status, total, currency, payment_provider, fulfillment_domain)
    values (v_s4, 'pending', 0, 'usd', 'stripe', 'merchant');
    raise exception 'TEST FAILED (3) : INSERT sur un site mode 4 aurait du etre REFUSE';
  exception when others then
    if sqlerrm like 'ORDER_SITE_NOT_TRANSACTING%' then v_n := v_n + 1;
      raise notice 'TEST 3 REUSSI : INSERT sur site mode 4 (futur non inscrit) refuse.';
    else raise exception 'TEST FAILED (3, erreur inattendue) : %', sqlerrm; end if;
  end;

  -- ---------------------------------------------------------
  -- TESTS 4 ET 5 -- UN SITE NON RESOLVABLE, SUR LE CHEMIN INSERT.
  --
  -- CORRECTION ISSUE DE L'EXECUTION REELLE EN PRODUCTION (2026-08-24), et
  -- non d'une relecture : la premiere version de ces deux tests exigeait le
  -- prefixe 'ORDER_SITE_NOT_TRANSACTING' et a echoue. Le refus etait bien
  -- la ; il venait d'un AUTRE garde.
  --
  -- POURQUOI. PostgreSQL declenche les triggers BEFORE par ordre
  -- ALPHABETIQUE de nom. Sur shop_orders :
  --     trg_reject_order_if_site_archived          <- 'r' : parle en premier
  --     trg_shop_order_site_is_transacting_insert  <- 's' : le verrou M1-7
  -- Et reject_order_if_site_archived() (mesure du 2026-08-24 : BEFORE INSERT
  -- uniquement) s'ecrit :
  --     perform 1 from sites where id = new.site_id and archived_at is null for share;
  --     if not found then raise 'SITE_ARCHIVED: ...'
  -- Un site INEXISTANT -- et un site_id NULL, puisque `id = NULL` ne ramene
  -- aucune ligne -- y tombent exactement comme un site archive. Ce garde
  -- refuse donc ces deux cas AVANT que le verrou de M1-7 ne soit consulte.
  --
  -- CE N'EST PAS UN AFFAIBLISSEMENT, C'EST UNE DEFENSE EN PROFONDEUR : deux
  -- gardes independants, tous deux fail-closed, couvrent le meme cas. Le
  -- constat est favorable ; seule l'assertion du banc etait fausse.
  --
  -- CE QUI RESTE EXIGE, INTACT : l'INSERT doit etre REFUSE, et par un garde
  -- NOMME. Accepter n'importe quelle erreur laisserait passer une violation
  -- de FK ou de NOT NULL -- c'est-a-dire un refus obtenu par ACCIDENT plutot
  -- que par REGLE, ce qui ne prouverait rien. Les deux gardes licites sont
  -- donc enumeres, et le test rapporte lequel a parle.
  --
  -- ET LA BRANCHE « SITE INTROUVABLE » DU VERROU M1-7 RESTE PROUVEE : au
  -- test 11, sur le chemin UPDATE, ou le garde « site archive » ne se
  -- declenche pas (INSERT-only, mesure). Elle demeure par ailleurs le filet
  -- si ce garde venait un jour a disparaitre.
  -- ---------------------------------------------------------
  begin
    insert into shop_orders (site_id, status, total, currency, payment_provider, fulfillment_domain)
    values (v_ghost, 'pending', 0, 'usd', 'stripe', 'merchant');
    raise exception 'TEST FAILED (4) : INSERT sur un site inexistant aurait du etre REFUSE';
  exception when others then
    if sqlerrm like 'ORDER_SITE_NOT_TRANSACTING%' or sqlerrm like 'SITE_ARCHIVED%' then v_n := v_n + 1;
      raise notice 'TEST 4 REUSSI : INSERT sur site inexistant refuse -- garde ayant parle : %.',
        case when sqlerrm like 'SITE_ARCHIVED%'
             then 'trg_reject_order_if_site_archived (prealable, alphabetiquement premier)'
             else 'trg_shop_order_site_is_transacting_insert (M1-7)' end;
    else raise exception 'TEST FAILED (4, refus obtenu par accident et non par regle -- ni M1-7 ni le garde site-archive n''ont parle) : %', sqlerrm; end if;
  end;

  begin
    insert into shop_orders (site_id, status, total, currency, payment_provider, fulfillment_domain)
    values (null, 'pending', 0, 'usd', 'stripe', 'merchant');
    raise exception 'TEST FAILED (5) : INSERT avec site_id NULL aurait du etre REFUSE';
  exception when others then
    if sqlerrm like 'ORDER_SITE_NOT_TRANSACTING%' or sqlerrm like 'SITE_ARCHIVED%' then v_n := v_n + 1;
      raise notice 'TEST 5 REUSSI : INSERT avec site_id NULL refuse -- garde ayant parle : %.',
        case when sqlerrm like 'SITE_ARCHIVED%'
             then 'trg_reject_order_if_site_archived (prealable, alphabetiquement premier)'
             else 'trg_shop_order_site_is_transacting_insert (M1-7)' end;
    else raise exception 'TEST FAILED (5, refus obtenu par accident et non par regle) : %', sqlerrm; end if;
  end;

  -- ---------------------------------------------------------
  -- SENS A / INSERT -- les acceptations (6 et 7).
  -- Un verrou qui refuse tout n'est pas un verrou, c'est une panne.
  -- ---------------------------------------------------------
  begin
    insert into shop_orders (site_id, status, total, currency, payment_provider, fulfillment_domain)
    values (v_s2, 'pending', 0, 'usd', 'stripe', 'merchant') returning id into v_o2;
    v_n := v_n + 1; raise notice 'TEST 6 REUSSI : INSERT sur site mode 2 accepte (id=%).', v_o2;
  exception when others then
    raise exception 'TEST FAILED (6) : INSERT sur site mode 2 aurait du etre ACCEPTE, obtenu : %', sqlerrm;
  end;

  begin
    insert into shop_orders (site_id, status, total, currency, payment_provider, fulfillment_domain)
    values (v_s3, 'pending', 0, 'usd', 'stripe', 'supplier') returning id into v_o3;
    v_n := v_n + 1; raise notice 'TEST 7 REUSSI : INSERT sur site mode 3 accepte (id=%).', v_o3;
  exception when others then
    raise exception 'TEST FAILED (7) : INSERT sur site mode 3 aurait du etre ACCEPTE, obtenu : %', sqlerrm;
  end;

  -- ---------------------------------------------------------
  -- SENS A / UPDATE OF site_id -- les refus (8 a 11).
  -- Sans ce trigger, on ne pourrait pas CREER une commande sur un site
  -- mode 1, mais on pourrait l'y DEPLACER : meme etat final.
  -- ---------------------------------------------------------
  begin
    update shop_orders set site_id = v_s1 where id = v_o2;
    raise exception 'TEST FAILED (8) : deplacer une commande vers un site mode 1 aurait du etre REFUSE';
  exception when others then
    if sqlerrm like 'ORDER_SITE_NOT_TRANSACTING%' then v_n := v_n + 1;
      raise notice 'TEST 8 REUSSI : UPDATE site_id -> mode 1 refuse.';
    else raise exception 'TEST FAILED (8, erreur inattendue) : %', sqlerrm; end if;
  end;

  begin
    update shop_orders set site_id = v_sn where id = v_o2;
    raise exception 'TEST FAILED (9) : deplacer une commande vers un site mode NULL aurait du etre REFUSE';
  exception when others then
    if sqlerrm like 'ORDER_SITE_NOT_TRANSACTING%' then v_n := v_n + 1;
      raise notice 'TEST 9 REUSSI : UPDATE site_id -> mode NULL refuse.';
    else raise exception 'TEST FAILED (9, erreur inattendue) : %', sqlerrm; end if;
  end;

  begin
    update shop_orders set site_id = v_s4 where id = v_o2;
    raise exception 'TEST FAILED (10) : deplacer une commande vers un site mode 4 aurait du etre REFUSE';
  exception when others then
    if sqlerrm like 'ORDER_SITE_NOT_TRANSACTING%' then v_n := v_n + 1;
      raise notice 'TEST 10 REUSSI : UPDATE site_id -> mode 4 refuse.';
    else raise exception 'TEST FAILED (10, erreur inattendue) : %', sqlerrm; end if;
  end;

  begin
    update shop_orders set site_id = v_ghost where id = v_o2;
    raise exception 'TEST FAILED (11) : deplacer une commande vers un site inexistant aurait du etre REFUSE';
  exception when others then
    if sqlerrm like 'ORDER_SITE_NOT_TRANSACTING%' then v_n := v_n + 1;
      raise notice 'TEST 11 REUSSI : UPDATE site_id -> site inexistant refuse par le verrou M1-7 SEUL (le garde site-archive est INSERT-only : c''est ICI que la branche « site introuvable » est prouvee en isolation).';
    else raise exception 'TEST FAILED (11, erreur inattendue) : %', sqlerrm; end if;
  end;

  -- ---------------------------------------------------------
  -- SENS A / UPDATE OF site_id -- les acceptations (12 a 14).
  -- v_o3 sert de mobile : v_o2 reste sur v_s2, qui doit porter une commande
  -- pour les tests de retrogradation qui suivent.
  -- ---------------------------------------------------------
  begin
    update shop_orders set site_id = v_s2 where id = v_o3;
    v_n := v_n + 1; raise notice 'TEST 12 REUSSI : UPDATE site_id -> mode 2 accepte.';
  exception when others then
    raise exception 'TEST FAILED (12) : UPDATE site_id -> mode 2 aurait du etre ACCEPTE, obtenu : %', sqlerrm;
  end;

  begin
    update shop_orders set site_id = v_s3 where id = v_o3;
    v_n := v_n + 1; raise notice 'TEST 13 REUSSI : UPDATE site_id -> mode 3 accepte.';
  exception when others then
    raise exception 'TEST FAILED (13) : UPDATE site_id -> mode 3 aurait du etre ACCEPTE, obtenu : %', sqlerrm;
  end;

  begin
    update shop_orders set site_id = v_s2 where id = v_o2;  -- meme valeur
    v_n := v_n + 1; raise notice 'TEST 14 REUSSI : round-trip site_id (meme valeur) accepte.';
  exception when others then
    raise exception 'TEST FAILED (14) : le round-trip site_id aurait du etre ACCEPTE, obtenu : %', sqlerrm;
  end;

  -- ---------------------------------------------------------
  -- SENS B / UPDATE OF sites.mode -- les refus (15 a 17).
  -- v_s2 porte v_o2 a ce stade.
  -- ---------------------------------------------------------
  begin
    update sites set mode = 1 where id = v_s2;
    raise exception 'TEST FAILED (15) : retrograder en mode 1 un site avec commandes aurait du etre REFUSE';
  exception when others then
    if sqlerrm like 'SITE_MODE_WOULD_ORPHAN_ORDERS%' then v_n := v_n + 1;
      raise notice 'TEST 15 REUSSI : mode 2 -> 1 refuse sur un site portant des commandes.';
    else raise exception 'TEST FAILED (15, erreur inattendue) : %', sqlerrm; end if;
  end;

  begin
    update sites set mode = null where id = v_s2;
    raise exception 'TEST FAILED (16) : passer en mode NULL un site avec commandes aurait du etre REFUSE';
  exception when others then
    if sqlerrm like 'SITE_MODE_WOULD_ORPHAN_ORDERS%' then v_n := v_n + 1;
      raise notice 'TEST 16 REUSSI : mode 2 -> NULL refuse (le piege du NOT IN est bien evite).';
    else raise exception 'TEST FAILED (16, erreur inattendue) : %', sqlerrm; end if;
  end;

  begin
    update sites set mode = 4 where id = v_s2;
    raise exception 'TEST FAILED (17) : passer en mode 4 un site avec commandes aurait du etre REFUSE';
  exception when others then
    if sqlerrm like 'SITE_MODE_WOULD_ORPHAN_ORDERS%' then v_n := v_n + 1;
      raise notice 'TEST 17 REUSSI : mode 2 -> 4 (futur non inscrit) refuse.';
    else raise exception 'TEST FAILED (17, erreur inattendue) : %', sqlerrm; end if;
  end;

  -- ---------------------------------------------------------
  -- SENS B -- ce que M1-7 ne doit PAS interdire (18 a 20).
  -- La portee de ce verrou s'arrete a l'incompatibilite avec des commandes
  -- existantes. Tout le reste appartient a M1-8, qui n'est pas prejuge ici.
  -- ---------------------------------------------------------
  begin
    update sites set mode = 3 where id = v_s2;
    v_n := v_n + 1; raise notice 'TEST 18 REUSSI : 2 -> 3 accepte, le site reste commercant (M1-7 ne s''en mele pas).';
  exception when others then
    raise exception 'TEST FAILED (18) : 2 -> 3 aurait du etre ACCEPTE, obtenu : %', sqlerrm;
  end;

  begin
    update sites set mode = 1 where id = v_sfree;
    v_n := v_n + 1; raise notice 'TEST 19 REUSSI : 2 -> 1 accepte sur un site SANS commande -- M1-7 ne se prononce pas, la politique generale des transitions appartient a M1-8.';
  exception when others then
    raise exception 'TEST FAILED (19) : 2 -> 1 sur un site sans commande aurait du etre ACCEPTE par M1-7, obtenu : %', sqlerrm;
  end;

  begin
    update sites set name = 'M1-7 renomme' where id = v_s2;
    v_n := v_n + 1; raise notice 'TEST 20 REUSSI : UPDATE d''une colonne sans rapport, sur un site portant des commandes, non bloque (portee minimale du trigger).';
  exception when others then
    raise exception 'TEST FAILED (20) : un UPDATE hors de la colonne mode ne doit jamais reveiller ce trigger, obtenu : %', sqlerrm;
  end;

  if v_n <> 20 then
    raise exception 'TEST FAILED (bilan) : % preuves comptees au lieu de 20', v_n;
  end if;

  raise exception 'M1-7 : 20/20 preuves passees -- rollback volontaire, aucune ecriture conservee.';
END $$;
