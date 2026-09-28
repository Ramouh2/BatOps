/**
 * Règles métier des devis (pures) : totaux avec remise, acompte, validité, conditions par défaut,
 * regroupement par section et plan de l'intervention préparée à la signature.
 */
import type {
  CatalogItem,
  DocumentLine,
  InterventionType,
  PartUsed,
  Quote,
  VatRate,
} from "@/types/batops";
import { SECTION_ORDER, defaultSectionFor } from "./catalog";
import { CHECKLISTS } from "./checklists";
import { diffInCalendarDays, toDate } from "./dates";
import { formatVatRate } from "./format";
import { createId } from "./ids";
import { computeTotals, lineTotal, round2, type DocumentTotals } from "./money";

/* ------------------------------------------------------------------ */
/* Totaux                                                              */
/* ------------------------------------------------------------------ */

export type DiscountMode = "amount" | "percent";

export interface DiscountInput {
  discount_amount_ht: number;
  /** Renseigné quand la remise est saisie en % : le montant suit alors le sous-total. */
  discount_percent?: number;
}

/** Montant HT de la remise : % du sous-total si saisi en %, sinon montant plafonné au sous-total. */
export function resolveDiscount(subtotalHt: number, discount: DiscountInput): number {
  const raw =
    discount.discount_percent !== undefined
      ? (subtotalHt * Math.min(Math.max(discount.discount_percent, 0), 100)) / 100
      : discount.discount_amount_ht;
  return round2(Math.min(Math.max(raw, 0), subtotalHt));
}

/** Totaux d'un devis (TVA par taux, remise répartie au prorata, coût et marge). */
export function computeQuoteTotals(lines: DocumentLine[], discount: DiscountInput): DocumentTotals {
  const subtotal = round2(lines.reduce((sum, l) => sum + lineTotal(l.qty, l.unit_price_ht), 0));
  return computeTotals(lines, resolveDiscount(subtotal, discount));
}

/** Acompte TTC demandé à la signature. */
export function depositAmount(totalTtc: number, depositPercent: number): number {
  return round2((totalTtc * depositPercent) / 100);
}

/** Durée de validité (jours) d'un devis. */
export function quoteValidityDays(quote: Pick<Quote, "issue_date" | "valid_until">): number {
  return Math.max(1, diffInCalendarDays(toDate(quote.issue_date), toDate(quote.valid_until)));
}

/** Taux de TVA distincts présents sur les lignes (triés). */
export function vatRatesOf(lines: Pick<DocumentLine, "vat_rate">[]): VatRate[] {
  return [...new Set(lines.map((l) => l.vat_rate))].sort((a, b) => a - b);
}

