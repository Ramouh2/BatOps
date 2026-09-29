/**
 * Règles de planification (pures) : horaires ouvrés, fin d'intervention en temps de travail,
 * conflits (chevauchement, compétence, horaires, week-end, passé), créneaux libres et charge.
 */
import type { CatalogItem, Equipment, Intervention, InterventionPriority, InterventionStatus, User } from "@/types/batops";
import { addDays, addMinutes, isSameDay, startOfDay, toDate } from "./dates";
import { formatTime } from "./format";

/** Journée de travail de référence (minutes depuis minuit). */
export const WORK_START = 8 * 60;
export const WORK_END = 18 * 60;
export const WORK_DAY_MINUTES = WORK_END - WORK_START;
/** Plage affichée dans les grilles du planning. */
export const GRID_START_HOUR = 7;
export const GRID_END_HOUR = 20;
/** Pas du magnétisme (glisser, redimensionner). */
export const SLOT_MINUTES = 15;
/** En deçà, une intervention qui dépasse 18 h se termine le soir même (heures sup.) au lieu d'être étalée. */
const SHORT_JOB_MINUTES = 4 * 60;

/** Statuts qu'on peut (re)planifier depuis le bureau. */
export const PLANNABLE_STATUSES: InterventionStatus[] = ["nouvelle", "planifiee"];
/** Statuts qui occupent réellement le technicien sur son créneau. */
export const BUSY_STATUSES: InterventionStatus[] = ["planifiee", "en_route", "sur_place", "en_cours", "terminee"];

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** `day` à `minutes` depuis minuit (heure locale). */
export function atMinutes(day: Date, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);
}

export function isWorkingDay(date: Date): boolean {
  const weekday = date.getDay();
  return weekday !== 0 && weekday !== 6;
}

export function nextWorkingDay(date: Date): Date {
  let day = addDays(startOfDay(date), 1);
  while (!isWorkingDay(day)) day = addDays(day, 1);
  return day;
}

/** Lundi de la semaine de `date`. */
export function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  const offset = (day.getDay() + 6) % 7;
  return addDays(day, -offset);
}

export function snapMinutes(minutes: number, step = SLOT_MINUTES): number {
  return Math.round(minutes / step) * step;
}

/**
 * Fin d'une intervention à partir de sa durée **de travail** : un chantier de 14 h commencé à 8 h
 * se poursuit le jour ouvré suivant ; une intervention courte ou en soirée se termine le jour même.
 */
export function computeEnd(start: Date, durationMinutes: number): Date {
  const startMin = minutesOfDay(start);
  const untilDayEnd = WORK_END - startMin;
  if (durationMinutes <= untilDayEnd || durationMinutes <= SHORT_JOB_MINUTES || startMin >= WORK_END) {
    return addMinutes(start, durationMinutes);
  }
  let remaining = durationMinutes - Math.max(untilDayEnd, 0);
  let day = nextWorkingDay(start);
  while (remaining > WORK_DAY_MINUTES) {
    remaining -= WORK_DAY_MINUTES;
    day = nextWorkingDay(day);
  }
  return atMinutes(day, WORK_START + remaining);
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && b.start < a.end;
}

export function scheduleOf(intervention: Pick<Intervention, "scheduled_start" | "scheduled_end">): TimeRange | null {
  if (!intervention.scheduled_start || !intervention.scheduled_end) return null;
  return { start: toDate(intervention.scheduled_start), end: toDate(intervention.scheduled_end) };
}

/**
 * Portion d'un créneau visible un jour donné, en minutes depuis minuit (`null` si rien ce jour-là).
 * Un chantier étalé occupe les heures de travail des jours ouvrés intermédiaires, jamais le week-end.
 */
export function segmentOnDay(
  range: TimeRange,
  day: Date,
): { startMin: number; endMin: number; continuesBefore: boolean; continuesAfter: boolean } | null {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  if (range.end <= dayStart || range.start >= dayEnd) return null;
  const continuesBefore = range.start < dayStart;
  const continuesAfter = range.end > dayEnd;
  if (continuesBefore && !isWorkingDay(day)) return null;
  const startMin = continuesBefore ? WORK_START : minutesOfDay(range.start);
  const endMin = continuesAfter ? Math.max(WORK_END, startMin + SLOT_MINUTES) : range.end.getTime() === dayEnd.getTime() ? 24 * 60 : minutesOfDay(range.end);
  return { startMin, endMin: Math.max(endMin, startMin + SLOT_MINUTES), continuesBefore, continuesAfter };
}

