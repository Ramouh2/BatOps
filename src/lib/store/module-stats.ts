/**
 * Indicateurs « déjà disponibles » affichés sur les modules pas encore livrés :
 * ils sont calculés depuis le store central (aucune donnée statique).
 */
import type { BatopsData, UserRole } from "@/types/batops";
import type { ModuleKey } from "@/lib/navigation";
import type { Tone } from "@/lib/domain/labels";
import { can } from "@/lib/permissions";
import { addDays, isSameMonth, toDate } from "@/lib/domain/dates";
import { formatEURCompact, formatPercent } from "@/lib/domain/format";
import { catalogMargin, round2 } from "@/lib/domain/money";
import {
  getContractDisplayStatus,
  getInvoiceDisplayStatus,
  isQuoteAwaitingResponse,
  isReadyToInvoice,
  OPEN_STATUSES,
} from "@/lib/domain/status";
import {
  selectInterventionsOfDay,
  selectNavCounters,
  selectOverdueTotal,
  selectPendingQuotesTotal,
  selectTechnicians,
} from "./selectors";

export interface ModuleStat {
  label: string;
  value: string;
  tone?: Tone;
}

type StatBuilder = (data: BatopsData, now: Date, role: UserRole) => ModuleStat[];

const plural = (n: number, singular: string, pluralForm = `${singular}s`) => `${n} ${n > 1 ? pluralForm : singular}`;

function cashInThisMonth(data: BatopsData, now: Date): number {
  return round2(
    data.invoices.flatMap((i) => i.payments).filter((p) => isSameMonth(toDate(p.paid_at), now)).reduce((s, p) => s + p.amount, 0),
  );
}

