-- =====================================================================
-- BATOPS — schéma initial (miroir de src/types/batops.ts)
--
-- Non utilisé par la démo (store local). Prêt à être appliqué sur un projet
-- Supabase le jour où NEXT_PUBLIC_SUPABASE_URL est renseigné.
-- Migration non destructive : aucune suppression, uniquement des créations
-- idempotentes (IF NOT EXISTS).
-- Montants en euros NUMERIC(12,2). Lignes de documents, checklists, pièces,
-- paiements et transcriptions en JSONB (mêmes structures que les types TS).
-- =====================================================================

-- gen_random_uuid() est natif depuis PostgreSQL 13 (aucune extension requise).

-- ---------------------------------------------------------------------
-- Organisation & équipe
-- ---------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text not null,
  trade_types text[] not null default array['climatisation','chauffage','plomberie']::text[],
  default_hourly_rate numeric(10,2) not null default 68.00,
  default_travel_fee numeric(10,2) not null default 59.00,
  default_vat_rate numeric(4,2) not null default 10.00 check (default_vat_rate in (5.5, 10, 20)),
  default_deposit_percent numeric(5,2) not null default 30.00,
  payment_terms_days integer not null default 15,
  quote_validity_days integer not null default 30,
  subscription_plan text not null default 'equipe' check (subscription_plan in ('solo','equipe','entreprise')),
  brand_color text not null default '#2563EB',
  logo_url text,
  email text,
  phone text,
  address text,
  postal_code text,
  city text,
  siret text,
  rcs text,
  tva_number text,
  share_capital text,
  decennial_insurance jsonb,            -- { insurer, policy_number, coverage_area }
  rge_number text,
  certifications text[] not null default array[]::text[],
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null check (role in ('owner','dispatcher','technician','accountant')),
  job_title text not null default '',
  color_hex text not null default '#2563EB',
  is_active boolean not null default true,
  phone text,
  specialties text[] not null default array[]::text[],
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- CRM
-- ---------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'prospect' check (status in ('prospect','client')),
  type text not null default 'particulier' check (type in ('particulier','professionnel','syndic')),
  civility text check (civility in ('M.','Mme','M. et Mme')),
  first_name text,
  last_name text not null,
  company_name text,
  email text,
  phone text not null,
  address text not null,
  postal_code text not null,
  city text not null,
  access_notes text,
  source text check (source in ('nora_ia','telephone','recommandation','site_web')),
  notes text,
  housing_over_2_years boolean,
  portal_token text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  category text not null check (category in ('climatisation','pac_air_eau','pac_air_air','chaudiere','ballon_ecs','vmc','tableau_elec','autre')),
  brand text not null,
  model text not null,
  serial_number text,
  refrigerant_type text check (refrigerant_type in ('R32','R410A','R290')),
  installation_date date,
  warranty_end_date date,
  location_in_property text,
  notes text,
  installed_by_intervention_id uuid,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------
create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference text not null,
  name text not null,
  description text,
  category text not null check (category in ('main_oeuvre','deplacement','fourniture','forfait','maintenance')),
  unit text not null check (unit in ('u','h','m','forfait')),
  buying_price_ht numeric(10,2) not null default 0,
  selling_price_ht numeric(10,2) not null,
  vat_rate numeric(4,2) not null check (vat_rate in (5.5, 10, 20)),
  supplier_name text,
  equipment_template jsonb,             -- { category, brand, model, refrigerant_type, warranty_years }
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, reference)
);

