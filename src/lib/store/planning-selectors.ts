/**
 * Sélecteurs du planning et du module Interventions (fonctions pures).
 */
import type { BatopsData, CallLog, Client, ClientActivity, Equipment, Intervention, InterventionStatus, Invoice, JobPhoto, MaintenanceContract, Quote, User } from "@/types/batops";
import { clientDisplayName } from "@/lib/domain/clients";
import { addDays, isSameDay, startOfDay, toDate } from "@/lib/domain/dates";
import { formatDayMonth } from "@/lib/domain/format";
import {
  detectConflicts,
  requiresRefrigerantSkill,
  scheduleOf,
  segmentOnDay,
  type Conflict,
  type TimeRange,
} from "@/lib/domain/planning";
import { normalize } from "@/providers/text";
import { newestFirst, selectTechnicians } from "./selectors";

export interface PlanningItem {
  intervention: Intervention;
  client?: Client;
  clientName: string;
  technician?: User;
  range: TimeRange | null;
  needsRefrigerant: boolean;
  /** Conflits permanents (chevauchement, compétence). */
  conflicts: Conflict[];
  source: { kind: "quote" | "call" | "contract" | "manual"; label: string };
}

const PRIORITY_RANK = { urgente: 0, haute: 1, normale: 2 } as const;

function sourceOf(intervention: Intervention, data: BatopsData): PlanningItem["source"] {
  const quote = intervention.quote_id ? data.quotes.find((q) => q.id === intervention.quote_id) : undefined;
  if (quote) return { kind: "quote", label: `Devis ${quote.reference} signé` };
  const contract = intervention.contract_id ? data.contracts.find((c) => c.id === intervention.contract_id) : undefined;
  if (contract) return { kind: "contract", label: `Contrat ${contract.reference}` };
  const call = intervention.call_log_id ? data.calls.find((c) => c.id === intervention.call_log_id) : undefined;
  if (call) return { kind: "call", label: `${call.handled_by === "nora" ? "Appel Nora" : "Appel"} du ${formatDayMonth(call.created_at)}` };
  return { kind: "manual", label: "Saisie bureau" };
}

/** Toutes les interventions non annulées, enrichies (client, technicien, créneau, conflits). */
export function selectPlanningItems(data: BatopsData): PlanningItem[] {
  const clients = new Map(data.clients.map((c) => [c.id, c]));
  const users = new Map(data.users.map((u) => [u.id, u]));
  return data.interventions
    .filter((i) => i.status !== "annulee")
    .map((intervention) => {
      const client = clients.get(intervention.client_id);
      const range = scheduleOf(intervention);
      const needsRefrigerant = requiresRefrigerantSkill(intervention, data.catalog, data.equipment);
      const conflicts =
        range && intervention.assigned_technician_id && intervention.status === "planifiee"
          ? detectConflicts(
              { id: intervention.id, technician_id: intervention.assigned_technician_id, start: range.start, end: range.end, needsRefrigerant, priority: intervention.priority },
              { interventions: data.interventions, users: data.users },
            )
          : [];
      return {
        intervention,
        client,
        clientName: client ? clientDisplayName(client) : "Client",
        technician: intervention.assigned_technician_id ? users.get(intervention.assigned_technician_id) : undefined,
        range,
        needsRefrigerant,
        conflicts,
        source: sourceOf(intervention, data),
      };
    });
}

/** Colonne « À planifier » : urgences d'abord, puis les plus anciennes. */
export function selectUnplanned(items: PlanningItem[]): PlanningItem[] {
  return items
    .filter((item) => item.intervention.status === "nouvelle")
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.intervention.priority] - PRIORITY_RANK[b.intervention.priority] ||
        a.intervention.created_at.localeCompare(b.intervention.created_at),
    );
}

/** Interventions visibles sur un jour (segment horaire calculé, chantiers étalés compris). */
export function itemsOnDay(items: PlanningItem[], day: Date, technicianId?: string) {
  return items
    .filter((item) => item.range && (!technicianId || item.intervention.assigned_technician_id === technicianId))
    .map((item) => ({ item, segment: segmentOnDay(item.range!, day) }))
    .filter((entry): entry is { item: PlanningItem; segment: NonNullable<ReturnType<typeof segmentOnDay>> } => entry.segment !== null)
    .sort((a, b) => a.segment.startMin - b.segment.startMin || a.item.intervention.reference.localeCompare(b.item.intervention.reference));
}

