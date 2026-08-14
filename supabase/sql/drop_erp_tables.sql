-- Phase 1 — Extraction ERP, étape finale : suppression des structures DB.
-- A executer manuellement dans l'editeur SQL Supabase (aucun outillage de
-- migration automatise n'existe dans ce repo).
--
-- Contexte : le code ERP (src/erp/, prisma/, routes /api/erp-*, /api/generator,
-- /api/customers, /api/vehicles, /api/drivers, /api/deliveries, /api/dashboard,
-- /api/stats, etc.) a deja ete retire. Les donnees de ces 10 tables ont deja
-- ete exportees (archive hors repository) puis videes (0 ligne, reverifie
-- juste avant ce fichier). Cette migration retire uniquement les structures
-- de table elles-memes, dernier vestige de l'ERP dans le schema.
--
-- Audit de validation (avant ce fichier) :
--   - 0 ligne dans les 10 tables, reverifie.
--   - 0 foreign key entrante ou sortante sur aucune des 10 tables (introspection
--     directe du schema reel via l'API OpenAPI de PostgREST, verification exacte
--     par nom de table, pas par sous-chaine).
--   - 0 reference dans le code source actuel (src/), recherche exhaustive.
--   - Aucune des 10 tables n'est referencee par une contrainte FK d'une des
--     22 autres tables du schema (32 tables au total avant suppression).
--
-- IF EXISTS : idempotent, sans erreur si une table a deja ete retiree par
-- un autre moyen entre l'audit et l'execution de ce fichier.
--
-- Volontairement SANS CASCADE : si une dependance reelle avait ete manquee
-- par l'audit, ce script echoue explicitement au lieu de supprimer en
-- silence des objets non prevus — echec loud plutot que succes silencieux
-- incorrect.

DROP TABLE IF EXISTS erp_records;
DROP TABLE IF EXISTS erp_members;
DROP TABLE IF EXISTS erp_activity_log;
DROP TABLE IF EXISTS erp_analysis_cache;
DROP TABLE IF EXISTS erps;

DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS customers;