/* ------------------------------------------------------------------ */
/* Compétences                                                         */
/* ------------------------------------------------------------------ */

const REFRIGERANT_EQUIPMENT = new Set(["climatisation", "pac_air_eau", "pac_air_air"]);
const REFRIGERANT_REFS = /^(CLIM-|PAC-|ACC-LIAIS-|FOR-MES-R32|FOR-MES-PAC)/;

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Une intervention sur un circuit frigorifique (clim, PAC) exige un technicien titulaire de
 * l'attestation de capacité fluides frigorigènes.
 */
export function requiresRefrigerantSkill(
  intervention: Pick<Intervention, "title" | "description" | "parts_used" | "equipment_id">,
  catalog: Pick<CatalogItem, "id" | "reference">[],
  equipment: Pick<Equipment, "id" | "category">[],
): boolean {
  const eq = intervention.equipment_id ? equipment.find((e) => e.id === intervention.equipment_id) : undefined;
  if (eq && REFRIGERANT_EQUIPMENT.has(eq.category)) return true;
  const refs = intervention.parts_used.map((p) => catalog.find((c) => c.id === p.catalog_item_id)?.reference ?? "");
  if (refs.some((ref) => REFRIGERANT_REFS.test(ref))) return true;
  return /\b(clim|climatisation|climatiseur|pac|pompe a chaleur|split|multi-split|frigorifique|gainable)\b/.test(
    fold(`${intervention.title} ${intervention.description ?? ""}`),
  );
}

export function isRefrigerantQualified(user: Pick<User, "specialties">): boolean {
  return user.specialties.some((s) => /frigor|pac|split|clim/i.test(s));
}

/* ------------------------------------------------------------------ */
/* Conflits                                                            */
/* ------------------------------------------------------------------ */

export type ConflictKind = "overlap" | "skill" | "inactive" | "outside_hours" | "weekend" | "past";

export interface Conflict {
  kind: ConflictKind;
  severity: "error" | "warning";
  message: string;
  /** Intervention en chevauchement. */
  with_id?: string;
}

export interface Proposal {
  /** Intervention déplacée (exclue des chevauchements). */
  id?: string;
  technician_id: string;
  start: Date;
  end: Date;
  needsRefrigerant: boolean;
  priority?: InterventionPriority;
}

export interface ConflictContext {
  interventions: Pick<Intervention, "id" | "reference" | "assigned_technician_id" | "status" | "scheduled_start" | "scheduled_end">[];
  users: Pick<User, "id" | "full_name" | "is_active" | "specialties">[];
  /** Renseigné pendant une (re)planification : ajoute les contrôles passé / week-end / horaires. */
  now?: Date;
}

/**
 * Conflits d'un créneau. Les chevauchements et compétences sont permanents (compteur « conflits » du planning) ;
 * passé, week-end et hors horaires ne sont signalés qu'au moment de planifier.
 */
export function detectConflicts(proposal: Proposal, context: ConflictContext): Conflict[] {
  const conflicts: Conflict[] = [];
  const tech = context.users.find((u) => u.id === proposal.technician_id);
  const firstName = tech?.full_name.split(" ")[0] ?? "Le technicien";
  if (!tech || !tech.is_active) {
    conflicts.push({ kind: "inactive", severity: "error", message: "Technicien inactif ou introuvable." });
  }

  for (const other of context.interventions) {
    if (other.id === proposal.id || other.assigned_technician_id !== proposal.technician_id || !BUSY_STATUSES.includes(other.status)) continue;
    const range = scheduleOf(other);
    if (!range || !rangesOverlap(range, proposal)) continue;
    conflicts.push({
      kind: "overlap",
      severity: "error",
      message: `${firstName} est déjà sur ${other.reference} (${formatTime(range.start)} – ${formatTime(range.end)}).`,
      with_id: other.id,
    });
  }

  if (tech && proposal.needsRefrigerant && !isRefrigerantQualified(tech)) {
    conflicts.push({
      kind: "skill",
      severity: "warning",
      message: `${firstName} n'a pas l'attestation fluides frigorigènes requise pour la clim / PAC.`,
    });
  }

  if (context.now) {
    const startMin = minutesOfDay(proposal.start);
    const sameDay = isSameDay(proposal.start, proposal.end);
    if (proposal.start < context.now) {
      conflicts.push({ kind: "past", severity: "warning", message: "Créneau déjà passé." });
    }
    if (!isWorkingDay(proposal.start)) {
      conflicts.push({
        kind: "weekend",
        severity: "warning",
        message: proposal.priority === "urgente" ? "Week-end : astreinte (urgence)." : "Week-end : hors jours ouvrés.",
      });
    }
    if (startMin < WORK_START || startMin >= WORK_END || (sameDay && minutesOfDay(proposal.end) > WORK_END)) {
      conflicts.push({ kind: "outside_hours", severity: "warning", message: "Hors horaires habituels (8 h – 18 h)." });
    }
  }
  return conflicts;
}

