/**
 * Jeu de démonstration « ClimAir Pro » — généré de façon déterministe à partir d'un instant de référence.
 *
 * Toutes les dates sont relatives à `now` : la démo est toujours « vivante »
 * (intervention de Mme Martin aujourd'hui à 14 h, devis Bernard envoyé il y a 4 jours, etc.).
 * Les entités sont interconnectées et leurs montants sont calculés depuis le catalogue.
 */
import type {
  BatopsData,
  CallLog,
  CatalogItem,
  ChecklistItem,
  Client,
  ClientActivity,
  DocumentLine,
  Equipment,
  Intervention,
  InterventionPriority,
  InterventionStatus,
  InterventionType,
  Invoice,
  InvoiceType,
  ISODateTime,
  JobPhoto,
  MaintenanceContract,
  Organization,
  OutboundMessage,
  PartUsed,
  PaymentMethod,
  PhotoCategory,
  Quote,
  QuoteStatus,
  SequenceKey,
  User,
  VatRate,
} from "@/types/batops";
import { SECTION, defaultSectionFor } from "@/lib/domain/catalog";
import { clientDisplayName } from "@/lib/domain/clients";
import { addDays, startOfDay, startOfMonth, toDate, toISODate } from "@/lib/domain/dates";
import { formatEUR, formatDateTime } from "@/lib/domain/format";
import { formatReference } from "@/lib/domain/ids";
import { computeTotals, lineTotal, round2 } from "@/lib/domain/money";
import { INTERVENTION_TYPE_LABEL } from "@/lib/domain/labels";
import { DEMO_CATALOG, catalogIdFor } from "./catalog";
import { demoSignature } from "./signature";

/** Incrémenter à chaque changement incompatible du modèle : les navigateurs re-génèrent la démo. */
export const DEMO_SCHEMA_VERSION = 1;
export const DEMO_ORG_ID = "org_climairpro";

export const DEMO_USERS = {
  marc: "usr_marc",
  sophie: "usr_sophie",
  lucas: "usr_lucas",
  karim: "usr_karim",
  compta: "usr_compta",
} as const;

/* ------------------------------------------------------------------ */
/* Horloge relative                                                    */
/* ------------------------------------------------------------------ */

function createClock(now: Date) {
  const today = startOfDay(now);
  const monthStart = startOfMonth(today);
  const local = (offset: number, hour: number, minute: number) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, hour, minute);
  const safePast = now.getTime() - 5 * 60_000;

  return {
    /** Jour relatif `YYYY-MM-DD`. */
    date: (offset: number) => toISODate(addDays(today, offset)),
    /** Instant relatif (heure locale). */
    at: (offset: number, hour: number, minute = 0) => local(offset, hour, minute).toISOString(),
    /** Instant garanti dans le passé (événements déjà survenus « aujourd'hui »). */
    past: (offset: number, hour: number, minute = 0) =>
      new Date(Math.min(local(offset, hour, minute).getTime(), safePast)).toISOString(),
    /** Encaissement « ce mois-ci » : ramené au 1er du mois si besoin, jamais dans le futur. */
    thisMonth: (offset: number, hour: number, minute = 0) => {
      const floor = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1, hour, minute).getTime();
      const t = Math.max(Math.min(Math.max(local(offset, hour, minute).getTime(), floor), safePast), monthStart.getTime());
      return new Date(t).toISOString();
    },
    /** Encaissement « mois précédent » (pour la tendance du CA). */
    previousMonth: (offset: number, hour: number, minute = 0) => {
      const candidate = local(offset, hour, minute);
      if (candidate < monthStart) return candidate.toISOString();
      const lastDay = addDays(monthStart, -1);
      return new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate(), hour, minute).toISOString();
    },
  };
}

type Clock = ReturnType<typeof createClock>;

/* ------------------------------------------------------------------ */
/* Construction                                                        */
/* ------------------------------------------------------------------ */

interface LineSpec {
  ref: string;
  qty: number;
  section?: string;
}

interface PartSpec {
  ref: string;
  qty: number;
  source: PartUsed["source"];
}

interface Site {
  address: string;
  postal_code: string;
  city: string;
  label?: string;
}

class SeedBuilder {
  readonly catalog: CatalogItem[];
  private readonly catalogByRef: Map<string, CatalogItem>;

  constructor(
    readonly clock: Clock,
    readonly org: Organization,
    createdAt: ISODateTime,
  ) {
    this.catalog = DEMO_CATALOG.map((spec) => ({
      ...spec,
      id: catalogIdFor(spec.reference),
      organization_id: DEMO_ORG_ID,
      is_active: true,
      created_at: createdAt,
    }));
    this.catalogByRef = new Map(this.catalog.map((item) => [item.reference, item]));
  }

  item(ref: string): CatalogItem {
    const item = this.catalogByRef.get(ref);
    if (!item) throw new Error(`Article catalogue inconnu : ${ref}`);
    return item;
  }

  lines(docId: string, specs: LineSpec[], vat: VatRate): DocumentLine[] {
    return specs.map((spec, index) => {
      const item = this.item(spec.ref);
      return {
        id: `${docId}_l${index + 1}`,
        catalog_item_id: item.id,
        section: spec.section ?? defaultSectionFor(item),
        item_category: item.category,
        name: item.name,
        description: item.description,
        qty: spec.qty,
        unit: item.unit,
        buying_price_ht: item.buying_price_ht,
        unit_price_ht: item.selling_price_ht,
        vat_rate: vat,
        total_ht: lineTotal(spec.qty, item.selling_price_ht),
      };
    });
  }

  parts(interventionId: string, specs: PartSpec[], vat: VatRate): PartUsed[] {
    return specs.map((spec, index) => {
      const item = this.item(spec.ref);
      return {
        id: `${interventionId}_p${index + 1}`,
        catalog_item_id: item.id,
        name: item.name,
        qty: spec.qty,
        unit: item.unit,
        unit_price_ht: item.selling_price_ht,
        buying_price_ht: item.buying_price_ht,
        vat_rate: vat,
        source: spec.source,
      };
    });
  }

  quote(spec: {
    id: string;
    client: Client;
    title: string;
    issue: number;
    status: QuoteStatus;
    vat: VatRate;
    deposit: number;
    lines: LineSpec[];
    createdBy: string;
    sentAt?: ISODateTime;
    signedAt?: ISODateTime;
    signedBy?: string;
    site?: Site;
  }): Quote {
    const items = this.lines(spec.id, spec.lines, spec.vat);
    const totals = computeTotals(items);
    const site = spec.site ?? spec.client;
    return {
      id: spec.id,
      organization_id: DEMO_ORG_ID,
      client_id: spec.client.id,
      reference: "",
      title: spec.title,
      status: spec.status,
      issue_date: this.clock.date(spec.issue),
      valid_until: this.clock.date(spec.issue + this.org.quote_validity_days),
      site_address: site.address,
      site_postal_code: site.postal_code,
      site_city: site.city,
      items,
      subtotal_ht: totals.subtotal_ht,
      discount_amount_ht: totals.discount_amount_ht,
      total_ht: totals.total_ht,
      total_tva: totals.total_tva,
      total_ttc: totals.total_ttc,
      estimated_cost_ht: totals.cost_ht,
      estimated_margin_ht: totals.margin_ht,
      deposit_percent: spec.deposit,
      conditions: quoteConditions(spec.deposit, spec.vat, this.org.quote_validity_days),
      ai_generated: false,
      created_by_user_id: spec.createdBy,
      sent_at: spec.sentAt,
      signed_at: spec.signedAt,
      signed_by_name: spec.signedBy,
      signature_data_url: spec.signedBy ? demoSignature(spec.signedBy) : undefined,
      created_at: this.clock.at(spec.issue, 10, 0),
    };
  }

  intervention(spec: {
    id: string;
    client: Client;
    title: string;
    type: InterventionType;
    priority: InterventionPriority;
    status: InterventionStatus;
    createdAt: ISODateTime;
    technicianId?: string;
    quote?: Quote;
    contractId?: string;
    callId?: string;
    equipmentId?: string;
    site?: Site;
    durationMinutes?: number;
    scheduled?: { start: ISODateTime; end: ISODateTime };
    actual?: { start: ISODateTime; end: ISODateTime };
    description?: string;
    checklist: string[];
    parts?: PartSpec[];
    vat?: VatRate;
    isBillable?: boolean;
    report?: { notes: string; anomalies?: string; recommendations?: string };
    signedBy?: string;
  }): Intervention {
    const site = spec.site ?? spec.client;
    const done = spec.status === "terminee";
    const checklist: ChecklistItem[] = spec.checklist.map((label, index) => ({
      id: `${spec.id}_c${index + 1}`,
      label,
      checked: done,
    }));
    const quoteParts: PartUsed[] = (spec.quote?.items ?? [])
      .filter((line) => line.item_category === "fourniture")
      .map((line, index) => ({
        id: `${spec.id}_q${index + 1}`,
        catalog_item_id: line.catalog_item_id,
        name: line.name,
        qty: line.qty,
        unit: line.unit,
        unit_price_ht: line.unit_price_ht,
        buying_price_ht: line.buying_price_ht,
        vat_rate: line.vat_rate,
        source: "devis" as const,
      }));
    const laborMinutes = (spec.quote?.items ?? [])
      .filter((line) => line.item_category === "main_oeuvre" && line.unit === "h")
      .reduce((sum, line) => sum + line.qty * 60, 0);

    return {
      id: spec.id,
      organization_id: DEMO_ORG_ID,
      client_id: spec.client.id,
      quote_id: spec.quote?.id,
      contract_id: spec.contractId,
      call_log_id: spec.callId,
      equipment_id: spec.equipmentId,
      assigned_technician_id: spec.technicianId,
      reference: "",
      title: spec.title,
      type: spec.type,
      priority: spec.priority,
      status: spec.status,
      address: site.address,
      postal_code: site.postal_code,
      city: site.city,
      site_label: "label" in site ? site.label : undefined,
      duration_minutes: spec.durationMinutes ?? (laborMinutes || 120),
      is_billable: spec.isBillable ?? true,
      scheduled_start: spec.scheduled?.start,
      scheduled_end: spec.scheduled?.end,
      en_route_at: spec.actual ? new Date(toDate(spec.actual.start).getTime() - 25 * 60_000).toISOString() : undefined,
      actual_start: spec.actual?.start,
      actual_end: spec.actual?.end,
      description: spec.description,
      checklist,
      parts_used: [...quoteParts, ...this.parts(spec.id, spec.parts ?? [], spec.vat ?? this.org.default_vat_rate)],
      technician_report_notes: spec.report?.notes,
      anomalies_found: spec.report?.anomalies,
      recommendations: spec.report?.recommendations,
      client_signature_url: spec.signedBy ? demoSignature(spec.signedBy) : undefined,
      signed_by_name: spec.signedBy,
      signed_at: spec.signedBy ? spec.actual?.end : undefined,
      created_at: spec.createdAt,
    };
  }

