-- LOT J (Mode 3 global) -- F-CUSTOM-01/F-CUSTOM-04 : references de design
-- client-uploade liees au tenant (site) et a usage unique.
-- A executer manuellement dans l'editeur SQL Supabase (meme convention que
-- les autres fichiers de ce dossier).
--
-- ============================================================
-- CAUSE RACINE : checkout/route.ts (branche pod_custom) faisait confiance a
-- item.customDesignUrl/customDesigns[].url TELS QUELS, sans AUCUNE
-- verification que l'URL provenait reellement d'un upload effectue sur CE
-- site via /api/shop/upload-design. Consequences reelles, prouvees par
-- lecture du code (pas supposees) :
--   1. cross-tenant : une URL uploadee via le site A pouvait etre rejouee
--      dans une commande du site B (aucune notion de proprietaire).
--   2. reutilisation illimitee : la MEME URL pouvait etre utilisee dans un
--      nombre illimite de commandes distinctes.
--   3. injection arbitraire : rien n'empechait un appelant direct de cette
--      route (hors UI) de fournir N'IMPORTE QUELLE URL externe -- Nexiora
--      aurait alors paye le fournisseur POD pour fabriquer un produit a
--      partir d'un contenu jamais valide comme etant une image reelle,
--      encore moins un upload legitime.
-- design_uploads devient la source de verite unique : chaque URL utilisee
-- a la commande doit correspondre a une ligne existante, liee au bon
-- site_id, jamais deja consommee.
-- ============================================================

create table if not exists design_uploads (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  storage_path text not null,
  public_url text not null unique,
  mime_type text not null,
  created_at timestamptz not null default now(),
  -- NULL = disponible. Non-NULL = deja utilise dans une commande -- toute
  -- reutilisation ulterieure (autre commande, autre site) doit etre rejetee.
  consumed_at timestamptz,
  consumed_by_order_item_id uuid references shop_order_items(id) on delete set null
);

create index if not exists design_uploads_site_id_idx on design_uploads(site_id);
create index if not exists design_uploads_public_url_idx on design_uploads(public_url);

-- RLS : ecriture/lecture exclusivement service_role (meme patron que
-- shop_orders/shop_products -- aucun client anon/authenticated ne touche
-- jamais cette table directement, uniquement via les routes serveur qui
-- utilisent supabaseAdmin).
alter table design_uploads enable row level security;
revoke all on table design_uploads from anon, authenticated;
grant all on table design_uploads to service_role;

-- ------------------------------------------------------------
-- VERIFICATION (lecture seule) -- a executer et renvoyer.
-- ------------------------------------------------------------
SELECT table_name FROM information_schema.tables WHERE table_name = 'design_uploads';

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'design_uploads'
ORDER BY grantee, privilege_type;

SELECT relrowsecurity FROM pg_class WHERE relname = 'design_uploads';