const BUILDERS: Record<ModuleKey, StatBuilder> = {
  dashboard: (data, now, role) => {
    const counters = selectNavCounters(data, now);
    const today = selectInterventionsOfDay(data, now);
    const stats: ModuleStat[] = [
      { label: "Interventions aujourd'hui", value: String(today.length) },
      { label: "Appels à traiter", value: String(counters.calls), tone: counters.calls > 0 ? "ai" : undefined },
    ];
    if (can(role, "view_financials")) {
      stats.push(
        { label: "CA encaissé ce mois", value: formatEURCompact(cashInThisMonth(data, now)), tone: "success" },
        { label: "Devis en attente", value: formatEURCompact(selectPendingQuotesTotal(data, now)) },
      );
    }
    return stats;
  },
  calls: (data) => [
    { label: "Appels journalisés", value: String(data.calls.length) },
    { label: "Qualifiés par Nora", value: String(data.calls.filter((c) => c.status === "qualifie_ia").length), tone: "ai" },
    { label: "À rappeler", value: String(data.calls.filter((c) => c.status === "a_rappeler").length), tone: "warning" },
    { label: "Convertis", value: String(data.calls.filter((c) => c.status === "converti").length), tone: "success" },
  ],
  clients: (data, now) => {
    const underContract = new Set(
      data.contracts.filter((c) => getContractDisplayStatus(c, data.interventions, now) !== "expire").map((c) => c.client_id),
    );
    return [
      { label: "Clients", value: String(data.clients.filter((c) => c.status === "client").length) },
      { label: "Prospects à traiter", value: String(data.clients.filter((c) => c.status === "prospect").length), tone: "info" },
      { label: "Équipements suivis", value: String(data.equipment.length) },
      { label: "Clients sous contrat", value: String(underContract.size) },
    ];
  },
  quotes: (data, now, role) => {
    const pending = data.quotes.filter((q) => isQuoteAwaitingResponse(q, now));
    const stats: ModuleStat[] = [
      { label: "Devis", value: String(data.quotes.length) },
      { label: "En attente de signature", value: String(pending.length), tone: "info" },
      { label: "Signés", value: String(data.quotes.filter((q) => q.status === "accepte").length), tone: "success" },
    ];
    if (can(role, "view_financials")) {
      stats.push({ label: "Montant en attente", value: formatEURCompact(selectPendingQuotesTotal(data, now)) });
    }
    return stats;
  },
  invoices: (data, now) => {
    const overdue = data.invoices.filter((i) => getInvoiceDisplayStatus(i, now) === "en_retard");
    return [
      { label: "Encaissé ce mois", value: formatEURCompact(cashInThisMonth(data, now)), tone: "success" },
      { label: "Factures en retard", value: plural(overdue.length, "facture"), tone: overdue.length ? "danger" : undefined },
      { label: "Montant en retard", value: formatEURCompact(selectOverdueTotal(data, now)), tone: overdue.length ? "danger" : undefined },
      { label: "Documents émis", value: String(data.invoices.length) },
    ];
  },
  planning: (data, now) => [
    { label: "Aujourd'hui", value: plural(selectInterventionsOfDay(data, now).length, "intervention") },
    { label: "Demain", value: plural(selectInterventionsOfDay(data, addDays(now, 1)).length, "intervention") },
    { label: "À planifier", value: String(data.interventions.filter((i) => i.status === "nouvelle").length), tone: "warning" },
    { label: "Techniciens", value: String(selectTechnicians(data).length) },
  ],
  interventions: (data) => [
    { label: "En cours ou planifiées", value: String(data.interventions.filter((i) => OPEN_STATUSES.includes(i.status)).length), tone: "info" },
    { label: "Terminées", value: String(data.interventions.filter((i) => i.status === "terminee").length), tone: "success" },
    { label: "Prêtes à facturer", value: String(data.interventions.filter((i) => isReadyToInvoice(i, data.invoices)).length), tone: "warning" },
  ],
  photos: (data) => [
    { label: "Photos", value: String(data.photos.length) },
    { label: "Interventions documentées", value: String(new Set(data.photos.map((p) => p.intervention_id)).size) },
    { label: "Avant / Après", value: `${data.photos.filter((p) => p.category === "avant").length} / ${data.photos.filter((p) => p.category === "apres").length}` },
  ],
  sav: (data, now) => {
    const statuses = data.contracts.map((c) => getContractDisplayStatus(c, data.interventions, now));
    return [
      { label: "Contrats actifs", value: String(statuses.filter((s) => s !== "expire").length) },
      { label: "Visites à planifier (< 30 j)", value: String(statuses.filter((s) => s === "a_planifier").length), tone: "warning" },
      { label: "Visites planifiées", value: String(statuses.filter((s) => s === "visite_planifiee").length), tone: "info" },
    ];
  },
  catalog: (data, _now, role) => {
    const active = data.catalog.filter((c) => c.is_active);
    const stats: ModuleStat[] = [
      { label: "Articles", value: String(active.length) },
      { label: "Main-d'œuvre & forfaits", value: String(active.filter((c) => c.category === "main_oeuvre" || c.category === "forfait" || c.category === "deplacement").length) },
      { label: "Fournitures", value: String(active.filter((c) => c.category === "fourniture").length) },
    ];
    if (can(role, "view_margins")) {
      const margins = active.map((c) => catalogMargin(c).margin_percent);
      const average = margins.length ? margins.reduce((s, m) => s + m, 0) / margins.length : 0;
      stats.push({ label: "Marge moyenne", value: formatPercent(average), tone: "success" });
    }
    return stats;
  },
  settings: (data) => [
    { label: "Utilisateurs", value: String(data.users.filter((u) => u.is_active).length) },
    { label: "Plan", value: data.organization.subscription_plan === "equipe" ? "Équipe" : data.organization.subscription_plan },
  ],
  tech: (data, now) => [
    { label: "Interventions du jour", value: String(selectInterventionsOfDay(data, now).length) },
  ],
};

export function selectModuleStats(module: ModuleKey, data: BatopsData, now: Date, role: UserRole): ModuleStat[] {
  return BUILDERS[module](data, now, role);
}