-- ---------------------------------------------------------------------
-- Documents commerciaux
-- ---------------------------------------------------------------------
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  reference text not null,
  title text not null,
  status text not null default 'brouillon' check (status in ('brouillon','envoye','accepte','refuse','expire')),
  issue_date date not null default current_date,
  valid_until date not null,
  site_address text not null,
  site_postal_code text not null,
  site_city text not null,
  items jsonb not null default '[]'::jsonb,   -- DocumentLine[]
  subtotal_ht numeric(12,2) not null default 0,
  discount_amount_ht numeric(12,2) not null default 0,
  total_ht numeric(12,2) not null default 0,
  total_tva numeric(12,2) not null default 0,
  total_ttc numeric(12,2) not null default 0,
  estimated_cost_ht numeric(12,2) not null default 0,
  estimated_margin_ht numeric(12,2) not null default 0,
  deposit_percent numeric(5,2) not null default 30,
  conditions text,
  ai_generated boolean not null default false,
  call_log_id uuid,
  created_by_user_id uuid references public.users(id) on delete set null,
  sent_at timestamptz,
  last_reminder_at timestamptz,
  signed_at timestamptz,
  signed_by_name text,
  signature_data_url text,
  refused_at timestamptz,
  refusal_reason text,
  created_at timestamptz not null default now(),
  unique (organization_id, reference)
);

-- ---------------------------------------------------------------------
-- Maintenance (avant interventions : référencé par contract_id)
-- ---------------------------------------------------------------------
create table if not exists public.maintenance_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  equipment_id uuid references public.equipment(id) on delete set null,
  catalog_item_id uuid references public.catalog_items(id) on delete set null,
  reference text not null,
  name text not null,
  annual_price_ht numeric(10,2) not null,
  vat_rate numeric(4,2) not null check (vat_rate in (5.5, 10, 20)),
  annual_price_ttc numeric(10,2) not null,
  start_date date not null,
  next_visit_date date not null,
  last_visit_date date,
  status text not null default 'actif' check (status in ('actif','expire')),
  created_at timestamptz not null default now(),
  unique (organization_id, reference)
);

-- ---------------------------------------------------------------------
-- Terrain
-- ---------------------------------------------------------------------
create table if not exists public.interventions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  contract_id uuid references public.maintenance_contracts(id) on delete set null,
  call_log_id uuid,
  equipment_id uuid references public.equipment(id) on delete set null,
  assigned_technician_id uuid references public.users(id) on delete set null,
  reference text not null,
  title text not null,
  type text not null check (type in ('installation','depannage','maintenance','sav')),
  priority text not null default 'normale' check (priority in ('normale','haute','urgente')),
  status text not null default 'nouvelle' check (status in ('nouvelle','planifiee','en_route','sur_place','en_cours','terminee','annulee')),
  address text not null,
  postal_code text not null,
  city text not null,
  site_label text,
  duration_minutes integer not null default 120,
  is_billable boolean not null default true,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  en_route_at timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  description text,
  checklist jsonb not null default '[]'::jsonb,   -- ChecklistItem[]
  parts_used jsonb not null default '[]'::jsonb,  -- PartUsed[]
  technician_report_notes text,
  anomalies_found text,
  recommendations text,
  client_signature_url text,
  signed_by_name text,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, reference)
);

create table if not exists public.job_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intervention_id uuid not null references public.interventions(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  category text not null check (category in ('avant','pendant','apres','anomalie','plaque_materiel')),
  image_url text not null,
  caption text,
  taken_at timestamptz not null default now(),
  taken_by_user_id uuid references public.users(id) on delete set null
);

-- ---------------------------------------------------------------------
-- Facturation
-- ---------------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  intervention_id uuid references public.interventions(id) on delete set null,
  contract_id uuid references public.maintenance_contracts(id) on delete set null,
  credited_invoice_id uuid references public.invoices(id) on delete set null,
  reference text not null,
  invoice_type text not null default 'facture' check (invoice_type in ('acompte','facture','avoir')),
  -- « en_retard » et « partiellement_payee » sont dérivés (échéance + paiements), jamais stockés.
  status text not null default 'brouillon' check (status in ('brouillon','emise','payee','annulee')),
  title text not null,
  issue_date date not null default current_date,
  due_date date not null,
  items jsonb not null default '[]'::jsonb,               -- DocumentLine[]
  subtotal_ht numeric(12,2) not null default 0,
  discount_amount_ht numeric(12,2) not null default 0,
  total_ht numeric(12,2) not null default 0,
  total_tva numeric(12,2) not null default 0,
  total_ttc numeric(12,2) not null default 0,
  deposit_deductions jsonb not null default '[]'::jsonb,  -- DepositDeduction[]
  amount_due_ttc numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  payments jsonb not null default '[]'::jsonb,            -- InvoicePayment[]
  notes text,
  created_at timestamptz not null default now(),
  unique (organization_id, reference)
);

