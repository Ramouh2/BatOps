import type {
  Intervention,
  InterventionStatus,
  Invoice,
  InvoiceStatus,
  MaintenanceContract,
  Quote,
  QuoteStatus,
} from "@/types/batops";
import { diffInCalendarDays, toDate } from "./dates";
import { round2 } from "./money";

/** Délai (jours) au-delà duquel un devis envoyé sans réponse est « à relancer ». */
export const QUOTE_REMINDER_AFTER_DAYS = 3;
/** Fenêtre d'alerte avant l'échéance d'une visite d'entretien (M+11). */
export const CONTRACT_ALERT_DAYS = 30;

/* ------------------------------ Devis ------------------------------ */

/** Un devis envoyé dont la validité est dépassée s'affiche « expiré ». */
export function getQuoteDisplayStatus(quote: Quote, now: Date): QuoteStatus {
  if (quote.status === "envoye" && diffInCalendarDays(now, toDate(quote.valid_until)) < 0) return "expire";
  return quote.status;
}

export function isQuoteAwaitingResponse(quote: Quote, now: Date): boolean {
  return getQuoteDisplayStatus(quote, now) === "envoye";
}

/** Jours écoulés depuis le dernier contact (envoi ou relance). */
export function daysSinceLastQuoteContact(quote: Quote, now: Date): number | undefined {
  const last = quote.last_reminder_at ?? quote.sent_at;
  return last ? diffInCalendarDays(toDate(last), now) : undefined;
}

export function quoteNeedsReminder(quote: Quote, now: Date): boolean {
  if (!isQuoteAwaitingResponse(quote, now)) return false;
  const days = daysSinceLastQuoteContact(quote, now);
  return days !== undefined && days >= QUOTE_REMINDER_AFTER_DAYS;
}

/* ----------------------------- Factures ---------------------------- */

export type InvoiceDisplayStatus = InvoiceStatus | "en_retard" | "partiellement_payee";

/** Reste à encaisser sur une facture (0 pour un avoir). */
export function invoiceBalance(invoice: Invoice): number {
  if (invoice.invoice_type === "avoir" || invoice.status === "annulee") return 0;
  return Math.max(0, round2(invoice.amount_due_ttc - invoice.amount_paid));
}

/** `en_retard` dès que l'échéance est dépassée et qu'il reste un solde. */
export function getInvoiceDisplayStatus(invoice: Invoice, now: Date): InvoiceDisplayStatus {
  if (invoice.status !== "emise" || invoice.invoice_type === "avoir") return invoice.status;
  if (invoiceBalance(invoice) > 0 && diffInCalendarDays(toDate(invoice.due_date), now) > 0) return "en_retard";
  if (invoice.amount_paid > 0) return "partiellement_payee";
  return "emise";
}

export function daysOverdue(invoice: Invoice, now: Date): number {
  return Math.max(0, diffInCalendarDays(toDate(invoice.due_date), now));
}

/* --------------------------- Interventions ------------------------- */

export const SCHEDULED_STATUSES: InterventionStatus[] = ["planifiee", "en_route", "sur_place", "en_cours"];
export const OPEN_STATUSES: InterventionStatus[] = ["nouvelle", ...SCHEDULED_STATUSES];

export function isInterventionToSchedule(intervention: Intervention): boolean {
  return intervention.status === "nouvelle";
}

/** Intervention terminée, facturable et sans facture finale active → « Prête à facturer ». */
export function isReadyToInvoice(intervention: Intervention, invoices: Invoice[]): boolean {
  if (intervention.status !== "terminee" || !intervention.is_billable) return false;
  return !invoices.some(
    (inv) => inv.intervention_id === intervention.id && inv.invoice_type === "facture" && inv.status !== "annulee",
  );
}

/* ---------------------------- Contrats ----------------------------- */

export type ContractDisplayStatus = "actif" | "a_planifier" | "visite_planifiee" | "visite_en_retard" | "expire";

export function getContractDisplayStatus(
  contract: MaintenanceContract,
  interventions: Intervention[],
  now: Date,
): ContractDisplayStatus {
  if (contract.status === "expire") return "expire";
  const visitScheduled = interventions.some(
    (i) => i.contract_id === contract.id && SCHEDULED_STATUSES.includes(i.status),
  );
  if (visitScheduled) return "visite_planifiee";
  const days = diffInCalendarDays(now, toDate(contract.next_visit_date));
  if (days < 0) return "visite_en_retard";
  if (days <= CONTRACT_ALERT_DAYS) return "a_planifier";
  return "actif";
}
