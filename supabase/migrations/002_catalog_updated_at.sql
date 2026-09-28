-- =====================================================================
-- BATOPS — Sprint 1 : date de dernière modification des articles du catalogue.
-- Non destructif : ajout de colonne idempotent. Les documents déjà émis conservent
-- leurs prix (copiés dans leurs lignes JSONB) ; seul le catalogue est horodaté.
-- Les nouveaux types d'événements de timeline (client_updated, client_converted,
-- equipment_updated, equipment_removed) ne demandent aucun changement : colonne text.
-- =====================================================================

alter table public.catalog_items add column if not exists updated_at timestamptz;