export function hasBlockingConflict(conflicts: Conflict[]): boolean {
  return conflicts.some((c) => c.severity === "error");
}

/* ------------------------------------------------------------------ */
/* Disponibilités                                                      */
/* ------------------------------------------------------------------ */

type ScheduledLike = Pick<Intervention, "id" | "assigned_technician_id" | "status" | "scheduled_start" | "scheduled_end">;

export function busyRanges(technicianId: string, interventions: ScheduledLike[], excludeId?: string): TimeRange[] {
  return interventions
    .filter((i) => i.id !== excludeId && i.assigned_technician_id === technicianId && BUSY_STATUSES.includes(i.status))
    .map(scheduleOf)
    .filter((r): r is TimeRange => r !== null);
}

export function isFree(technicianId: string, range: TimeRange, interventions: ScheduledLike[], excludeId?: string): boolean {
  return !busyRanges(technicianId, interventions, excludeId).some((busy) => rangesOverlap(busy, range));
}

/** Premiers créneaux libres d'un technicien sur une journée (pas de 30 min, heures ouvrées). */
export function findFreeSlots(
  technicianId: string,
  day: Date,
  durationMinutes: number,
  interventions: ScheduledLike[],
  options: { excludeId?: string; now?: Date; limit?: number } = {},
): Date[] {
  const slots: Date[] = [];
  const limit = options.limit ?? 4;
  for (let minutes = WORK_START; minutes < WORK_END; minutes += 30) {
    const start = atMinutes(day, minutes);
    if (options.now && start < options.now) continue;
    const end = computeEnd(start, durationMinutes);
    if (isFree(technicianId, { start, end }, interventions, options.excludeId)) {
      slots.push(start);
      if (slots.length >= limit) break;
    }
  }
  return slots;
}

/** Prochain créneau libre à partir de `from` (jours ouvrés, sur 3 semaines). */
export function nextFreeSlot(
  technicianId: string,
  from: Date,
  durationMinutes: number,
  interventions: ScheduledLike[],
  options: { excludeId?: string } = {},
): Date | null {
  let day = startOfDay(from);
  for (let i = 0; i < 21; i += 1) {
    if (isWorkingDay(day)) {
      const [slot] = findFreeSlots(technicianId, day, durationMinutes, interventions, { excludeId: options.excludeId, now: from, limit: 1 });
      if (slot) return slot;
    }
    day = addDays(day, 1);
  }
  return null;
}

/** Minutes occupées sur la journée de travail (8 h – 18 h) d'un technicien. */
export function dayLoad(technicianId: string, day: Date, interventions: ScheduledLike[]): number {
  const window = { start: atMinutes(day, WORK_START), end: atMinutes(day, WORK_END) };
  return busyRanges(technicianId, interventions).reduce((total, range) => {
    const start = Math.max(range.start.getTime(), window.start.getTime());
    const end = Math.min(range.end.getTime(), window.end.getTime());
    return end > start ? total + (end - start) / 60_000 : total;
  }, 0);
}

/**
 * Technicien conseillé : qualifié et libre d'abord, puis libre, puis qualifié.
 */
export function suggestTechnician(
  technicians: Pick<User, "id" | "specialties" | "is_active">[],
  range: TimeRange,
  needsRefrigerant: boolean,
  interventions: ScheduledLike[],
  excludeId?: string,
): string | undefined {
  const active = technicians.filter((t) => t.is_active);
  const score = (t: (typeof active)[number]) =>
    (isFree(t.id, range, interventions, excludeId) ? 2 : 0) + (!needsRefrigerant || isRefrigerantQualified(t) ? 1 : 0);
  return [...active].sort((a, b) => score(b) - score(a))[0]?.id;
}