/**
 * Couloirs d'affichage : des interventions qui se chevauchent dans une même colonne
 * s'affichent côte à côte (chaque entrée reçoit son couloir et le nombre de couloirs du groupe).
 */
export function layoutLanes<T extends { segment: { startMin: number; endMin: number } }>(entries: T[]): (T & { lane: number; lanes: number })[] {
  const result: (T & { lane: number; lanes: number })[] = [];
  let group: (T & { lane: number; lanes: number })[] = [];
  let groupEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...group.map((g) => g.lane + 1));
    for (const g of group) g.lanes = lanes;
    result.push(...group);
    group = [];
  };
  for (const entry of entries) {
    if (group.length > 0 && entry.segment.startMin >= groupEnd) {
      flush();
      groupEnd = -1;
    }
    const used = new Set(group.filter((g) => g.segment.endMin > entry.segment.startMin).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane += 1;
    group.push({ ...entry, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, entry.segment.endMin);
  }
  if (group.length > 0) flush();
  return result;
}

export interface PlanningKpis {
  toSchedule: number;
  urgentToSchedule: number;
  today: number;
  week: number;
  conflicts: number;
}

export function selectPlanningKpis(items: PlanningItem[], now: Date, weekStart: Date): PlanningKpis {
  const weekEnd = addDays(weekStart, 7);
  const unplanned = items.filter((i) => i.intervention.status === "nouvelle");
  return {
    toSchedule: unplanned.length,
    urgentToSchedule: unplanned.filter((i) => i.intervention.priority === "urgente").length,
    today: items.filter((i) => i.range && segmentOnDay(i.range, now)).length,
    week: items.filter((i) => i.range && i.range.start < weekEnd && i.range.end > weekStart).length,
    conflicts: items.filter((i) => i.conflicts.length > 0).length,
  };
}

/* ------------------------------------------------------------------ */
/* Liste des interventions                                             */
/* ------------------------------------------------------------------ */

export type InterventionTab = "a_planifier" | "planifiees" | "en_cours" | "terminees" | "annulees" | "toutes";

const TAB_STATUSES: Record<Exclude<InterventionTab, "toutes">, InterventionStatus[]> = {
  a_planifier: ["nouvelle"],
  planifiees: ["planifiee"],
  en_cours: ["en_route", "sur_place", "en_cours"],
  terminees: ["terminee"],
  annulees: ["annulee"],
};

export interface InterventionFilters {
  tab: InterventionTab;
  query: string;
  type?: Intervention["type"];
  priority?: Intervention["priority"];
  technicianId?: string;
}

/** Toutes les interventions (annulées comprises) pour la liste. */
export function selectInterventionRows(data: BatopsData): PlanningItem[] {
  const active = selectPlanningItems(data);
  const cancelled = data.interventions
    .filter((i) => i.status === "annulee")
    .map((intervention) => {
      const client = data.clients.find((c) => c.id === intervention.client_id);
      return {
        intervention,
        client,
        clientName: client ? clientDisplayName(client) : "Client",
        technician: data.users.find((u) => u.id === intervention.assigned_technician_id),
        range: scheduleOf(intervention),
        needsRefrigerant: false,
        conflicts: [],
        source: sourceOf(intervention, data),
      } satisfies PlanningItem;
    });
  return [...active, ...cancelled].sort((a, b) => {
    const da = a.intervention.scheduled_start ?? a.intervention.created_at;
    const db = b.intervention.scheduled_start ?? b.intervention.created_at;
    return db.localeCompare(da);
  });
}

export function filterInterventionRows(rows: PlanningItem[], filters: InterventionFilters): PlanningItem[] {
  const q = normalize(filters.query.trim());
  const list = rows.filter((row) => {
    const i = row.intervention;
    if (filters.tab !== "toutes" && !TAB_STATUSES[filters.tab].includes(i.status)) return false;
    if (filters.type && i.type !== filters.type) return false;
    if (filters.priority && i.priority !== filters.priority) return false;
    if (filters.technicianId && i.assigned_technician_id !== filters.technicianId) return false;
    if (!q) return true;
    return normalize([i.reference, i.title, row.clientName, i.city, i.site_label, row.technician?.full_name].filter(Boolean).join(" ")).includes(q);
  });
  // « À planifier » : urgences d'abord ; « Planifiées » : chronologique.
  if (filters.tab === "a_planifier") return selectUnplanned(list);
  if (filters.tab === "planifiees") return [...list].sort((a, b) => (a.intervention.scheduled_start ?? "").localeCompare(b.intervention.scheduled_start ?? ""));
  return list;
}

export function countInterventionTabs(rows: PlanningItem[]): Record<InterventionTab, number> {
  const count = (statuses: InterventionStatus[]) => rows.filter((r) => statuses.includes(r.intervention.status)).length;
  return {
    a_planifier: count(TAB_STATUSES.a_planifier),
    planifiees: count(TAB_STATUSES.planifiees),
    en_cours: count(TAB_STATUSES.en_cours),
    terminees: count(TAB_STATUSES.terminees),
    annulees: count(TAB_STATUSES.annulees),
    toutes: rows.length,
  };
}

/* ------------------------------------------------------------------ */
/* Fiche intervention                                                  */
/* ------------------------------------------------------------------ */

export interface InterventionDetail {
  item: PlanningItem;
  client?: Client;
  quote?: Quote;
  call?: CallLog;
  contract?: MaintenanceContract;
  equipment?: Equipment;
  photos: JobPhoto[];
  invoices: Invoice[];
  activities: ClientActivity[];
  technicians: User[];
}

export function selectInterventionDetail(data: BatopsData, interventionId: string): InterventionDetail | null {
  const intervention = data.interventions.find((i) => i.id === interventionId);
  if (!intervention) return null;
  const item = selectInterventionRows(data).find((r) => r.intervention.id === interventionId)!;
  return {
    item,
    client: item.client,
    quote: intervention.quote_id ? data.quotes.find((q) => q.id === intervention.quote_id) : undefined,
    call: intervention.call_log_id ? data.calls.find((c) => c.id === intervention.call_log_id) : undefined,
    contract: intervention.contract_id ? data.contracts.find((c) => c.id === intervention.contract_id) : undefined,
    equipment: intervention.equipment_id ? data.equipment.find((e) => e.id === intervention.equipment_id) : undefined,
    photos: data.photos.filter((p) => p.intervention_id === interventionId),
    invoices: data.invoices.filter((inv) => inv.intervention_id === interventionId),
    activities: newestFirst(data.activities.filter((a) => a.entity?.kind === "intervention" && a.entity.id === interventionId)),
    technicians: selectTechnicians(data),
  };
}

/** Interventions à venir d'un technicien (hors aujourd'hui), pour l'app terrain. */
export function selectUpcomingForTechnician(data: Pick<BatopsData, "interventions">, technicianId: string, now: Date, days = 7): Intervention[] {
  const tomorrow = addDays(startOfDay(now), 1);
  const limit = addDays(tomorrow, days);
  return data.interventions
    .filter((i) => i.assigned_technician_id === technicianId && i.status === "planifiee" && i.scheduled_start)
    .filter((i) => {
      const start = toDate(i.scheduled_start!);
      return start >= tomorrow && start < limit && !isSameDay(start, now);
    })
    .sort((a, b) => a.scheduled_start!.localeCompare(b.scheduled_start!));
}

export type ScheduleNews = "nouveau" | "modifie";

/**
 * Pastilles de l'app terrain : intervention affectée (« Nouveau ») ou créneau changé (« Horaire modifié »)
 * par le bureau depuis moins de 24 h. Dérivé de l'historique, rien n'est stocké.
 */
export function selectScheduleNews(data: Pick<BatopsData, "activities" | "interventions">, technicianId: string, now: Date): Map<string, ScheduleNews> {
  const mine = new Set(data.interventions.filter((i) => i.assigned_technician_id === technicianId && i.status === "planifiee").map((i) => i.id));
  const since = now.getTime() - 24 * 3_600_000;
  const news = new Map<string, ScheduleNews>();
  for (const activity of newestFirst(data.activities)) {
    if (activity.type !== "intervention_scheduled" || activity.entity?.kind !== "intervention") continue;
    const id = activity.entity.id;
    if (!mine.has(id) || news.has(id) || toDate(activity.created_at).getTime() < since) continue;
    news.set(id, /(déplacée|replanifiée)$/.test(activity.title) ? "modifie" : "nouveau");
  }
  return news;
}
