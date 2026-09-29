/**
 * BATOPS — modèle de données métier (source unique de vérité côté TypeScript).
 *
 * Miroir du schéma SQL `supabase/migrations/001_batops_schema.sql`.
 * Conventions :
 *  - champs en snake_case (identiques aux colonnes SQL) ;
 *  - montants en euros (number, 2 décimales) ;
 *  - `ISODateTime` = instant UTC (`Date#toISOString()`), `ISODate` = jour local `YYYY-MM-DD`.
 */

export type ISODateTime = string;
export type ISODate = string;

/* ------------------------------------------------------------------ */
/* Organisation & équipe                                               */
/* ------------------------------------------------------------------ */

export type TradeType = "climatisation" | "chauffage" | "plomberie" | "electricite";
export type SubscriptionPlan = "solo" | "equipe" | "entreprise";
export type VatRate = 5.5 | 10 | 20;

export interface DecennialInsurance {
  insurer: string;
  policy_number: string;
  coverage_area: string;
}

export interface Organization {
  id: string;
  name: string;
  legal_name: string;
  trade_types: TradeType[];
  default_hourly_rate: number;
  default_travel_fee: number;
  default_vat_rate: VatRate;
  default_deposit_percent: number;
  payment_terms_days: number;
  quote_validity_days: number;
  subscription_plan: SubscriptionPlan;
  brand_color: string;
  logo_url?: string;
  email?: string;
  phone?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  siret?: string;
  rcs?: string;
  tva_number?: string;
  share_capital?: string;
  decennial_insurance?: DecennialInsurance;
  rge_number?: string;
  certifications: string[];
  created_at: ISODateTime;
}

export type UserRole = "owner" | "dispatcher" | "technician" | "accountant";

export interface User {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  job_title: string;
  color_hex: string;
  is_active: boolean;
  phone?: string;
  specialties: string[];
}

/* ------------------------------------------------------------------ */
/* CRM                                                                 */
/* ------------------------------------------------------------------ */

export type ClientStatus = "prospect" | "client";
export type ClientType = "particulier" | "professionnel" | "syndic";
export type ClientSource = "nora_ia" | "telephone" | "recommandation" | "site_web";
export type Civility = "M." | "Mme" | "M. et Mme";

/** Prospects et clients partagent la même table (distingués par `status`). */
export interface Client {
  id: string;
  organization_id: string;
  status: ClientStatus;
  type: ClientType;
  civility?: Civility;
  first_name?: string;
  last_name: string;
  company_name?: string;
  email?: string;
  phone: string;
  address: string;
  postal_code: string;
  city: string;
  access_notes?: string;
  source?: ClientSource;
  notes?: string;
  /** Logement achevé depuis plus de 2 ans (détermine la TVA réduite 10 % / 5,5 %). */
  housing_over_2_years?: boolean;
  /** Jeton du portail client public `/portal/[token]` (sans mot de passe). */
  portal_token: string;
  created_at: ISODateTime;
}

export type EquipmentCategory =
  | "climatisation"
  | "pac_air_eau"
  | "pac_air_air"
  | "chaudiere"
  | "ballon_ecs"
  | "vmc"
  | "tableau_elec"
  | "autre";

export type RefrigerantType = "R32" | "R410A" | "R290";

