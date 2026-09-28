/**
 * Sélecteurs du tableau de bord « lundi matin » (cadrage module 1). Fonctions pures du store.
 */
import type { BatopsData, CallLog, Client, ClientActivity, Intervention, Quote, Urgency } from "@/types/batops";
import { addDays, isSameMonth, startOfMonth, toDate } from "@/lib/domain/dates";
import { round2 } from "@/lib/domain/money";
import {
  daysSinceLastQuoteContact,
  getInvoiceDisplayStatus,
  invoiceBalance,
  isQuoteAwaitingResponse,
  isReadyToInvoice,
  quoteNeedsReminder,
} from "@/lib/domain/status";
import { selectInterventionsOfDay } from "./selectors";

export interface DashboardKpis {
  cashThisMonth: number;
  cashPreviousMonth: number;
  /** Variation vs mois précédent (null si pas de référence). */
  cashTrendPercent: number | null;
  pendingQuotesCount: number;
  pendingQuotesTotal: number;
  quotesToRemindCount: number;
  todayTotal: number;
  todayDone: number;
  todayOnSite: number;
  overdueCount: number;
  overdueTotal: number;
}

function paymentsInMonth(data: BatopsData, month: Date) {
  return data.invoices.flatMap((i) => i.payments).filter((p) => isSameMonth(toDate(p.paid_at), month));
}

export function selectDashboardKpis(data: BatopsData, now: Date): DashboardKpis {
  const previousMonth = addDays(startOfMonth(now), -1);
  const cashThisMonth = round2(paymentsInMonth(data, now).reduce((s, p) => s + p.amount, 0));
  const cashPreviousMonth = round2(paymentsInMonth(data, previousMonth).reduce((s, p) => s + p.amount, 0));
  const pending = data.quotes.filter((q) => isQuoteAwaitingResponse(q, now));
  const today = selectInterventionsOfDay(data, now);
  const overdue = data.invoices.filter((i) => getInvoiceDisplayStatus(i, now) === "en_retard");

  return {
    cashThisMonth,
    cashPreviousMonth,
    cashTrendPercent: cashPreviousMonth > 0 ? round2(((cashThisMonth - cashPreviousMonth) / cashPreviousMonth) * 100) : null,
    pendingQuotesCount: pending.length,
    pendingQuotesTotal: round2(pending.reduce((s, q) => s + q.total_ttc, 0)),
    quotesToRemindCount: pending.filter((q) => quoteNeedsReminder(q, now)).length,
    todayTotal: today.length,
    todayDone: today.filter((i) => i.status === "terminee").length,
    todayOnSite: today.filter((i) => i.status === "sur_place" || i.status === "en_cours").length,
    overdueCount: overdue.length,
    overdueTotal: round2(overdue.reduce((s, i) => s + invoiceBalance(i), 0)),
  };
}

export interface CashPoint {
  day: number;
  cumulative: number;
}

export interface CashSeries {
  daysInMonth: number;
  today: number;
  current: CashPoint[];
  previous: CashPoint[];
  currentLabel: string;
  previousLabel: string;
}

const monthName = new Intl.DateTimeFormat("fr-FR", { month: "long" });

function cumulativeByDay(data: BatopsData, month: Date, lastDay: number): CashPoint[] {
  const byDay = new Map<number, number>();
  for (const p of paymentsInMonth(data, month)) {
    const day = toDate(p.paid_at).getDate();
    byDay.set(day, (byDay.get(day) ?? 0) + p.amount);
  }
  const points: CashPoint[] = [{ day: 0, cumulative: 0 }];
  let total = 0;
  for (let day = 1; day <= lastDay; day += 1) {
    total += byDay.get(day) ?? 0;
    points.push({ day, cumulative: round2(total) });
  }
  return points;
}

/** Encaissements cumulés jour par jour : mois en cours (jusqu'à aujourd'hui) vs mois précédent complet. */
export function selectCashSeries(data: BatopsData, now: Date): CashSeries {
  const previousMonth = addDays(startOfMonth(now), -1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return {
    daysInMonth: Math.max(daysInMonth, previousMonth.getDate()),
    today: now.getDate(),
    current: cumulativeByDay(data, now, now.getDate()),
    previous: cumulativeByDay(data, previousMonth, previousMonth.getDate()),
    currentLabel: monthName.format(now),
    previousLabel: monthName.format(previousMonth),
  };
}

/* ------------------------------------------------------------------ */
/* Actions urgentes                                                    */
/* ------------------------------------------------------------------ */

export interface InboundRequest {
  kind: "call" | "prospect";
  id: string;
  client_id?: string;
  name: string;
  summary: string;
  urgency: Urgency;
  status: CallLog["status"] | "nouveau";
  created_at: string;
}

const URGENCY_RANK: Record<Urgency, number> = { urgente: 0, haute: 1, normale: 2, basse: 3 };

/** Demandes entrantes à traiter : appels non convertis + prospects sans aucune suite (ni appel, ni devis, ni intervention). */
export function selectInboundRequests(data: BatopsData): InboundRequest[] {
  const openCalls: InboundRequest[] = data.calls
    .filter((c) => c.status !== "converti")
    .map((c) => ({
      kind: "call",
      id: c.id,
      client_id: c.client_id,
      name: c.caller_name,
      summary: c.summary,
      urgency: c.urgency,
      status: c.status,
      created_at: c.created_at,
    }));
  const followedUp = new Set([
    ...data.calls.map((c) => c.client_id),
    ...data.quotes.map((q) => q.client_id),
    ...data.interventions.map((i) => i.client_id),
  ]);
  const newProspects: InboundRequest[] = data.clients
    .filter((c) => c.status === "prospect" && !followedUp.has(c.id))
    .map((c: Client) => ({
      kind: "prospect",
      id: c.id,
      client_id: c.id,
      name: c.company_name ?? [c.civility, c.first_name, c.last_name].filter(Boolean).join(" "),
      summary: c.notes ?? "Nouveau prospect à qualifier.",
      urgency: "normale",
      status: "nouveau",
      created_at: c.created_at,
    }));
  return [...openCalls, ...newProspects].sort(
    (a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || b.created_at.localeCompare(a.created_at),
  );
}

/** Devis sans réponse depuis plus de 3 jours, le plus ancien contact d'abord. */
export function selectQuotesToRemind(data: BatopsData, now: Date): Quote[] {
  return data.quotes
    .filter((q) => quoteNeedsReminder(q, now))
    .sort((a, b) => (daysSinceLastQuoteContact(b, now) ?? 0) - (daysSinceLastQuoteContact(a, now) ?? 0));
}

export function selectReadyToInvoice(data: BatopsData): Intervention[] {
  return data.interventions
    .filter((i) => isReadyToInvoice(i, data.invoices))
    .sort((a, b) => (b.actual_end ?? "").localeCompare(a.actual_end ?? ""));
}

export function selectRecentActivities(data: BatopsData, limit = 8): ClientActivity[] {
  return [...data.activities].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}