-- ---------------------------------------------------------------------
-- Appels (Nora), timeline client, journal d'envoi, numérotation
-- ---------------------------------------------------------------------
create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  intervention_id uuid references public.interventions(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  handled_by text not null default 'nora' check (handled_by in ('nora','bureau')),
  caller_name text not null,
  caller_phone text not null,
  caller_address text,
  caller_postal_code text,
  caller_city text,
  urgency text not null default 'normale' check (urgency in ('basse','normale','haute','urgente')),
  detected_intent text not null check (detected_intent in ('depannage','devis_installation','entretien','information')),
  equipment_mentioned text,
  summary text not null,
  preferred_slot text,
  transcript jsonb not null default '[]'::jsonb,   -- TranscriptTurn[]
  duration_seconds integer not null default 0,
  status text not null default 'qualifie_ia' check (status in ('qualifie_ia','a_rappeler','converti')),
  created_at timestamptz not null default now()
);

create table if not exists public.client_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  type text not null,
  title text not null,
  description text,
  actor_name text,
  entity jsonb,                          -- { kind, id }
  created_at timestamptz not null default now()
);

create table if not exists public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null check (channel in ('email','sms')),
  "to" text not null,
  subject text,
  body text not null,
  client_id uuid references public.clients(id) on delete set null,
  entity jsonb,
  provider_mode text not null check (provider_mode in ('mock','live')),
  status text not null check (status in ('simule','envoye','echec')),
  created_at timestamptz not null default now()
);

create table if not exists public.document_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('quote','intervention','invoice','avoir','contract')),
  next_number integer not null default 1,
  primary key (organization_id, kind)
);

-- ---------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------
create index if not exists clients_org_status_idx on public.clients (organization_id, status);
create index if not exists equipment_client_idx on public.equipment (client_id);
create index if not exists quotes_org_status_idx on public.quotes (organization_id, status);
create index if not exists interventions_org_schedule_idx on public.interventions (organization_id, scheduled_start);
create index if not exists interventions_technician_idx on public.interventions (assigned_technician_id, scheduled_start);
create index if not exists job_photos_intervention_idx on public.job_photos (intervention_id);
create index if not exists invoices_org_status_idx on public.invoices (organization_id, status, due_date);
create index if not exists contracts_next_visit_idx on public.maintenance_contracts (organization_id, next_visit_date);
create index if not exists call_logs_org_status_idx on public.call_logs (organization_id, status, created_at desc);
create index if not exists client_activities_client_idx on public.client_activities (client_id, created_at desc);

-- ---------------------------------------------------------------------
-- Sécurité : isolation stricte par organisation (Row Level Security)
-- ---------------------------------------------------------------------
create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.users where id = auth.uid()
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'clients','equipment','catalog_items','quotes','maintenance_contracts','interventions',
    'job_photos','invoices','call_logs','client_activities','outbound_messages','document_sequences','users'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_same_organization'
    ) then
      execute format(
        'create policy %I on public.%I for all using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id())',
        t || '_same_organization', t
      );
    end if;
  end loop;
end $$;

alter table public.organizations enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'organizations' and policyname = 'organizations_own'
  ) then
    create policy organizations_own on public.organizations
      for all using (id = public.current_organization_id()) with check (id = public.current_organization_id());
  end if;
end $$;

-- Les rôles fins (technicien sans données financières, comptable en lecture seule) seront
-- appliqués côté serveur (Server Actions) lors du branchement Supabase ; le portail client
-- public passera par une route serveur vérifiant portal_token (jamais d'accès anonyme direct).