  invoice(spec: {
    id: string;
    client: Client;
    type: InvoiceType;
    title: string;
    issue: number;
    dueInDays: number;
    items: DocumentLine[];
    quoteId?: string;
    interventionId?: string;
    contractId?: string;
    deductions?: Invoice[];
    payment?: { method: PaymentMethod; at: ISODateTime };
  }): Invoice {
    const totals = computeTotals(spec.items);
    const deposit_deductions = (spec.deductions ?? []).map((deposit) => ({
      invoice_id: deposit.id,
      reference: deposit.reference,
      amount_ttc: deposit.total_ttc,
    }));
    const amount_due_ttc = round2(totals.total_ttc - deposit_deductions.reduce((s, d) => s + d.amount_ttc, 0));
    const payments = spec.payment
      ? [{ id: `${spec.id}_pay1`, amount: amount_due_ttc, method: spec.payment.method, paid_at: spec.payment.at }]
      : [];
    return {
      id: spec.id,
      organization_id: DEMO_ORG_ID,
      client_id: spec.client.id,
      quote_id: spec.quoteId,
      intervention_id: spec.interventionId,
      contract_id: spec.contractId,
      reference: "",
      invoice_type: spec.type,
      status: spec.payment ? "payee" : "emise",
      title: spec.title,
      issue_date: this.clock.date(spec.issue),
      due_date: this.clock.date(spec.issue + spec.dueInDays),
      items: spec.items,
      subtotal_ht: totals.subtotal_ht,
      discount_amount_ht: totals.discount_amount_ht,
      total_ht: totals.total_ht,
      total_tva: totals.total_tva,
      total_ttc: totals.total_ttc,
      deposit_deductions,
      amount_due_ttc,
      amount_paid: payments.reduce((s, p) => s + p.amount, 0),
      payments,
      created_at: this.clock.at(spec.issue, 17, 30),
    };
  }

  /** Lignes de facture finale : devis signé + pièces ajoutées sur le terrain. */
  finalInvoiceLines(invoiceId: string, quote: Quote | undefined, intervention: Intervention): DocumentLine[] {
    const fromQuote = (quote?.items ?? []).map((line, index) => ({ ...line, id: `${invoiceId}_l${index + 1}` }));
    const extraParts = intervention.parts_used.filter((part) => (quote ? part.source === "terrain" : true));
    const fromParts = extraParts.map((part, index) => {
      const item = this.catalog.find((c) => c.id === part.catalog_item_id);
      return {
      id: `${invoiceId}_x${index + 1}`,
      catalog_item_id: part.catalog_item_id,
      section: quote ? SECTION.extra : item ? defaultSectionFor(item) : SECTION.labor,
      item_category: item?.category,
      name: part.name,
      qty: part.qty,
      unit: part.unit,
      buying_price_ht: part.buying_price_ht,
      unit_price_ht: part.unit_price_ht,
      vat_rate: part.vat_rate,
      total_ht: lineTotal(part.qty, part.unit_price_ht),
      };
    });
    return [...fromQuote, ...fromParts];
  }

  /** Acompte : un % de la base HT de chaque taux de TVA du devis. */
  depositLines(invoiceId: string, quote: Quote): DocumentLine[] {
    const totals = computeTotals(quote.items);
    return totals.vat_breakdown.map((row, index) => ({
      id: `${invoiceId}_l${index + 1}`,
      section: "Acompte",
      name: `Acompte de ${quote.deposit_percent} % — devis ${quote.reference}`,
      qty: 1,
      unit: "forfait" as const,
      buying_price_ht: 0,
      unit_price_ht: round2((row.base_ht * quote.deposit_percent) / 100),
      vat_rate: row.rate,
      total_ht: round2((row.base_ht * quote.deposit_percent) / 100),
    }));
  }
}

function quoteConditions(deposit: number, vat: VatRate, validityDays: number): string {
  const payment =
    deposit > 0
      ? `Acompte de ${deposit} % à la signature, solde à réception de facture.`
      : "Paiement à réception de facture.";
  const vatText =
    vat === 5.5
      ? "TVA à 5,5 % : travaux d'amélioration de la performance énergétique d'un logement de plus de 2 ans (attestation simplifiée)."
      : vat === 10
        ? "TVA à 10 % : travaux de rénovation d'un logement de plus de 2 ans (attestation simplifiée)."
        : "TVA à 20 %.";
  return `${payment} ${vatText} Devis valable ${validityDays} jours.`;
}