export interface Equipment {
  id: string;
  organization_id: string;
  client_id: string;
  category: EquipmentCategory;
  brand: string;
  model: string;
  serial_number?: string;
  refrigerant_type?: RefrigerantType;
  installation_date?: ISODate;
  warranty_end_date?: ISODate;
  location_in_property?: string;
  notes?: string;
  /** Intervention d'installation ayant créé l'équipement (boucle paiement → parc). */
  installed_by_intervention_id?: string;
  created_at: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

export type CatalogCategory = "main_oeuvre" | "deplacement" | "fourniture" | "forfait" | "maintenance";
export type CatalogUnit = "u" | "h" | "m" | "forfait";

/** Gabarit d'équipement : une fourniture « machine » crée un équipement dans le parc client une fois payée. */
export interface EquipmentTemplate {
  category: EquipmentCategory;
  brand: string;
  model: string;
  refrigerant_type?: RefrigerantType;
  warranty_years: number;
}

export interface CatalogItem {
  id: string;
  organization_id: string;
  reference: string;
  name: string;
  description?: string;
  category: CatalogCategory;
  unit: CatalogUnit;
  buying_price_ht: number;
  selling_price_ht: number;
  vat_rate: VatRate;
  supplier_name?: string;
  equipment_template?: EquipmentTemplate;
  is_active: boolean;
  created_at: ISODateTime;
  /** Dernière modification (prix, libellé…) — les documents déjà émis conservent leurs prix. */
  updated_at?: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Documents commerciaux                                               */
/* ------------------------------------------------------------------ */

/** Ligne de devis / facture. Le prix vient toujours du catalogue (jamais inventé). */
export interface DocumentLine {
  id: string;
  catalog_item_id?: string;
  section: string;
  item_category?: CatalogCategory;
  name: string;
  description?: string;
  qty: number;
  unit: CatalogUnit;
  buying_price_ht: number;
  unit_price_ht: number;
  vat_rate: VatRate;
  total_ht: number;
  ai_suggested?: boolean;
}

export type QuoteStatus = "brouillon" | "envoye" | "accepte" | "refuse" | "expire";

export interface Quote {
  id: string;
  organization_id: string;
  client_id: string;
  reference: string;
  title: string;
  status: QuoteStatus;
  issue_date: ISODate;
  valid_until: ISODate;
  site_address: string;
  site_postal_code: string;
  site_city: string;
  items: DocumentLine[];
  subtotal_ht: number;
  discount_amount_ht: number;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  estimated_cost_ht: number;
  estimated_margin_ht: number;
  /** Remise globale saisie en % (le montant `discount_amount_ht` est alors recalculé sur le sous-total). */
  discount_percent?: number;
  deposit_percent: number;
  conditions?: string;
  /** Message au client imprimé sous les lignes (précisions sur les travaux). */
  notes?: string;
  /** Équipement du parc concerné (remplacement, dépannage…). */
  equipment_id?: string;
  ai_generated: boolean;
  call_log_id?: string;
  created_by_user_id?: string;
  sent_at?: ISODateTime;
  /** Première consultation par le client sur son portail. */
  viewed_at?: ISODateTime;
  last_reminder_at?: ISODateTime;
  signed_at?: ISODateTime;
  signed_by_name?: string;
  signature_data_url?: string;
  refused_at?: ISODateTime;
  refusal_reason?: string;
  created_at: ISODateTime;
  updated_at?: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Terrain                                                             */
/* ------------------------------------------------------------------ */

export type InterventionType = "installation" | "depannage" | "maintenance" | "sav";
export type InterventionPriority = "normale" | "haute" | "urgente";
export type InterventionStatus =
  | "nouvelle"
  | "planifiee"
  | "en_route"
  | "sur_place"
  | "en_cours"
  | "terminee"
  | "annulee";

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

/** Ligne facturable d'une intervention (pièces, forfaits, main-d'œuvre). */
export interface PartUsed {
  id: string;
  catalog_item_id?: string;
  name: string;
  qty: number;
  unit: CatalogUnit;
  unit_price_ht: number;
  buying_price_ht: number;
  vat_rate: VatRate;
  /** `devis` : reprise du devis signé · `bureau` : ajoutée au bureau · `terrain` : ajoutée par le technicien. */
  source: "devis" | "bureau" | "terrain";
}

export interface Intervention {
  id: string;
  organization_id: string;
  client_id: string;
  quote_id?: string;
  contract_id?: string;
  call_log_id?: string;
  equipment_id?: string;
  assigned_technician_id?: string;
  reference: string;
  title: string;
  type: InterventionType;
  priority: InterventionPriority;
  status: InterventionStatus;
  /** Adresse du chantier (peut différer de l'adresse de facturation, ex. syndic). */
  address: string;
  postal_code: string;
  city: string;
  site_label?: string;
  duration_minutes: number;
  /** `false` pour les visites incluses dans un contrat ou les diagnostics offerts. */
  is_billable: boolean;
  scheduled_start?: ISODateTime;
  scheduled_end?: ISODateTime;
  en_route_at?: ISODateTime;
  actual_start?: ISODateTime;
  actual_end?: ISODateTime;
  description?: string;
  checklist: ChecklistItem[];
  parts_used: PartUsed[];
  technician_report_notes?: string;
  anomalies_found?: string;
  recommendations?: string;
  client_signature_url?: string;
  signed_by_name?: string;
  signed_at?: ISODateTime;
  created_at: ISODateTime;
}

export type PhotoCategory = "avant" | "pendant" | "apres" | "anomalie" | "plaque_materiel";

export interface JobPhoto {
  id: string;
  organization_id: string;
  intervention_id: string;
  client_id: string;
  category: PhotoCategory;
  image_url: string;
  caption?: string;
  taken_at: ISODateTime;
  taken_by_user_id?: string;
}

/* ------------------------------------------------------------------ */
/* Facturation                                                         */
/* ------------------------------------------------------------------ */

export type InvoiceType = "acompte" | "facture" | "avoir";
/** Statut stocké. `en_retard` et `partiellement_payee` sont dérivés (voir `lib/domain/status`). */
export type InvoiceStatus = "brouillon" | "emise" | "payee" | "annulee";
export type PaymentMethod = "virement" | "cb" | "cheque" | "especes" | "prelevement";

export interface InvoicePayment {
  id: string;
  amount: number;
  method: PaymentMethod;
  paid_at: ISODateTime;
  note?: string;
}

/** Acompte déjà facturé déduit d'une facture finale. */
export interface DepositDeduction {
  invoice_id: string;
  reference: string;
  amount_ttc: number;
}

export interface Invoice {
  id: string;
  organization_id: string;
  client_id: string;
  quote_id?: string;
  intervention_id?: string;
  contract_id?: string;
  /** Pour un avoir : facture annulée / corrigée. */
  credited_invoice_id?: string;
  reference: string;
  invoice_type: InvoiceType;
  status: InvoiceStatus;
  title: string;
  issue_date: ISODate;
  due_date: ISODate;
  items: DocumentLine[];
  subtotal_ht: number;
  discount_amount_ht: number;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  deposit_deductions: DepositDeduction[];
  /** Montant réellement exigible : `total_ttc` − acomptes déduits. */
  amount_due_ttc: number;
  amount_paid: number;
  payments: InvoicePayment[];
  notes?: string;
  created_at: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Maintenance & appels                                                */
/* ------------------------------------------------------------------ */

/** Statut stocké. `a_planifier` / `visite_planifiee` sont dérivés des dates et interventions. */
export type ContractStatus = "actif" | "expire";

export interface MaintenanceContract {
  id: string;
  organization_id: string;
  client_id: string;
  equipment_id?: string;
  catalog_item_id?: string;
  reference: string;
  name: string;
  annual_price_ht: number;
  vat_rate: VatRate;
  annual_price_ttc: number;
  start_date: ISODate;
  next_visit_date: ISODate;
  last_visit_date?: ISODate;
  status: ContractStatus;
  created_at: ISODateTime;
}

export type Urgency = "basse" | "normale" | "haute" | "urgente";
export type CallIntent = "depannage" | "devis_installation" | "entretien" | "information";
export type CallStatus = "qualifie_ia" | "a_rappeler" | "converti";

export interface TranscriptTurn {
  speaker: "nora" | "caller" | "agent";
  text: string;
}

export interface CallLog {
  id: string;
  organization_id: string;
  client_id?: string;
  intervention_id?: string;
  quote_id?: string;
  handled_by: "nora" | "bureau";
  caller_name: string;
  caller_phone: string;
  caller_address?: string;
  caller_postal_code?: string;
  caller_city?: string;
  urgency: Urgency;
  detected_intent: CallIntent;
  equipment_mentioned?: string;
  summary: string;
  preferred_slot?: string;
  transcript: TranscriptTurn[];
  duration_seconds: number;
  status: CallStatus;
  created_at: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Timeline & notifications                                            */
/* ------------------------------------------------------------------ */

export type ActivityType =
  | "call"
  | "client_created"
  | "client_updated"
  | "client_converted"
  | "quote_created"
  | "quote_updated"
  | "quote_deleted"
  | "quote_sent"
  | "quote_viewed"
  | "quote_comment"
  | "quote_reminder"
  | "quote_signed"
  | "quote_refused"
  | "intervention_created"
  | "intervention_scheduled"
  | "intervention_updated"
  | "intervention_status"
  | "intervention_completed"
  | "photos_added"
  | "report_sent"
  | "invoice_issued"
  | "payment_received"
  | "equipment_added"
  | "equipment_updated"
  | "equipment_removed"
  | "contract_created"
  | "note";

export type EntityKind = "call" | "quote" | "intervention" | "invoice" | "equipment" | "contract" | "photo";

export interface EntityRef {
  kind: EntityKind;
  id: string;
}

export interface ClientActivity {
  id: string;
  organization_id: string;
  client_id: string;
  type: ActivityType;
  title: string;
  description?: string;
  actor_name?: string;
  entity?: EntityRef;
  created_at: ISODateTime;
}

export type MessageChannel = "email" | "sms";

/** Journal des e-mails / SMS « envoyés » (simulés par le MockNotificationProvider). */
export interface OutboundMessage {
  id: string;
  organization_id: string;
  channel: MessageChannel;
  to: string;
  subject?: string;
  body: string;
  client_id?: string;
  entity?: EntityRef;
  provider_mode: "mock" | "live";
  status: "simule" | "envoye" | "echec";
  created_at: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Agrégat racine du store                                             */
/* ------------------------------------------------------------------ */

export type SequenceKey = "quote" | "intervention" | "invoice" | "avoir" | "contract";

export interface BatopsData {
  schema_version: number;
  /** Instant de génération du jeu de démo (toutes les dates relatives en découlent). */
  seeded_at: ISODateTime;
  organization: Organization;
  users: User[];
  clients: Client[];
  equipment: Equipment[];
  catalog: CatalogItem[];
  quotes: Quote[];
  interventions: Intervention[];
  photos: JobPhoto[];
  invoices: Invoice[];
  contracts: MaintenanceContract[];
  calls: CallLog[];
  activities: ClientActivity[];
  outbox: OutboundMessage[];
  /** Prochain numéro à attribuer par type de document (numérotation continue). */
  sequences: Record<SequenceKey, number>;
}
