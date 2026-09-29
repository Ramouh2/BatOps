/**
 * Sélecteurs dérivés — fonctions pures de l'état (testables, sans React).
 * Les composants les appellent via `useMemo` sur une tranche stable du store.
 */
import type { BatopsData, User } from "@/types/batops";
import { isSameDay, toDate } from "@/lib/domain/dates";
import {
  getContractDisplayStatus,
  getInvoiceDisplayStatus,
  invoiceBalance,
  isInterventionToSchedule,
  isQuoteAwaitingResponse,
  isReadyToInvoice,
} from "@/lib/domain/status";
import { round2 } from "@/lib/domain/money";
import { scheduleOf, segmentOnDay } from "@/lib/domain/planning";

/**
 * Événements du plus récent au plus ancien. À instant égal (plusieurs événements journalisés dans la même
 * milliseconde, ex. signature → conversion → intervention), le dernier journalisé passe devant.
 */
export function newestFirst<T extends { created_at: string }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.created_at.localeCompare(a.item.created_at) || b.index - a.index)
    .map((entry) => entry.item);
}

export function selectUser(data: BatopsData, userId: string | null): User | null {
  return data.users.find((u) => u.id === userId) ?? null;
}

export function selectTechnicians(data: BatopsData): User[] {
  return data.users.filter((u) => u.role === "technician" && u.is_active);
}

export type NavCounterKey =
  | "calls"
  | "prospects"
  | "quotes"
  | "invoices"
  | "planning"
  | "interventions"
  | "sav";

export type NavCounters = Record<NavCounterKey, number>;

/** Compteurs de la barre latérale : uniquement ce qui demande une action. */
export function selectNavCounters(data: BatopsData, now: Date): NavCounters {
  return {
    calls: data.calls.filter((c) => c.status !== "converti").length,
    prospects: data.clients.filter((c) => c.status === "prospect").length,
    quotes: data.quotes.filter((q) => isQuoteAwaitingResponse(q, now)).length,
    invoices: data.invoices.filter((i) => getInvoiceDisplayStatus(i, now) === "en_retard").length,
    planning: data.interventions.filter(isInterventionToSchedule).length,
    interventions: data.interventions.filter((i) => isReadyToInvoice(i, data.invoices)).length,
    sav: data.contracts.filter((c) => {
      const status = getContractDisplayStatus(c, data.interventions, now);
      return status === "a_planifier" || status === "visite_en_retard";
    }).length,
  };
}

/** Interventions du jour, triées chronologiquement (optionnellement pour un technicien). */
/** Interventions présentes un jour donné (y compris le jour 2, 3… d'un chantier étalé sur plusieurs jours ouvrés). */
export function selectInterventionsOfDay(data: Pick<BatopsData, "interventions">, day: Date, technicianId?: string) {
  return data.interventions
    .filter((i) => {
      if (!i.scheduled_start || i.status === "annulee") return false;
      const range = scheduleOf(i);
      return range ? segmentOnDay(range, day) !== null : isSameDay(toDate(i.scheduled_start), day);
    })
    .filter((i) => !technicianId || i.assigned_technician_id === technicianId)
    .sort((a, b) => (a.scheduled_start ?? "").localeCompare(b.scheduled_start ?? ""));
}

export function selectPendingQuotesTotal(data: BatopsData, now: Date): number {
  return round2(data.quotes.filter((q) => isQuoteAwaitingResponse(q, now)).reduce((s, q) => s + q.total_ttc, 0));
}

export function selectOverdueTotal(data: BatopsData, now: Date): number {
  return round2(
    data.invoices
      .filter((i) => getInvoiceDisplayStatus(i, now) === "en_retard")
      .reduce((s, i) => s + invoiceBalance(i), 0),
  );
}