/** Ligne de devis créée depuis un article du catalogue : le prix est TOUJOURS celui du catalogue. */
export function lineFromCatalogItem(item: CatalogItem, qty: number, vatRate: VatRate, aiSuggested = false): DocumentLine {
  return {
    id: createId("line"),
    catalog_item_id: item.id,
    section: defaultSectionFor(item),
    item_category: item.category,
    name: item.name,
    description: item.description,
    qty,
    unit: item.unit,
    buying_price_ht: item.buying_price_ht,
    unit_price_ht: item.selling_price_ht,
    vat_rate: vatRate,
    total_ht: lineTotal(qty, item.selling_price_ht),
    ai_suggested: aiSuggested || undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Conditions                                                          */
/* ------------------------------------------------------------------ */

const VAT_JUSTIFICATION: Record<VatRate, string> = {
  5.5: "travaux d'amélioration de la performance énergétique d'un logement de plus de 2 ans (attestation simplifiée)",
  10: "travaux de rénovation d'un logement de plus de 2 ans (attestation simplifiée)",
  20: "taux normal",
};

/** Conditions imprimées par défaut (acompte, TVA appliquée, validité). */
export function defaultQuoteConditions({
  depositPercent,
  vatRates,
  validityDays,
}: {
  depositPercent: number;
  vatRates: VatRate[];
  validityDays: number;
}): string {
  const payment =
    depositPercent > 0
      ? `Acompte de ${depositPercent} % à la signature, solde à réception de facture.`
      : "Paiement à réception de facture.";
  let vatText: string;
  if (vatRates.length === 1) {
    const [rate] = vatRates;
    vatText =
      rate === 5.5
        ? "TVA à 5,5 % : travaux d'amélioration de la performance énergétique d'un logement de plus de 2 ans (attestation simplifiée)."
        : rate === 10
          ? "TVA à 10 % : travaux de rénovation d'un logement de plus de 2 ans (attestation simplifiée)."
          : "TVA à 20 %.";
  } else if (vatRates.length > 1) {
    vatText = `TVA appliquée par ligne : ${vatRates.map((rate) => `${formatVatRate(rate)} (${VAT_JUSTIFICATION[rate]})`).join(", ")}.`;
  } else {
    vatText = "";
  }
  return [payment, vatText, `Devis valable ${validityDays} jours.`].filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

export interface LineSection {
  title: string;
  lines: DocumentLine[];
  total_ht: number;
}

/** Lignes regroupées par section, dans l'ordre métier (dépose → équipement → accessoires → MO…). */
export function groupLinesBySection(lines: DocumentLine[]): LineSection[] {
  const groups = new Map<string, DocumentLine[]>();
  for (const line of lines) {
    const list = groups.get(line.section);
    if (list) list.push(line);
    else groups.set(line.section, [line]);
  }
  const rank = (title: string) => {
    const index = SECTION_ORDER.indexOf(title);
    return index === -1 ? SECTION_ORDER.length : index;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([title, sectionLines]) => ({
      title,
      lines: sectionLines,
      total_ht: round2(sectionLines.reduce((sum, l) => sum + lineTotal(l.qty, l.unit_price_ht), 0)),
    }));
}

/* ------------------------------------------------------------------ */
/* Intervention préparée à la signature                                */
/* ------------------------------------------------------------------ */

export interface InterventionPlan {
  type: InterventionType;
  checklist: readonly string[];
  duration_minutes: number;
  parts: Omit<PartUsed, "id">[];
}

/**
 * Déduit l'intervention à planifier d'un devis signé : type, checklist, durée (heures de main-d'œuvre du devis)
 * et fournitures reprises du devis (source `devis`, prix figés du devis).
 */
export function interventionPlanFromQuote(quote: Pick<Quote, "items">, catalog: CatalogItem[]): InterventionPlan {
  const refs = new Set(
    quote.items.map((l) => catalog.find((c) => c.id === l.catalog_item_id)?.reference).filter((r): r is string => !!r),
  );
  const has = (...list: string[]) => list.some((r) => refs.has(r));
  const hasPrefix = (prefix: string) => [...refs].some((r) => r.startsWith(prefix));

  let type: InterventionType = "installation";
  let checklist: readonly string[] = CHECKLISTS.generic;
  if (has("PAC-ATL-8")) checklist = CHECKLISTS.installPac;
  else if (hasPrefix("CLIM-")) checklist = CHECKLISTS.installClim;
  else if (has("CET-THE-200")) checklist = CHECKLISTS.installCet;
  else if (has("CHAU-VIE-25")) checklist = CHECKLISTS.installChaudiere;
  else if (has("VMC-ALD-250")) checklist = CHECKLISTS.installVmc;
  else if (has("RID-FRI-15")) checklist = CHECKLISTS.installRideau;
  else if (has("DEP-DIAG", "DEP-URG")) {
    type = "depannage";
    checklist = has("MO-FRIG") ? CHECKLISTS.depannageClim : CHECKLISTS.plomberie;
  } else if (hasPrefix("MAINT-")) {
    type = "maintenance";
    checklist = has("MAINT-VMC") ? CHECKLISTS.maintenanceVmc : CHECKLISTS.maintenance;
  }

  const laborMinutes = quote.items
    .filter((l) => l.item_category === "main_oeuvre" && l.unit === "h")
    .reduce((sum, l) => sum + l.qty * 60, 0);

  return {
    type,
    checklist,
    duration_minutes: Math.max(60, Math.round(laborMinutes) || 120),
    parts: quote.items
      .filter((l) => l.item_category === "fourniture")
      .map((l) => ({
        catalog_item_id: l.catalog_item_id,
        name: l.name,
        qty: l.qty,
        unit: l.unit,
        unit_price_ht: l.unit_price_ht,
        buying_price_ht: l.buying_price_ht,
        vat_rate: l.vat_rate,
        source: "devis" as const,
      })),
  };
}
