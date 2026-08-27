-- Étape 1/N — migration owner_id (chantier ownership/RLS sites).
-- À exécuter manuellement dans l'éditeur SQL Supabase (aucun outillage de
-- migration automatisé n'existe dans ce repo — voir fulfillment_tables.sql).
--
-- Additive, nullable, sans contrainte : opération de métadonnées, aucune
-- écriture de données, aucun risque pour les 11 sites réels existants.
-- Ne PAS ajouter NOT NULL ni la contrainte FK ici — étapes séparées,
-- après backfill vérifié.

alter table sites add column if not exists owner_id uuid;