/** Attribue des références continues par ordre chronologique, avec un ancrage (ex. Bernard = DEV-0041). */
function assignReferences<T extends { id: string; reference: string; created_at: ISODateTime }>(
  items: T[],
  kind: SequenceKey,
  dateOf: (item: T) => string,
  anchor: { id: string; number: number } | { start: number },
): number {
  const sorted = [...items].sort(
    (a, b) => dateOf(a).localeCompare(dateOf(b)) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  const start =
    "id" in anchor ? anchor.number - sorted.findIndex((item) => item.id === anchor.id) : anchor.start;
  sorted.forEach((item, index) => {
    item.reference = formatReference(kind, toDate(dateOf(item)).getFullYear(), start + index);
  });
  return start + sorted.length;
}

/* ------------------------------------------------------------------ */
/* Jeu de données                                                      */
/* ------------------------------------------------------------------ */

export function createDemoData(now: Date = new Date()): BatopsData {
  const clock = createClock(now);
  const orgCreatedAt = "2021-03-01T08:00:00.000Z";

  const organization: Organization = {
    id: DEMO_ORG_ID,
    name: "ClimAir Pro",
    legal_name: "ClimAir Pro SAS",
    trade_types: ["climatisation", "chauffage", "plomberie", "electricite"],
    default_hourly_rate: 68,
    default_travel_fee: 59,
    default_vat_rate: 10,
    default_deposit_percent: 30,
    payment_terms_days: 15,
    quote_validity_days: 30,
    subscription_plan: "equipe",
    brand_color: "#2563EB",
    email: "contact@climair-pro.fr",
    phone: "03 53 01 20 45",
    address: "14 avenue de la Résistance",
    postal_code: "54520",
    city: "Laxou",
    siret: "892 145 367 00018",
    rcs: "RCS Nancy 892 145 367",
    tva_number: "FR85892145367",
    share_capital: "20 000 €",
    decennial_insurance: {
      insurer: "Mutuelle Lorraine du Bâtiment",
      policy_number: "DEC-2026-548712",
      coverage_area: "France métropolitaine",
    },
    rge_number: "QualiPAC n° QPAC/58712",
    certifications: ["RGE QualiPAC", "Attestation de capacité fluides frigorigènes (catégorie I)"],
    created_at: orgCreatedAt,
  };

  const users: User[] = [
    {
      id: DEMO_USERS.marc,
      organization_id: DEMO_ORG_ID,
      full_name: "Marc Ouhadda",
      email: "marc@climair-pro.fr",
      role: "owner",
      job_title: "Gérant & chargé d'affaires",
      color_hex: "#7C3AED",
      is_active: true,
      phone: "06 39 98 10 01",
      specialties: ["Chiffrage", "PAC Air/Eau"],
    },
    {
      id: DEMO_USERS.sophie,
      organization_id: DEMO_ORG_ID,
      full_name: "Sophie Laurent",
      email: "sophie@climair-pro.fr",
      role: "dispatcher",
      job_title: "Assistante administrative & planning",
      color_hex: "#DB2777",
      is_active: true,
      phone: "03 53 01 20 45",
      specialties: ["Planning", "Facturation"],
    },
    {
      id: DEMO_USERS.lucas,
      organization_id: DEMO_ORG_ID,
      full_name: "Lucas Morel",
      email: "lucas@climair-pro.fr",
      role: "technician",
      job_title: "Frigoriste senior",
      color_hex: "#2563EB",
      is_active: true,
      phone: "06 39 98 10 03",
      specialties: ["PAC Air/Eau", "Multi-split", "Frigoriste R32"],
    },
    {
      id: DEMO_USERS.karim,
      organization_id: DEMO_ORG_ID,
      full_name: "Karim Benali",
      email: "karim@climair-pro.fr",
      role: "technician",
      job_title: "Chauffagiste & plombier",
      color_hex: "#10B981",
      is_active: true,
      phone: "06 39 98 10 04",
      specialties: ["Chauffage", "Plomberie", "Dépannage", "Entretien"],
    },
    {
      id: DEMO_USERS.compta,
      organization_id: DEMO_ORG_ID,
      full_name: "Cabinet Fiduciaire Lorraine",
      email: "compta@fiduciaire-lorraine.example",
      role: "accountant",
      job_title: "Expert-comptable (accès externe)",
      color_hex: "#64748B",
      is_active: true,
      specialties: [],
    },
  ];

  const b = new SeedBuilder(clock, organization, orgCreatedAt);

  /* ---------------------------- Clients ---------------------------- */

  const client = (spec: Omit<Client, "organization_id">): Client => ({ ...spec, organization_id: DEMO_ORG_ID });

  const martin = client({
    id: "cli_martin",
    status: "client",
    type: "particulier",
    civility: "Mme",
    first_name: "Claire",
    last_name: "Martin",
    email: "claire.martin@example.com",
    phone: "06 39 98 12 47",
    address: "8 rue des Mimosas",
    postal_code: "54520",
    city: "Laxou",
    access_notes: "Maison avec portail — interphone « Martin ». Groupe extérieur accessible par le jardin (côté gauche).",
    source: "telephone",
    housing_over_2_years: true,
    portal_token: "ptk_m4rT1nC7aQ2vX9kLp3sW8dYe",
    created_at: "2023-05-22T09:30:00.000Z",
  });
  const bernard = client({
    id: "cli_bernard",
    status: "prospect",
    type: "particulier",
    civility: "M.",
    first_name: "Jean-Pierre",
    last_name: "Bernard",
    email: "jp.bernard@example.com",
    phone: "06 39 98 31 05",
    address: "17 allée des Érables",
    postal_code: "54600",
    city: "Villers-lès-Nancy",
    access_notes: "Chaufferie au sous-sol, accès par le garage.",
    source: "recommandation",
    notes: "Maison de 1975, 140 m², 8 radiateurs fonte. Chaudière fioul De Dietrich de 1998 à remplacer. Éligible MaPrimeRénov' (revenus intermédiaires).",
    housing_over_2_years: true,
    portal_token: "ptk_b3rN4rD8pAc5zQ1mK7vT2hLw",
    created_at: clock.at(-12, 11, 15),
  });
  const mansouri = client({
    id: "cli_mansouri",
    status: "prospect",
    type: "particulier",
    civility: "Mme",
    first_name: "Nadia",
    last_name: "Mansouri",
    phone: "06 42 18 99 10",
    address: "14 rue des Jardins",
    postal_code: "54500",
    city: "Vandœuvre-lès-Nancy",
    source: "nora_ia",
    notes: "Maison sur 2 niveaux — salon 35 m² au rez-de-chaussée, 2 chambres (≈ 12 m²) à l'étage.",
    housing_over_2_years: true,
    portal_token: "ptk_n4D1aM6sR2uX8qV3cK9wE5tZ",
    created_at: clock.past(-1, 19, 46),
  });
  const bellevue = client({
    id: "cli_bellevue",
    status: "client",
    type: "professionnel",
    civility: "M.",
    first_name: "Olivier",
    last_name: "Schmitt",
    company_name: "Restaurant Le Bellevue",
    email: "direction@lebellevue.example",
    phone: "03 53 01 42 18",
    address: "5 place Stanislas",
    postal_code: "54000",
    city: "Nancy",
    access_notes: "Livraisons par la rue Héré avant 10 h. Local technique au sous-sol (clé au bar).",
    source: "telephone",
    portal_token: "ptk_b3L7vU2eR9sT4aW8nK1qZ6yP",
    created_at: "2021-05-03T09:00:00.000Z",
  });
  const doree = client({
    id: "cli_doree",
    status: "client",
    type: "professionnel",
    civility: "Mme",
    first_name: "Isabelle",
    last_name: "Vasseur",
    company_name: "Boulangerie Pâtisserie Dorée",
    email: "contact@boulangerie-doree.example",
    phone: "03 53 01 27 64",
    address: "42 rue Saint-Dizier",
    postal_code: "54000",
    city: "Nancy",
    access_notes: "Entrée fournisseurs dans la cour à l'arrière. Boutique ouverte 6 h 30 – 19 h 30.",
    source: "recommandation",
    portal_token: "ptk_d0R3eB8oU2lN5gX7aQ1wV4kT",
    created_at: "2020-06-02T10:00:00.000Z",
  });
  const mercier = client({
    id: "cli_mercier",
    status: "client",
    type: "particulier",
    civility: "M.",
    first_name: "Thomas",
    last_name: "Mercier",
    email: "thomas.mercier@example.com",
    phone: "06 39 98 54 21",
    address: "6 rue du Général Leclerc",
    postal_code: "54320",
    city: "Maxéville",
    source: "site_web",
    housing_over_2_years: true,
    portal_token: "ptk_m3Rc1eR7tH4oM2aS9vK5xQ8w",
    created_at: clock.at(-52, 14, 20),
  });
  const syndic = client({
    id: "cli_syndic",
    status: "client",
    type: "syndic",
    civility: "Mme",
    first_name: "Céline",
    last_name: "Hoffmann",
    company_name: "Syndic Lorraine Habitat",
    email: "c.hoffmann@lorraine-habitat.example",
    phone: "03 53 01 88 40",
    address: "18 rue Serpenoise",
    postal_code: "57000",
    city: "Metz",
    source: "site_web",
    notes: "Gère 4 résidences suivies par ClimAir Pro : Les Tilleuls, Bellecroix, Saint-Jean et Résidence du Parc. Bon de commande obligatoire au-delà de 1 500 € HT.",
    housing_over_2_years: true,
    portal_token: "ptk_s7N2dL9hA4bT1iX6oQ3wE8rK",
    created_at: "2022-01-17T09:00:00.000Z",
  });
  const petit = client({
    id: "cli_petit",
    status: "client",
    type: "particulier",
    civility: "M.",
    first_name: "Antoine",
    last_name: "Petit",
    email: "antoine.petit@example.com",
    phone: "06 39 98 62 30",
    address: "9 rue de la Fontaine",
    postal_code: "54270",
    city: "Essey-lès-Nancy",
    source: "recommandation",
    housing_over_2_years: true,
    portal_token: "ptk_p3T1tA8nT4oI2nE9xQ5wV7kL",
    created_at: clock.at(-44, 9, 40),
  });
  const roux = client({
    id: "cli_roux",
    status: "client",
    type: "particulier",
    civility: "Mme",
    first_name: "Sandrine",
    last_name: "Roux",
    email: "sandrine.roux@example.com",
    phone: "06 39 98 47 12",
    address: "31 rue Jean Jaurès",
    postal_code: "54180",
    city: "Heillecourt",
    source: "site_web",
    housing_over_2_years: true,
    portal_token: "ptk_r0U8xS2aN6dR1iN9eQ4wT7kV",
    created_at: clock.at(-33, 16, 5),
  });
  const pharmacie = client({
    id: "cli_pharmacie",
    status: "client",
    type: "professionnel",
    civility: "M.",
    first_name: "Hugo",
    last_name: "Lambert",
    company_name: "Pharmacie du Port",
    email: "pharmacie.duport@example.com",
    phone: "03 53 01 36 92",
    address: "27 boulevard d'Austrasie",
    postal_code: "54000",
    city: "Nancy",
    access_notes: "Intervention avant l'ouverture (9 h) ou dans la réserve à l'arrière.",
    source: "telephone",
    portal_token: "ptk_p7H4aR2mA9cI1eX5dQ8wP3tR",
    created_at: clock.at(-20, 11, 0),
  });
  const kieffer = client({
    id: "cli_kieffer",
    status: "client",
    type: "particulier",
    civility: "M. et Mme",
    last_name: "Kieffer",
    email: "famille.kieffer@example.com",
    phone: "06 39 98 75 44",
    address: "4 impasse des Vignes",
    postal_code: "54710",
    city: "Ludres",
    source: "site_web",
    housing_over_2_years: true,
    portal_token: "ptk_k1E4fF7eR2kI9eX3sQ6wA8zB",
    created_at: clock.at(-55, 18, 10),
  });

  const clients = [martin, bernard, mansouri, bellevue, doree, mercier, syndic, petit, roux, pharmacie, kieffer];

  /* ------------------------------ Sites ---------------------------- */

  const tilleuls: Site = { address: "12 rue des Tilleuls", postal_code: "57000", city: "Metz", label: "Résidence Les Tilleuls" };
  const bellecroix: Site = { address: "3 rue de Bellecroix", postal_code: "57070", city: "Metz", label: "Résidence Bellecroix — bât. A" };
  const saintJean: Site = { address: "6 rue Saint-Jean", postal_code: "57950", city: "Montigny-lès-Metz", label: "Résidence Saint-Jean" };
  const parc: Site = { address: "25 avenue du Parc", postal_code: "57050", city: "Metz", label: "Résidence du Parc" };

  /* ----------------------------- Devis ----------------------------- */

  const qKieffer = b.quote({
    id: "quo_kieffer",
    client: kieffer,
    title: "Climatisation réversible multi-split 3 pièces",
    issue: -48,
    status: "accepte",
    vat: 10,
    deposit: 0,
    createdBy: DEMO_USERS.marc,
    sentAt: clock.at(-48, 18, 5),
    signedAt: clock.at(-45, 20, 12),
    signedBy: "Anne Kieffer",
    lines: [
      { ref: "CLIM-DAI-UE3", qty: 1 },
      { ref: "CLIM-DAI-UI35", qty: 1 },
      { ref: "CLIM-DAI-UI20", qty: 2 },
      { ref: "ACC-LIAIS-38", qty: 20 },
      { ref: "ACC-GOUL", qty: 18 },
      { ref: "ACC-POMPE-SI27", qty: 1 },
      { ref: "ACC-SUPP-AV", qty: 1 },
      { ref: "ACC-DISJ", qty: 1 },
      { ref: "MO-FRIG", qty: 14 },
      { ref: "FOR-MES-R32", qty: 1 },
    ],
  });
  const qMercier = b.quote({
    id: "quo_mercier",
    client: mercier,
    title: "Remplacement chauffe-eau par un chauffe-eau thermodynamique",
    issue: -44,
    status: "accepte",
    vat: 5.5,
    deposit: 0,
    createdBy: DEMO_USERS.sophie,
    sentAt: clock.at(-44, 11, 30),
    signedAt: clock.at(-42, 9, 48),
    signedBy: "Thomas Mercier",
    lines: [
      { ref: "FOR-DEP-CE", qty: 1 },
      { ref: "CET-THE-200", qty: 1 },
      { ref: "ACC-GS", qty: 1 },
      { ref: "MO-CHAU", qty: 6 },
    ],
  });
  const qPetit = b.quote({
    id: "quo_petit",
    client: petit,
    title: "Installation pompe à chaleur Air/Eau 8 kW",
    issue: -38,
    status: "accepte",
    vat: 5.5,
    deposit: 30,
    createdBy: DEMO_USERS.marc,
    sentAt: clock.at(-38, 19, 2),
    signedAt: clock.at(-35, 12, 40),
    signedBy: "Antoine Petit",
    lines: [
      { ref: "FOR-DESEMB", qty: 1 },
      { ref: "PAC-ATL-8", qty: 1 },
      { ref: "ACC-KIT-HYD", qty: 1 },
      { ref: "ACC-POT-BOUE", qty: 1 },
      { ref: "ACC-DISJ", qty: 1 },
      { ref: "MO-FRIG", qty: 16 },
      { ref: "FOR-MES-PAC", qty: 1 },
    ],
  });
  const qRoux = b.quote({
    id: "quo_roux",
    client: roux,
    title: "Remplacement chaudière gaz par chaudière à condensation",
    issue: -30,
    status: "accepte",
    vat: 10,
    deposit: 0,
    createdBy: DEMO_USERS.marc,
    sentAt: clock.at(-30, 17, 45),
    signedAt: clock.at(-27, 8, 55),
    signedBy: "Sandrine Roux",
    lines: [
      { ref: "FOR-DESEMB", qty: 1 },
      { ref: "CHAU-VIE-25", qty: 1 },
      { ref: "ACC-VENT", qty: 1 },
      { ref: "MO-CHAU", qty: 10 },
    ],
  });
  const qPharmacie = b.quote({
    id: "quo_pharmacie",
    client: pharmacie,
    title: "Climatisation de l'espace de vente (mono-split 3,5 kW)",
    issue: -14,
    status: "accepte",
    vat: 20,
    deposit: 30,
    createdBy: DEMO_USERS.marc,
    sentAt: clock.at(-14, 16, 20),
    signedAt: clock.at(-8, 10, 5),
    signedBy: "Hugo Lambert",
    lines: [
      { ref: "CLIM-DAI-M35", qty: 1 },
      { ref: "ACC-LIAIS-38", qty: 6 },
      { ref: "ACC-GOUL", qty: 6 },
      { ref: "ACC-SUPP-AV", qty: 1 },
      { ref: "ACC-DISJ", qty: 1 },
      { ref: "ACC-POMPE-SI27", qty: 1 },
      { ref: "MO-FRIG", qty: 4 },
      { ref: "FOR-MES-R32", qty: 1 },
    ],
  });
  const qDoreeLabo = b.quote({
    id: "quo_doree_labo",
    client: doree,
    title: "Climatisation du laboratoire de pâtisserie (split 5 kW)",
    issue: -10,
    status: "envoye",
    vat: 20,
    deposit: 30,
    createdBy: DEMO_USERS.marc,
    sentAt: clock.at(-9, 9, 15),
    lines: [
      { ref: "CLIM-DAI-M50", qty: 1 },
      { ref: "ACC-LIAIS-12", qty: 8 },
      { ref: "ACC-GOUL", qty: 8 },
      { ref: "ACC-POMPE-SI27", qty: 1 },
      { ref: "ACC-SUPP-AV", qty: 1 },
      { ref: "ACC-DISJ", qty: 1 },
      { ref: "MO-FRIG", qty: 7 },
      { ref: "FOR-MES-R32", qty: 1 },
    ],
  });
  const qSyndicVmc = b.quote({
    id: "quo_syndic_vmc",
    client: syndic,
    title: "Remplacement du caisson VMC collective — Résidence Saint-Jean",
    issue: -7,
    status: "envoye",
    vat: 10,
    deposit: 30,
    createdBy: DEMO_USERS.marc,
    sentAt: clock.at(-6, 14, 40),
    site: saintJean,
    lines: [
      { ref: "VMC-ALD-250", qty: 1 },
      { ref: "ACC-DISJ", qty: 1 },
      { ref: "MO-ELEC", qty: 6 },
      { ref: "FOR-MES-VMC", qty: 1 },
    ],
  });
  const qBellevue = b.quote({
    id: "quo_bellevue_rideau",
    client: bellevue,
    title: "Remplacement du rideau d'air de l'entrée",
    issue: -6,
    status: "envoye",
    vat: 20,
    deposit: 30,
    createdBy: DEMO_USERS.sophie,
    sentAt: clock.at(-5, 11, 10),
    lines: [
      { ref: "RID-FRI-15", qty: 1 },
      { ref: "ACC-DISJ", qty: 1 },
      { ref: "MO-ELEC", qty: 4 },
    ],
  });
  const qBernard = b.quote({
    id: "quo_bernard",
    client: bernard,
    title: "Remplacement chaudière fioul par PAC Air/Eau Atlantic 8 kW + désembouage",
    issue: -5,
    status: "envoye",
    vat: 5.5,
    deposit: 30,
    createdBy: DEMO_USERS.marc,
    sentAt: clock.at(-4, 18, 20),
    lines: [
      { ref: "FOR-DEP-FIOUL", qty: 1 },
      { ref: "FOR-DESEMB", qty: 1 },
      { ref: "PAC-ATL-8", qty: 1 },
      { ref: "ACC-KIT-HYD", qty: 1 },
      { ref: "ACC-POT-BOUE", qty: 1 },
      { ref: "ACC-DISJ", qty: 1 },
      { ref: "MO-FRIG", qty: 21 },
      { ref: "FOR-MES-PAC", qty: 1 },
    ],
  });

  const quotes = [qKieffer, qMercier, qPetit, qRoux, qPharmacie, qDoreeLabo, qSyndicVmc, qBellevue, qBernard];
  const nextQuote = assignReferences(quotes, "quote", (q) => q.issue_date, { id: qBernard.id, number: 41 });

  /* --------------------------- Équipements -------------------------- */

  const equipment: Equipment[] = [];
  const addEquipment = (spec: Omit<Equipment, "organization_id">) => {
    const eq = { ...spec, organization_id: DEMO_ORG_ID };
    equipment.push(eq);
    return eq;
  };

  const eqMartin = addEquipment({
    id: "eq_martin_split",
    client_id: martin.id,
    category: "climatisation",
    brand: "Daikin",
    model: "Perfera FTXM35R + RXM35R",
    serial_number: "J004871",
    refrigerant_type: "R32",
    installation_date: "2023-06-14",
    warranty_end_date: "2028-06-14",
    location_in_property: "Salon",
    created_at: "2023-06-14T16:00:00.000Z",
  });
  addEquipment({
    id: "eq_bernard_fioul",
    client_id: bernard.id,
    category: "chaudiere",
    brand: "De Dietrich",
    model: "GT 120 — chaudière fioul",
    installation_date: "1998-10-01",
    location_in_property: "Sous-sol — chaufferie",
    notes: "À remplacer : projet de PAC Air/Eau en cours de chiffrage.",
    created_at: clock.at(-12, 11, 20),
  });
  const eqBellevueGainable = addEquipment({
    id: "eq_bellevue_gainable",
    client_id: bellevue.id,
    category: "climatisation",
    brand: "Mitsubishi Electric",
    model: "PEAD-M100JA + PUZ-ZM100 (gainable 10 kW)",
    serial_number: "1ZU04512",
    refrigerant_type: "R32",
    installation_date: "2021-05-18",
    warranty_end_date: "2024-05-18",
    location_in_property: "Salle — faux plafond",
    created_at: "2021-05-18T15:00:00.000Z",
  });
  addEquipment({
    id: "eq_bellevue_rideau",
    client_id: bellevue.id,
    category: "autre",
    brand: "Frico",
    model: "AR3510 — rideau d'air électrique",
    installation_date: "2016-11-02",
    location_in_property: "Entrée principale",
    notes: "Moteur bruyant, fin de vie — remplacement proposé.",
    created_at: "2021-05-03T09:10:00.000Z",
  });
  const eqDoree = addEquipment({
    id: "eq_doree_split",
    client_id: doree.id,
    category: "climatisation",
    brand: "Atlantic Fujitsu",
    model: "ASYG12KMCC + AOYG12KMCC (3,5 kW)",
    serial_number: "T2K08815",
    refrigerant_type: "R32",
    installation_date: "2020-06-10",
    warranty_end_date: "2023-06-10",
    location_in_property: "Boutique — mur du fond",
    created_at: "2020-06-10T14:00:00.000Z",
  });
  const eqTilleulsVmc = addEquipment({
    id: "eq_syndic_vmc_tilleuls",
    client_id: syndic.id,
    category: "vmc",
    brand: "Aldes",
    model: "VEC 250 MicroWatt",
    installation_date: "2017-03-15",
    location_in_property: "Résidence Les Tilleuls — toiture terrasse",
    created_at: "2022-01-17T09:30:00.000Z",
  });
  const eqBellecroix = addEquipment({
    id: "eq_syndic_chaufferie_bellecroix",
    client_id: syndic.id,
    category: "chaudiere",
    brand: "Viessmann",
    model: "Vitocrossal 200 CM2 — chaufferie collective",
    installation_date: "2015-09-01",
    location_in_property: "Résidence Bellecroix — chaufferie en sous-sol",
    created_at: "2022-01-17T09:35:00.000Z",
  });
  addEquipment({
    id: "eq_syndic_vmc_saintjean",
    client_id: syndic.id,
    category: "vmc",
    brand: "Aldes",
    model: "VEC 180 — caisson d'origine",
    installation_date: "2008-04-01",
    location_in_property: "Résidence Saint-Jean — combles",
    notes: "Caisson en fin de vie (roulements bruyants).",
    created_at: "2022-01-17T09:40:00.000Z",
  });

  /* -------------------------- Contrats (1/2) ------------------------ */

  const contractFrom = (spec: {
    id: string;
    client: Client;
    equipmentId?: string;
    ref: string;
    qty?: number;
    vat: VatRate;
    name: string;
    startOffset: number;
    nextVisitOffset: number;
    lastVisitOffset?: number;
    createdAt: ISODateTime;
  }): MaintenanceContract => {
    const item = b.item(spec.ref);
    const annualHt = round2(item.selling_price_ht * (spec.qty ?? 1));
    return {
      id: spec.id,
      organization_id: DEMO_ORG_ID,
      client_id: spec.client.id,
      equipment_id: spec.equipmentId,
      catalog_item_id: item.id,
      reference: "",
      name: spec.name,
      annual_price_ht: annualHt,
      vat_rate: spec.vat,
      annual_price_ttc: round2(annualHt * (1 + spec.vat / 100)),
      start_date: clock.date(spec.startOffset),
      next_visit_date: clock.date(spec.nextVisitOffset),
      last_visit_date: spec.lastVisitOffset !== undefined ? clock.date(spec.lastVisitOffset) : undefined,
      status: "actif",
      created_at: spec.createdAt,
    };
  };

  const ctrBellevue = contractFrom({
    id: "ctr_bellevue",
    client: bellevue,
    equipmentId: eqBellevueGainable.id,
    ref: "MAINT-PRO",
    vat: 20,
    name: "Entretien annuel climatisation gainable + rideau d'air",
    startOffset: 12 - 730,
    nextVisitOffset: 12,
    lastVisitOffset: 12 - 365,
    createdAt: clock.at(12 - 735, 10, 0),
  });
  const ctrSyndic = contractFrom({
    id: "ctr_syndic_vmc",
    client: syndic,
    equipmentId: eqTilleulsVmc.id,
    ref: "MAINT-VMC",
    qty: 4,
    vat: 10,
    name: "Entretien annuel VMC collective — 4 résidences",
    startOffset: 1 - 730,
    nextVisitOffset: 1,
    lastVisitOffset: 1 - 365,
    createdAt: clock.at(1 - 740, 10, 0),
  });
  const ctrMartin = contractFrom({
    id: "ctr_martin",
    client: martin,
    equipmentId: eqMartin.id,
    ref: "MAINT-CLIM",
    vat: 10,
    name: "Entretien annuel climatisation (1 unité)",
    startOffset: -570,
    nextVisitOffset: 160,
    lastVisitOffset: -205,
    createdAt: clock.at(-570, 15, 0),
  });

  /* -------------------------- Appels (Nora) ------------------------- */

  const calls: CallLog[] = [
    {
      id: "call_doree",
      organization_id: DEMO_ORG_ID,
      client_id: doree.id,
      intervention_id: "int_doree",
      handled_by: "nora",
      caller_name: "Isabelle Vasseur (Boulangerie Pâtisserie Dorée)",
      caller_phone: doree.phone,
      caller_address: doree.address,
      caller_postal_code: doree.postal_code,
      caller_city: doree.city,
      urgency: "haute",
      detected_intent: "depannage",
      equipment_mentioned: "Climatisation boutique Atlantic Fujitsu 3,5 kW",
      summary:
        "La climatisation de la boutique ne refroidit plus. Vitrines de pâtisseries à protéger : intervention souhaitée au plus tôt.",
      preferred_slot: "Le lendemain vers 10 h",
      transcript: [
        { speaker: "nora", text: "Bonjour, ClimAir Pro, je suis Nora. Que puis-je faire pour vous ?" },
        {
          speaker: "caller",
          text: "Bonjour, Isabelle Vasseur de la Boulangerie Dorée, rue Saint-Dizier. La clim de la boutique ne refroidit plus du tout et j'ai mes vitrines de pâtisseries.",
        },
        { speaker: "nora", text: "Je comprends l'urgence. S'agit-il de la climatisation Atlantic Fujitsu au fond de la boutique ?" },
        { speaker: "caller", text: "Oui, c'est celle-là." },
        { speaker: "nora", text: "Je transmets en priorité haute. Un technicien peut passer demain vers 10 h, cela vous convient-il ?" },
        { speaker: "caller", text: "Oui, parfait." },
        { speaker: "nora", text: "C'est confirmé : Karim Benali passera demain vers 10 h. Bonne fin de journée !" },
      ],
      duration_seconds: 118,
      status: "converti",
      created_at: clock.at(-2, 16, 20),
    },
    {
      id: "call_bernard",
      organization_id: DEMO_ORG_ID,
      client_id: bernard.id,
      quote_id: qBernard.id,
      handled_by: "nora",
      caller_name: "Jean-Pierre Bernard",
      caller_phone: bernard.phone,
      caller_address: bernard.address,
      caller_postal_code: bernard.postal_code,
      caller_city: bernard.city,
      urgency: "normale",
      detected_intent: "information",
      equipment_mentioned: "Projet PAC Air/Eau Atlantic 8 kW",
      summary:
        "Question sur les aides MaPrimeRénov' et CEE avant de signer le devis PAC. Souhaite être rappelé par Marc Ouhadda en fin de journée.",
      preferred_slot: "Rappel en fin de journée (après 18 h)",
      transcript: [
        { speaker: "nora", text: "Bonjour, ClimAir Pro, Nora à votre écoute." },
        {
          speaker: "caller",
          text: "Bonjour, Jean-Pierre Bernard. J'ai reçu votre devis pour la pompe à chaleur. Avant de signer, je voudrais comprendre comment fonctionnent les aides, MaPrimeRénov' et les CEE.",
        },
        {
          speaker: "nora",
          text: "Bien sûr Monsieur Bernard. Je transmets votre question à Marc Ouhadda, qui a préparé votre devis. Quand souhaitez-vous être rappelé ?",
        },
        { speaker: "caller", text: "En fin de journée, après 18 heures." },
        { speaker: "nora", text: "C'est noté : rappel en fin de journée au sujet des aides pour votre projet de PAC. Bonne journée !" },
      ],
      duration_seconds: 96,
      status: "a_rappeler",
      created_at: clock.at(-2, 10, 37),
    },
    {
      id: "call_mansouri",
      organization_id: DEMO_ORG_ID,
      client_id: mansouri.id,
      handled_by: "nora",
      caller_name: "Nadia Mansouri",
      caller_phone: mansouri.phone,
      caller_address: mansouri.address,
      caller_postal_code: mansouri.postal_code,
      caller_city: mansouri.city,
      urgency: "normale",
      detected_intent: "devis_installation",
      equipment_mentioned: "Climatisation réversible tri-split (salon 35 m² + 2 chambres)",
      summary:
        "Souhaite un devis pour installer une climatisation réversible dans son salon (35 m²) et 2 chambres à l'étage.",
      preferred_slot: "Visite technique en semaine après 17 h",
      transcript: [
        {
          speaker: "nora",
          text: "Bonsoir, ClimAir Pro, je suis Nora, l'assistante de l'entreprise. Nos techniciens sont en intervention, je prends votre demande. Que puis-je faire pour vous ?",
        },
        {
          speaker: "caller",
          text: "Bonsoir, je voudrais un devis pour installer une climatisation réversible chez moi, dans le salon et deux chambres à l'étage.",
        },
        { speaker: "nora", text: "Très bien. Quelle est la surface approximative du salon ?" },
        { speaker: "caller", text: "Environ 35 mètres carrés. Les chambres font à peu près 12 mètres carrés chacune." },
        { speaker: "nora", text: "Parfait. Puis-je avoir votre nom et l'adresse du logement ?" },
        { speaker: "caller", text: "Nadia Mansouri, 14 rue des Jardins à Vandœuvre-lès-Nancy." },
        { speaker: "nora", text: "Merci Madame Mansouri. À quel numéro pouvons-nous vous rappeler ?" },
        { speaker: "caller", text: "Au 06 42 18 99 10." },
        { speaker: "nora", text: "Avez-vous une préférence pour la visite technique ?" },
        { speaker: "caller", text: "En semaine, plutôt après 17 heures." },
        {
          speaker: "nora",
          text: "C'est noté : devis climatisation réversible tri-split, salon de 35 m² et deux chambres, visite technique en semaine après 17 h. Marc Ouhadda vous recontacte rapidement. Bonne soirée !",
        },
      ],
      duration_seconds: 164,
      status: "qualifie_ia",
      created_at: clock.past(-1, 19, 42),
    },
    {
      id: "call_syndic_ecs",
      organization_id: DEMO_ORG_ID,
      client_id: syndic.id,
      intervention_id: "int_syndic_ecs",
      handled_by: "nora",
      caller_name: "Céline Hoffmann (Syndic Lorraine Habitat)",
      caller_phone: syndic.phone,
      caller_address: bellecroix.address,
      caller_postal_code: bellecroix.postal_code,
      caller_city: bellecroix.city,
      urgency: "urgente",
      detected_intent: "depannage",
      equipment_mentioned: "Chaufferie collective Viessmann — Résidence Bellecroix",
      summary: "Plus d'eau chaude au bâtiment A de la Résidence Bellecroix depuis ce matin. Clé de la chaufferie au local du gardien.",
      preferred_slot: "Dès que possible ce matin",
      transcript: [
        { speaker: "nora", text: "Bonjour, ClimAir Pro, Nora à votre écoute." },
        {
          speaker: "caller",
          text: "Bonjour, Céline Hoffmann, Syndic Lorraine Habitat. Il n'y a plus d'eau chaude au bâtiment A de la résidence Bellecroix depuis ce matin, les résidents appellent.",
        },
        {
          speaker: "nora",
          text: "Je note une urgence : absence d'eau chaude sanitaire, Résidence Bellecroix, bâtiment A, à Metz. L'accès à la chaufferie se fait-il toujours par le gardien ?",
        },
        { speaker: "caller", text: "Oui, la clé est au local du gardien." },
        { speaker: "nora", text: "Un technicien sera sur place ce matin à 8 h. Je vous envoie la confirmation par SMS." },
      ],
      duration_seconds: 87,
      status: "converti",
      created_at: clock.past(0, 7, 12),
    },
    {
      id: "call_martin",
      organization_id: DEMO_ORG_ID,
      client_id: martin.id,
      intervention_id: "int_martin",
      handled_by: "bureau",
      caller_name: "Claire Martin",
      caller_phone: martin.phone,
      caller_address: martin.address,
      caller_postal_code: martin.postal_code,
      caller_city: martin.city,
      urgency: "haute",
      detected_intent: "depannage",
      equipment_mentioned: "Climatisation Daikin Perfera FTXM35R (salon, 2023)",
      summary:
        "Fuite d'eau sous l'unité intérieure du salon depuis ce matin. Appareil arrêté par la cliente. Suspicion de pompe de relevage des condensats hors service.",
      preferred_slot: "Aujourd'hui 14 h",
      transcript: [
        { speaker: "agent", text: "ClimAir Pro bonjour, Sophie à l'appareil." },
        {
          speaker: "caller",
          text: "Bonjour, Claire Martin à Laxou. Ma climatisation du salon fuit : il y a de l'eau qui coule sous l'appareil depuis ce matin.",
        },
        { speaker: "agent", text: "C'est bien la Daikin installée chez vous en 2023 ? L'appareil est-il toujours en marche ?" },
        { speaker: "caller", text: "Oui, c'est celle-là. Je l'ai arrêtée." },
        { speaker: "agent", text: "C'est probablement la pompe de relevage. Lucas peut passer cet après-midi à 14 h." },
        { speaker: "caller", text: "Parfait, je serai là." },
      ],
      duration_seconds: 142,
      status: "converti",
      created_at: clock.past(0, 8, 12),
    },
  ];

  /* -------------------------- Interventions ------------------------- */

  const CHECK = {
    installClim: ["Tirage au vide (< 500 microns)", "Test d'étanchéité à l'azote", "Contrôle des pressions et intensités", "Explications d'utilisation au client"],
    installPac: ["Désembouage et rinçage du réseau", "Remplissage et purge du circuit", "Paramétrage de la loi d'eau", "Contrôle de l'appoint électrique", "Explications d'utilisation au client"],
    installCet: ["Raccordement du groupe de sécurité", "Remplissage et purge", "Mise en service et paramétrage", "Explications d'utilisation au client"],
    installChaudiere: ["Contrôle d'étanchéité gaz", "Analyse de combustion", "Réglage des températures", "Explications d'utilisation au client"],
    depannageClim: ["Contrôle de l'évacuation des condensats", "Contrôle des filtres et de l'échangeur", "Mesure de la température de soufflage", "Test de fonctionnement froid / chaud"],
    depannageEcs: ["Diagnostic de la production d'eau chaude", "Contrôle brûleur et échangeur", "Remise en service", "Information du gardien"],
    plomberie: ["Isolement du réseau", "Remplacement des pièces défectueuses", "Remise en eau et purge", "Contrôle d'étanchéité"],
    maintenanceVmc: ["Nettoyage des bouches d'extraction (échantillon)", "Contrôle courroie et roulements du caisson", "Mesure des débits et dépressions", "Contrôle des pressostats", "Compte-rendu au syndic"],
  };

  const iKieffer = b.intervention({
    id: "int_kieffer",
    client: kieffer,
    quote: qKieffer,
    title: "Pose multi-split Daikin 3 pièces",
    type: "installation",
    priority: "normale",
    status: "terminee",
    technicianId: DEMO_USERS.lucas,
    createdAt: qKieffer.signed_at!,
    scheduled: { start: clock.at(-40, 8, 0), end: clock.at(-39, 12, 0) },
    actual: { start: clock.at(-40, 8, 10), end: clock.at(-39, 11, 40) },
    checklist: CHECK.installClim,
    report: {
      notes:
        "Installation d'un multi-split Daikin 3 unités (séjour 3,5 kW, deux chambres 2,0 kW). Liaisons sous goulotte, pompe de relevage dans le séjour, mise en service R32 avec tirage au vide et test à l'azote.",
      recommendations: "Nettoyer les filtres tous les 3 mois. Entretien annuel recommandé.",
    },
    signedBy: "Anne Kieffer",
  });
  const iMercier = b.intervention({
    id: "int_mercier",
    client: mercier,
    quote: qMercier,
    title: "Pose chauffe-eau thermodynamique Thermor Aeromax 5",
    type: "installation",
    priority: "normale",
    status: "terminee",
    technicianId: DEMO_USERS.karim,
    createdAt: qMercier.signed_at!,
    scheduled: { start: clock.at(-24, 8, 30), end: clock.at(-24, 14, 30) },
    actual: { start: clock.at(-24, 8, 35), end: clock.at(-24, 13, 50) },
    checklist: CHECK.installCet,
    report: {
      notes:
        "Dépose de l'ancien chauffe-eau électrique 200 L. Pose et raccordement du chauffe-eau thermodynamique Thermor Aeromax 5 (200 L) avec groupe de sécurité NF neuf. Mise en service, paramétrage en mode automatique et explications d'usage au client.",
      recommendations: "Contrôle annuel conseillé (anode, filtre à air).",
    },
    signedBy: "Thomas Mercier",
  });
  const iPetit = b.intervention({
    id: "int_petit",
    client: petit,
    quote: qPetit,
    title: "Installation PAC Air/Eau Atlantic 8 kW",
    type: "installation",
    priority: "normale",
    status: "terminee",
    technicianId: DEMO_USERS.lucas,
    createdAt: qPetit.signed_at!,
    scheduled: { start: clock.at(-19, 8, 0), end: clock.at(-18, 17, 30) },
    actual: { start: clock.at(-19, 8, 5), end: clock.at(-18, 17, 10) },
    checklist: CHECK.installPac,
    report: {
      notes:
        "Pose de la PAC Air/Eau Atlantic Alfea Extensa Duo 8 kW, raccordements hydrauliques et frigorifiques. Désembouage du réseau (7 radiateurs) et pose d'un pot à boue magnétique. Mise en service et paramétrage de la loi d'eau.",
      recommendations: "Entretien annuel obligatoire pour maintenir la garantie constructeur.",
    },
    signedBy: "Antoine Petit",
  });
  const iRoux = b.intervention({
    id: "int_roux",
    client: roux,
    quote: qRoux,
    title: "Remplacement chaudière gaz Viessmann Vitodens",
    type: "installation",
    priority: "normale",
    status: "terminee",
    technicianId: DEMO_USERS.karim,
    createdAt: qRoux.signed_at!,
    scheduled: { start: clock.at(-12, 8, 0), end: clock.at(-12, 18, 0) },
    actual: { start: clock.at(-12, 8, 0), end: clock.at(-12, 16, 30) },
    checklist: CHECK.installChaudiere,
    report: {
      notes:
        "Remplacement de la chaudière gaz par une Viessmann Vitodens 100-W 25 kW à condensation, pose d'une ventouse concentrique neuve et désembouage du réseau. Analyse de combustion conforme.",
    },
    signedBy: "Sandrine Roux",
  });
  const iSyndicCirc = b.intervention({
    id: "int_syndic_circ",
    client: syndic,
    site: parc,
    title: "Remplacement circulateur chaufferie — Résidence du Parc",
    type: "depannage",
    priority: "haute",
    status: "terminee",
    technicianId: DEMO_USERS.karim,
    createdAt: clock.at(-16, 7, 40),
    scheduled: { start: clock.at(-16, 9, 0), end: clock.at(-16, 12, 0) },
    actual: { start: clock.at(-16, 9, 10), end: clock.at(-16, 12, 5) },
    checklist: CHECK.plomberie,
    vat: 10,
    parts: [
      { ref: "DEP-DIAG", qty: 1, source: "bureau" },
      { ref: "ACC-CIRC-COLL", qty: 1, source: "terrain" },
      { ref: "MO-CHAU", qty: 3, source: "terrain" },
    ],
    report: {
      notes:
        "Remplacement du circulateur de la chaufferie collective (Grundfos Magna3 32-80). Purge du réseau et contrôle des pressions. Chauffage rétabli dans tous les logements.",
    },
    signedBy: "Gardien — M. Weber",
  });
  const iSyndicFuite = b.intervention({
    id: "int_syndic_fuite",
    client: syndic,
    site: { ...tilleuls, label: "Résidence Les Tilleuls — bât. B" },
    title: "Fuite sur colonne d'eau froide — Les Tilleuls bât. B",
    type: "depannage",
    priority: "urgente",
    status: "terminee",
    technicianId: DEMO_USERS.karim,
    createdAt: clock.at(-9, 8, 10),
    scheduled: { start: clock.at(-9, 10, 0), end: clock.at(-9, 14, 0) },
    actual: { start: clock.at(-9, 10, 5), end: clock.at(-9, 13, 55) },
    checklist: CHECK.plomberie,
    vat: 10,
    parts: [
      { ref: "DEP-DIAG", qty: 1, source: "bureau" },
      { ref: "ACC-KIT-COL", qty: 1, source: "terrain" },
      { ref: "MO-CHAU", qty: 4, source: "terrain" },
    ],
    report: {
      notes:
        "Recherche et réparation de la fuite sur la colonne d'eau froide du bâtiment B : remplacement de la vanne d'isolement et des raccords corrodés. Remise en eau et contrôle d'étanchéité.",
      anomalies: "Corrosion avancée sur les piquages des étages 2 et 3.",
      recommendations: "Prévoir un diagnostic complet des colonnes lors de la prochaine AG.",
    },
    signedBy: "Gardien — M. Weber",
  });
  const iPharmacie = b.intervention({
    id: "int_pharmacie",
    client: pharmacie,
    quote: qPharmacie,
    title: "Pose climatisation mono-split Daikin 3,5 kW",
    type: "installation",
    priority: "normale",
    status: "planifiee",
    technicianId: DEMO_USERS.lucas,
    createdAt: qPharmacie.signed_at!,
    scheduled: { start: clock.at(0, 8, 30), end: clock.at(0, 12, 30) },
    description: "Pose avant l'ouverture : unité intérieure au-dessus du comptoir, groupe extérieur en cour arrière.",
    checklist: CHECK.installClim,
  });
  const iSyndicVmc = b.intervention({
    id: "int_syndic_vmc",
    client: syndic,
    site: tilleuls,
    contractId: ctrSyndic.id,
    equipmentId: eqTilleulsVmc.id,
    title: "Visite d'entretien annuelle VMC collective",
    type: "maintenance",
    priority: "normale",
    status: "planifiee",
    technicianId: DEMO_USERS.karim,
    createdAt: clock.at(-5, 9, 20),
    scheduled: { start: clock.at(1, 8, 0), end: clock.at(1, 11, 0) },
    durationMinutes: 180,
    isBillable: false,
    description: "Visite annuelle prévue au contrat (déjà facturé). Prévenir le gardien la veille.",
    checklist: CHECK.maintenanceVmc,
  });
  const iDoree = b.intervention({
    id: "int_doree",
    client: doree,
    callId: "call_doree",
    equipmentId: eqDoree.id,
    title: "Dépannage climatisation boutique — ne refroidit plus",
    type: "depannage",
    priority: "haute",
    status: "terminee",
    technicianId: DEMO_USERS.karim,
    createdAt: clock.at(-2, 16, 25),
    scheduled: { start: clock.at(-1, 10, 0), end: clock.at(-1, 11, 30) },
    actual: { start: clock.at(-1, 10, 5), end: clock.at(-1, 11, 20) },
    durationMinutes: 90,
    description: "La climatisation de la boutique ne refroidit plus. Vitrines réfrigérées à protéger.",
    checklist: CHECK.depannageClim,
    vat: 20,
    parts: [
      { ref: "DEP-DIAG", qty: 1, source: "bureau" },
      { ref: "ACC-SONDE", qty: 1, source: "terrain" },
      { ref: "MO-FRIG", qty: 1, source: "terrain" },
    ],
    report: {
      notes:
        "Remplacement de la sonde de reprise défectueuse de l'unité intérieure. Nettoyage complet des filtres et contrôle des pressions de fonctionnement. Climatisation remise en service : température de soufflage mesurée à 12 °C.",
      anomalies: "Filtres très encrassés (poussière de farine) ayant accéléré l'usure de la sonde.",
      recommendations: "Nettoyer les filtres tous les 2 mois. Un contrat d'entretien annuel est recommandé dans cet environnement.",
    },
    signedBy: "Isabelle Vasseur",
  });
  const iSyndicEcs = b.intervention({
    id: "int_syndic_ecs",
    client: syndic,
    site: bellecroix,
    callId: "call_syndic_ecs",
    equipmentId: eqBellecroix.id,
    title: "Plus d'eau chaude — Résidence Bellecroix bât. A",
    type: "depannage",
    priority: "urgente",
    status: "planifiee",
    technicianId: DEMO_USERS.karim,
    createdAt: clock.past(0, 7, 14),
    scheduled: { start: clock.at(0, 8, 0), end: clock.at(0, 10, 0) },
    durationMinutes: 120,
    description: "Absence d'eau chaude sanitaire au bâtiment A depuis ce matin. Clé de la chaufferie au local du gardien.",
    checklist: CHECK.depannageEcs,
    vat: 10,
    parts: [{ ref: "DEP-DIAG", qty: 1, source: "bureau" }],
  });
  const iMartin = b.intervention({
    id: "int_martin",
    client: martin,
    callId: "call_martin",
    equipmentId: eqMartin.id,
    title: "Dépannage climatisation — fuite d'eau unité intérieure",
    type: "depannage",
    priority: "haute",
    status: "planifiee",
    technicianId: DEMO_USERS.lucas,
    createdAt: clock.past(0, 8, 15),
    scheduled: { start: clock.at(0, 14, 0), end: clock.at(0, 16, 0) },
    durationMinutes: 120,
    description:
      "Fuite d'eau sous l'unité intérieure du salon depuis ce matin. Appareil arrêté par la cliente. Suspicion de pompe de relevage des condensats hors service.",
    checklist: CHECK.depannageClim,
    vat: 10,
    parts: [{ ref: "DEP-DIAG", qty: 1, source: "bureau" }],
  });

  const interventions = [
    iKieffer,
    iMercier,
    iPetit,
    iRoux,
    iSyndicCirc,
    iSyndicFuite,
    iPharmacie,
    iSyndicVmc,
    iDoree,
    iSyndicEcs,
    iMartin,
  ];
  const nextIntervention = assignReferences(interventions, "intervention", (i) => i.created_at, { start: 108 });

  /* -------------------------- Équipements posés --------------------- */
  // Boucle paiement → parc : les machines payées entrent dans le parc client avec leur garantie.

  const installedEquipment = (intervention: Intervention, ref: string, location: string, createdAt: ISODateTime) => {
    const template = b.item(ref).equipment_template!;
    const installDay = toDate(intervention.actual_end!);
    const warrantyEnd = new Date(installDay);
    warrantyEnd.setFullYear(warrantyEnd.getFullYear() + template.warranty_years);
    return addEquipment({
      id: `eq_${intervention.id.replace("int_", "")}`,
      client_id: intervention.client_id,
      category: template.category,
      brand: template.brand,
      model: template.model,
      refrigerant_type: template.refrigerant_type,
      installation_date: toISODate(installDay),
      warranty_end_date: toISODate(warrantyEnd),
      location_in_property: location,
      installed_by_intervention_id: intervention.id,
      created_at: createdAt,
    });
  };

  /* ---------------------------- Factures ---------------------------- */

  const invKieffer = b.invoice({
    id: "inv_kieffer",
    client: kieffer,
    type: "facture",
    title: qKieffer.title,
    issue: -39,
    dueInDays: 15,
    quoteId: qKieffer.id,
    interventionId: iKieffer.id,
    items: b.finalInvoiceLines("inv_kieffer", qKieffer, iKieffer),
    payment: { method: "virement", at: clock.previousMonth(-33, 10, 0) },
  });
  const invPetitAcompte = b.invoice({
    id: "inv_petit_acompte",
    client: petit,
    type: "acompte",
    title: `Acompte — ${qPetit.title}`,
    issue: -35,
    dueInDays: 7,
    quoteId: qPetit.id,
    items: b.depositLines("inv_petit_acompte", qPetit),
    payment: { method: "virement", at: clock.previousMonth(-33, 9, 30) },
  });
  const invMercier = b.invoice({
    id: "inv_mercier",
    client: mercier,
    type: "facture",
    title: qMercier.title,
    issue: -24,
    dueInDays: 15,
    quoteId: qMercier.id,
    interventionId: iMercier.id,
    items: b.finalInvoiceLines("inv_mercier", qMercier, iMercier),
  });
  const invSyndicContrat = b.invoice({
    id: "inv_syndic_contrat",
    client: syndic,
    type: "facture",
    title: `${ctrSyndic.name} — échéance annuelle`,
    issue: -20,
    dueInDays: 30,
    contractId: ctrSyndic.id,
    items: b.lines("inv_syndic_contrat", [{ ref: "MAINT-VMC", qty: 4 }], 10),
    payment: { method: "virement", at: clock.thisMonth(-8, 9, 0) },
  });
  const invPetitSolde = b.invoice({
    id: "inv_petit_solde",
    client: petit,
    type: "facture",
    title: qPetit.title,
    issue: -18,
    dueInDays: 15,
    quoteId: qPetit.id,
    interventionId: iPetit.id,
    items: b.finalInvoiceLines("inv_petit_solde", qPetit, iPetit),
    deductions: [invPetitAcompte],
    payment: { method: "virement", at: clock.thisMonth(-6, 11, 20) },
  });
  const invSyndicCirc = b.invoice({
    id: "inv_syndic_circ",
    client: syndic,
    type: "facture",
    title: iSyndicCirc.title,
    issue: -16,
    dueInDays: 30,
    interventionId: iSyndicCirc.id,
    items: b.finalInvoiceLines("inv_syndic_circ", undefined, iSyndicCirc),
    payment: { method: "virement", at: clock.thisMonth(-4, 10, 15) },
  });
  const invRoux = b.invoice({
    id: "inv_roux",
    client: roux,
    type: "facture",
    title: qRoux.title,
    issue: -12,
    dueInDays: 15,
    quoteId: qRoux.id,
    interventionId: iRoux.id,
    items: b.finalInvoiceLines("inv_roux", qRoux, iRoux),
    payment: { method: "cheque", at: clock.thisMonth(-10, 17, 0) },
  });
  const invSyndicFuite = b.invoice({
    id: "inv_syndic_fuite",
    client: syndic,
    type: "facture",
    title: iSyndicFuite.title,
    issue: -9,
    dueInDays: 30,
    interventionId: iSyndicFuite.id,
    items: b.finalInvoiceLines("inv_syndic_fuite", undefined, iSyndicFuite),
    payment: { method: "virement", at: clock.thisMonth(-2, 9, 45) },
  });
  const invPharmacieAcompte = b.invoice({
    id: "inv_pharmacie_acompte",
    client: pharmacie,
    type: "acompte",
    title: `Acompte — ${qPharmacie.title}`,
    issue: -8,
    dueInDays: 7,
    quoteId: qPharmacie.id,
    items: b.depositLines("inv_pharmacie_acompte", qPharmacie),
    payment: { method: "cb", at: clock.thisMonth(-5, 15, 30) },
  });

  const invoices = [
    invKieffer,
    invPetitAcompte,
    invMercier,
    invSyndicContrat,
    invPetitSolde,
    invSyndicCirc,
    invRoux,
    invSyndicFuite,
    invPharmacieAcompte,
  ];
  const nextInvoice = assignReferences(invoices, "invoice", (inv) => inv.issue_date, { id: invMercier.id, number: 84 });
  const invoiceById = new Map(invoices.map((inv) => [inv.id, inv]));
  for (const inv of invoices) {
    for (const deduction of inv.deposit_deductions) {
      deduction.reference = invoiceById.get(deduction.invoice_id)?.reference ?? deduction.reference;
    }
  }

  // Parc installé : uniquement pour les chantiers soldés.
  const eqPetit = installedEquipment(iPetit, "PAC-ATL-8", "Extérieur — façade nord · module hydraulique en buanderie", invPetitSolde.payments[0].paid_at);
  installedEquipment(iRoux, "CHAU-VIE-25", "Cuisine — placard technique", invRoux.payments[0].paid_at);
  installedEquipment(iKieffer, "CLIM-DAI-UE3", "Groupe extérieur : terrasse · unités : séjour + 2 chambres", invKieffer.payments[0].paid_at);

  /* -------------------------- Contrats (2/2) ------------------------ */

  const installDayPetit = toDate(iPetit.actual_end!);
  const ctrPetit: MaintenanceContract = {
    ...contractFrom({
      id: "ctr_petit",
      client: petit,
      equipmentId: eqPetit.id,
      ref: "MAINT-PAC",
      vat: 10,
      name: "Entretien annuel PAC Air/Eau",
      startOffset: 0,
      nextVisitOffset: 0,
      createdAt: invPetitSolde.payments[0].paid_at,
    }),
    start_date: toISODate(installDayPetit),
    next_visit_date: toISODate(addDays(installDayPetit, 365)),
  };

  const contracts = [ctrBellevue, ctrSyndic, ctrMartin, ctrPetit];
  const nextContract = assignReferences(contracts, "contract", (c) => c.created_at, { start: 9 });

  /* ------------------------------ Photos ---------------------------- */

  const photo = (
    id: string,
    intervention: Intervention,
    category: PhotoCategory,
    file: string,
    caption: string,
    takenAt: ISODateTime,
  ): JobPhoto => ({
    id,
    organization_id: DEMO_ORG_ID,
    intervention_id: intervention.id,
    client_id: intervention.client_id,
    category,
    image_url: `/demo/photos/${file}.svg`,
    caption,
    taken_at: takenAt,
    taken_by_user_id: intervention.assigned_technician_id,
  });

  const photos: JobPhoto[] = [
    photo("ph_doree_1", iDoree, "avant", "split-encrasse", "Filtres de l'unité intérieure colmatés (poussière de farine)", clock.at(-1, 10, 12)),
    photo("ph_doree_2", iDoree, "anomalie", "sonde-defectueuse", "Sonde de reprise hors tolérance", clock.at(-1, 10, 24)),
    photo("ph_doree_3", iDoree, "apres", "split-propre", "Unité intérieure nettoyée, filtres remontés", clock.at(-1, 11, 8)),
    photo("ph_doree_4", iDoree, "apres", "thermometre-soufflage", "Température de soufflage : 12 °C", clock.at(-1, 11, 15)),
    photo("ph_mercier_1", iMercier, "avant", "chauffe-eau-ancien", "Ancien chauffe-eau électrique 200 L entartré", clock.at(-24, 8, 45)),
    photo("ph_mercier_2", iMercier, "apres", "cet-installe", "Thermor Aeromax 5 installé et raccordé", clock.at(-24, 13, 30)),
    photo("ph_mercier_3", iMercier, "plaque_materiel", "plaque-signaletique", "Plaque signalétique Aeromax 5", clock.at(-24, 13, 35)),
    photo("ph_petit_1", iPetit, "apres", "pac-exterieure", "Unité extérieure Alfea Extensa posée sur supports", clock.at(-18, 16, 40)),
    photo("ph_petit_2", iPetit, "plaque_materiel", "plaque-signaletique", "Plaque signalétique de la PAC", clock.at(-18, 16, 45)),
    photo("ph_fuite_1", iSyndicFuite, "anomalie", "colonne-corrodee", "Colonne EF corrodée au niveau du piquage (bât. B)", clock.at(-9, 10, 30)),
    photo("ph_fuite_2", iSyndicFuite, "apres", "colonne-reparee", "Vanne 1/4 de tour et raccords neufs — fuite supprimée", clock.at(-9, 13, 40)),
  ];

  /* ----------------------- Timeline & messages ---------------------- */

  const data: BatopsData = {
    schema_version: DEMO_SCHEMA_VERSION,
    seeded_at: now.toISOString(),
    organization,
    users,
    clients,
    equipment,
    catalog: b.catalog,
    quotes,
    interventions,
    photos,
    invoices,
    contracts,
    calls,
    activities: [],
    outbox: [],
    sequences: {
      quote: nextQuote,
      intervention: nextIntervention,
      invoice: nextInvoice,
      avoir: 1,
      contract: nextContract,
    },
  };

  data.activities = deriveActivities(data);
  data.outbox = deriveOutbox(data);
  return data;
}

/* ------------------------------------------------------------------ */
/* Timeline & journal d'envoi dérivés des entités du seed              */
/* ------------------------------------------------------------------ */

function deriveActivities(data: BatopsData): ClientActivity[] {
  const userName = (id?: string) => data.users.find((u) => u.id === id)?.full_name;
  const activities: ClientActivity[] = [];
  const push = (a: Omit<ClientActivity, "id" | "organization_id">) =>
    activities.push({ ...a, id: `act_${activities.length + 1}`, organization_id: DEMO_ORG_ID });

  for (const c of data.clients) {
    push({ client_id: c.id, type: "client_created", title: c.status === "prospect" ? "Prospect créé" : "Fiche client créée", created_at: c.created_at });
  }
  for (const call of data.calls) {
    push({
      client_id: call.client_id!,
      type: "call",
      title: call.handled_by === "nora" ? "Appel qualifié par Nora" : "Appel reçu au bureau",
      description: call.summary,
      actor_name: call.handled_by === "nora" ? "Nora (IA)" : "Sophie Laurent",
      entity: { kind: "call", id: call.id },
      created_at: call.created_at,
    });
  }
  for (const q of data.quotes) {
    push({ client_id: q.client_id, type: "quote_created", title: `Devis ${q.reference} créé`, description: q.title, actor_name: userName(q.created_by_user_id), entity: { kind: "quote", id: q.id }, created_at: q.created_at });
    if (q.sent_at) {
      push({ client_id: q.client_id, type: "quote_sent", title: `Devis ${q.reference} envoyé`, description: `${formatEUR(q.total_ttc)} TTC — lien de signature transmis au client`, actor_name: userName(q.created_by_user_id), entity: { kind: "quote", id: q.id }, created_at: q.sent_at });
    }
    if (q.signed_at) {
      push({ client_id: q.client_id, type: "quote_signed", title: `Devis ${q.reference} signé`, description: `Signé électroniquement par ${q.signed_by_name}`, actor_name: q.signed_by_name, entity: { kind: "quote", id: q.id }, created_at: q.signed_at });
    }
  }
  for (const i of data.interventions) {
    push({ client_id: i.client_id, type: "intervention_created", title: `Intervention ${i.reference} créée`, description: `${INTERVENTION_TYPE_LABEL[i.type]} — ${i.title}`, entity: { kind: "intervention", id: i.id }, created_at: i.created_at });
    if (i.scheduled_start) {
      const scheduledAt = new Date(toDate(i.created_at).getTime() + 10 * 60_000).toISOString();
      push({ client_id: i.client_id, type: "intervention_scheduled", title: `Intervention ${i.reference} planifiée`, description: `${formatDateTime(i.scheduled_start)} avec ${userName(i.assigned_technician_id) ?? "un technicien"}`, actor_name: "Sophie Laurent", entity: { kind: "intervention", id: i.id }, created_at: scheduledAt });
    }
    if (i.status === "terminee" && i.actual_end) {
      push({ client_id: i.client_id, type: "intervention_completed", title: `Intervention ${i.reference} terminée`, description: i.signed_by_name ? `Rapport signé par ${i.signed_by_name}` : undefined, actor_name: userName(i.assigned_technician_id), entity: { kind: "intervention", id: i.id }, created_at: i.actual_end });
    }
    const photos = data.photos.filter((p) => p.intervention_id === i.id);
    if (photos.length > 0) {
      const last = photos.reduce((max, p) => (p.taken_at > max ? p.taken_at : max), photos[0].taken_at);
      push({ client_id: i.client_id, type: "photos_added", title: `${photos.length} photo${photos.length > 1 ? "s" : ""} de chantier ajoutée${photos.length > 1 ? "s" : ""}`, description: i.title, actor_name: userName(i.assigned_technician_id), entity: { kind: "intervention", id: i.id }, created_at: last });
    }
  }
  for (const inv of data.invoices) {
    const label = inv.invoice_type === "acompte" ? "Facture d'acompte" : "Facture";
    push({ client_id: inv.client_id, type: "invoice_issued", title: `${label} ${inv.reference} émise`, description: `${formatEUR(inv.amount_due_ttc)} TTC à régler`, entity: { kind: "invoice", id: inv.id }, created_at: inv.created_at });
    for (const p of inv.payments) {
      push({ client_id: inv.client_id, type: "payment_received", title: `Paiement reçu — ${inv.reference}`, description: formatEUR(p.amount), entity: { kind: "invoice", id: inv.id }, created_at: p.paid_at });
    }
  }
  for (const eq of data.equipment.filter((e) => e.installed_by_intervention_id)) {
    push({ client_id: eq.client_id, type: "equipment_added", title: "Équipement ajouté au parc", description: `${eq.brand} ${eq.model}`, entity: { kind: "equipment", id: eq.id }, created_at: eq.created_at });
  }
  for (const ctr of data.contracts) {
    push({ client_id: ctr.client_id, type: "contract_created", title: `Contrat ${ctr.reference} souscrit`, description: ctr.name, entity: { kind: "contract", id: ctr.id }, created_at: ctr.created_at });
  }
  return activities;
}

function deriveOutbox(data: BatopsData): OutboundMessage[] {
  const messages: OutboundMessage[] = [];
  const clientById = new Map(data.clients.map((c) => [c.id, c]));
  const push = (m: Omit<OutboundMessage, "id" | "organization_id" | "provider_mode" | "status">) =>
    messages.push({ ...m, id: `msg_${messages.length + 1}`, organization_id: DEMO_ORG_ID, provider_mode: "mock", status: "simule" });

  for (const q of data.quotes.filter((quote) => quote.sent_at)) {
    const c = clientById.get(q.client_id)!;
    push({
      channel: "email",
      to: c.email ?? c.phone,
      subject: `Votre devis ${q.reference} — ${data.organization.name}`,
      body: `Bonjour ${clientDisplayName(c)},\n\nVous trouverez votre devis « ${q.title} » (${formatEUR(q.total_ttc)} TTC). Vous pouvez le consulter et le signer en ligne depuis votre espace client.\n\nCordialement,\n${data.organization.name}`,
      client_id: c.id,
      entity: { kind: "quote", id: q.id },
      created_at: q.sent_at!,
    });
  }
  for (const inv of data.invoices) {
    const c = clientById.get(inv.client_id)!;
    push({
      channel: "email",
      to: c.email ?? c.phone,
      subject: `Facture ${inv.reference} — ${data.organization.name}`,
      body: `Bonjour ${clientDisplayName(c)},\n\nVeuillez trouver votre facture ${inv.reference} d'un montant de ${formatEUR(inv.amount_due_ttc)} TTC.\n\nCordialement,\n${data.organization.name}`,
      client_id: c.id,
      entity: { kind: "invoice", id: inv.id },
      created_at: inv.created_at,
    });
  }
  return messages;
}
