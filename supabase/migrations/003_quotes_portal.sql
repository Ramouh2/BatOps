-- =====================================================================
-- BATOPS — Sprint 2 : devis, portail client et signature électronique.
-- Non destructif : uniquement des ajouts de colonnes idempotents.
--  - equipment_id     : équipement du parc concerné par le devis ;
--  - discount_percent : remise saisie en % (le montant discount_amount_ht reste la référence comptable) ;
--  - notes            : précisions imprimées pour le client ;
--  - viewed_at        : première consultation sur le portail /portal/[token] ;
--  - updated_at       : dernière modification du brouillon.
-- La signature (signed_at, signed_by_name, signature_data_url), le refus (refused_at, refusal_reason)
-- et le lien interventions.quote_id existent depuis 001. Les nouveaux types d'événements de timeline
-- (quote_updated, quote_deleted, quote_viewed, quote_comment) ne demandent rien : colonne text.
-- =====================================================================

alter table public.quotes add column if not exists equipment_id uuid references public.equipment(id) on delete set null;
alter table public.quotes add column if not exists discount_percent numeric(5,2) check (discount_percent is null or (discount_percent >= 0 and discount_percent <= 100));
alter table public.quotes add column if not exists notes text;
alter table public.quotes add column if not exists viewed_at timestamptz;
alter table public.quotes add column if not exists updated_at timestamptz;
