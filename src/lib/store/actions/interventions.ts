/**
 * Mutations « Interventions & planning » : création, planification (affectation, date, durée),
 * déplacement, réaffectation, retrait du planning, modification et annulation.
 * Chaque changement est journalisé dans la timeline du client.
 */
import type { BatopsData, Intervention, ISODateTime } from "@/types/batops";
import { checklistFor } from "@/lib/domain/checklists";
import { formatDateTime, formatDuration } from "@/lib/domain/format";
import { createId } from "@/lib/domain/ids";
import { INTERVENTION_TYPE_LABEL, PRIORITY } from "@/lib/domain/labels";
import { computeEnd, PLANNABLE_STATUSES, requiresRefrigerantSkill, scheduleOf } from "@/lib/domain/planning";
import {
  MAX_INTERVENTION_MINUTES,
  normalizeInterventionInput,
  type FieldErrors,
  type InterventionInput,
} from "@/lib/domain/validation";
import { logActivity, takeReference } from "../mutations";
import type { MutationContext } from "./context";

/* ------------------------------------------------------------------ */
/* Planification                                                       */
/* ------------------------------------------------------------------ */

export interface ScheduleInput {
  intervention_id: string;
  technician_id: string;
  start: ISODateTime;
  /** Nouvelle durée de travail (redimensionnement) ; sinon celle de l'intervention. */
  duration_minutes?: number;
}

export type ScheduleChange = "planned" | "moved" | "reassigned" | "rescheduled" | "resized" | "unchanged";

export type ScheduleField = "intervention" | "technician_id" | "start" | "duration_minutes";

export function validateSchedule(data: Pick<BatopsData, "interventions" | "users">, input: ScheduleInput): FieldErrors<ScheduleField> {
  const errors: FieldErrors<ScheduleField> = {};
  const intervention = data.interventions.find((i) => i.id === input.intervention_id);
  if (!intervention) errors.intervention = "Intervention introuvable.";
  else if (!PLANNABLE_STATUSES.includes(intervention.status)) errors.intervention = "Cette intervention a déjà commencé ou est close : elle ne se déplace plus.";
  const tech = data.users.find((u) => u.id === input.technician_id);
  if (!tech || tech.role !== "technician" || !tech.is_active) errors.technician_id = "Choisissez un technicien actif.";
  const start = new Date(input.start);
  if (Number.isNaN(start.getTime())) errors.start = "Date ou heure invalide.";
  const duration = input.duration_minutes ?? intervention?.duration_minutes ?? 0;
  if (!Number.isFinite(duration) || duration < 15 || duration > MAX_INTERVENTION_MINUTES) {
    errors.duration_minutes = "Durée entre 15 min et 10 jours de travail.";
  }
  return errors;
}

export function scheduleIntervention(draft: BatopsData, input: ScheduleInput, ctx: MutationContext): ScheduleChange {
  const intervention = draft.interventions.find((i) => i.id === input.intervention_id);
  const tech = draft.users.find((u) => u.id === input.technician_id);
  if (!intervention || !tech || !PLANNABLE_STATUSES.includes(intervention.status)) return "unchanged";

  const start = new Date(input.start);
  const duration = Math.round(input.duration_minutes ?? intervention.duration_minutes);
  const end = computeEnd(start, duration);
  const before = scheduleOf(intervention);
  const previousTech = draft.users.find((u) => u.id === intervention.assigned_technician_id);
  const wasPlanned = intervention.status === "planifiee" && before !== null;
  const previousDuration = intervention.duration_minutes;

  const moved = !before || before.start.getTime() !== start.getTime();
  const reassigned = intervention.assigned_technician_id !== tech.id;
  const resized = duration !== intervention.duration_minutes;
  const change: ScheduleChange = !wasPlanned
    ? "planned"
    : moved && reassigned
      ? "rescheduled"
      : moved
        ? "moved"
        : reassigned
          ? "reassigned"
          : resized
            ? "resized"
            : "unchanged";
  if (change === "unchanged") return change;

  intervention.assigned_technician_id = tech.id;
  intervention.scheduled_start = start.toISOString();
  intervention.scheduled_end = end.toISOString();
  intervention.duration_minutes = duration;
  if (intervention.status === "nouvelle") intervention.status = "planifiee";

  const when = `${formatDateTime(start)} avec ${tech.full_name}`;
  const entry = {
    planned: { title: `Intervention ${intervention.reference} planifiée`, description: when },
    moved: { title: `Intervention ${intervention.reference} déplacée`, description: `${before ? formatDateTime(before.start) : "—"} → ${formatDateTime(start)} (${tech.full_name})` },
    reassigned: { title: `Intervention ${intervention.reference} réaffectée`, description: `${previousTech?.full_name ?? "—"} → ${tech.full_name}, ${formatDateTime(start)}` },
    rescheduled: { title: `Intervention ${intervention.reference} replanifiée`, description: when },
    resized: { title: `Durée de l'intervention ${intervention.reference} ajustée`, description: `${formatDuration(previousDuration)} → ${formatDuration(duration)} de travail` },
  }[change];
  logActivity(
    draft,
    {
      client_id: intervention.client_id,
      type: change === "resized" ? "intervention_updated" : "intervention_scheduled",
      title: entry.title,
      description: entry.description,
      actor_name: ctx.actor,
      entity: { kind: "intervention", id: intervention.id },
    },
    ctx.now,
  );
  return change;
}

/** Remet une intervention planifiée dans la colonne « À planifier ». */
export function unscheduleIntervention(draft: BatopsData, interventionId: string, ctx: MutationContext): boolean {
  const intervention = draft.interventions.find((i) => i.id === interventionId);
  if (!intervention || intervention.status !== "planifiee") return false;
  intervention.status = "nouvelle";
  intervention.assigned_technician_id = undefined;
  intervention.scheduled_start = undefined;
  intervention.scheduled_end = undefined;
  logActivity(
    draft,
    {
      client_id: intervention.client_id,
      type: "intervention_status",
      title: `Intervention ${intervention.reference} retirée du planning`,
      description: "Remise dans « À planifier ».",
      actor_name: ctx.actor,
      entity: { kind: "intervention", id: intervention.id },
    },
    ctx.now,
  );
  return true;
}

/* ------------------------------------------------------------------ */
/* Fiche intervention                                                  */
/* ------------------------------------------------------------------ */

/** Nouvelle intervention saisie au bureau (dépannage, entretien, SAV…), « À planifier ». */
export function createIntervention(draft: BatopsData, input: InterventionInput, ctx: MutationContext): string {
  const clean = normalizeInterventionInput(input);
  const id = createId("int");
  const base = { title: clean.title, description: clean.description, parts_used: [], equipment_id: clean.equipment_id };
  const needsRefrigerant = requiresRefrigerantSkill(base, draft.catalog, draft.equipment);
  const intervention: Intervention = {
    id,
    organization_id: draft.organization.id,
    client_id: clean.client_id,
    call_log_id: clean.call_log_id,
    equipment_id: clean.equipment_id,
    reference: takeReference(draft, "intervention", ctx.now),
    title: clean.title,
    type: clean.type,
    priority: clean.priority,
    status: "nouvelle",
    address: clean.address,
    postal_code: clean.postal_code,
    city: clean.city,
    site_label: clean.site_label,
    duration_minutes: clean.duration_minutes,
    is_billable: clean.is_billable,
    description: clean.description,
    checklist: checklistFor(clean.type, needsRefrigerant, `${clean.title} ${clean.description ?? ""}`).map((label, index) => ({
      id: `${id}_c${index + 1}`,
      label,
      checked: false,
    })),
    parts_used: [],
    created_at: ctx.now.toISOString(),
  };
  draft.interventions.push(intervention);
  const call = clean.call_log_id ? draft.calls.find((c) => c.id === clean.call_log_id && c.client_id === clean.client_id) : undefined;
  if (call) {
    call.intervention_id = id;
    call.status = "converti";
  }
  logActivity(
    draft,
    {
      client_id: intervention.client_id,
      type: "intervention_created",
      title: `Intervention ${intervention.reference} créée`,
      description: `${INTERVENTION_TYPE_LABEL[intervention.type]} — ${intervention.title}${intervention.priority !== "normale" ? ` · priorité ${PRIORITY[intervention.priority].label.toLowerCase()}` : ""}`,
      actor_name: ctx.actor,
      entity: { kind: "intervention", id },
    },
    ctx.now,
  );
  return id;
}

const FIELD_LABELS: Partial<Record<keyof InterventionInput, string>> = {
  title: "titre",
  type: "type",
  priority: "priorité",
  description: "consignes",
  duration_minutes: "durée",
  address: "adresse",
  postal_code: "code postal",
  city: "ville",
  site_label: "site",
  equipment_id: "équipement",
  is_billable: "facturation",
};

/** Modifie la fiche (hors client). Retourne les libellés des champs modifiés. */
export function updateIntervention(draft: BatopsData, interventionId: string, input: InterventionInput, ctx: MutationContext): string[] {
  const intervention = draft.interventions.find((i) => i.id === interventionId);
  if (!intervention || intervention.status === "terminee" || intervention.status === "annulee") return [];
  const clean = normalizeInterventionInput({ ...input, client_id: intervention.client_id });
  const changed: string[] = [];
  for (const key of Object.keys(FIELD_LABELS) as (keyof InterventionInput)[]) {
    const current = (intervention as unknown as Record<string, unknown>)[key];
    if ((current ?? undefined) !== (clean[key] ?? undefined)) {
      changed.push(FIELD_LABELS[key]!);
      (intervention as unknown as Record<string, unknown>)[key] = clean[key];
    }
  }
  if (changed.length === 0) return changed;
  if (changed.includes("durée") && intervention.scheduled_start) {
    intervention.scheduled_end = computeEnd(new Date(intervention.scheduled_start), intervention.duration_minutes).toISOString();
  }
  logActivity(
    draft,
    {
      client_id: intervention.client_id,
      type: "intervention_updated",
      title: `Intervention ${intervention.reference} mise à jour`,
      description: `${changed.join(", ").replace(/^./, (c) => c.toUpperCase())} modifié${changed.length > 1 ? "s" : ""}.`,
      actor_name: ctx.actor,
      entity: { kind: "intervention", id: intervention.id },
    },
    ctx.now,
  );
  return changed;
}

export function cancelIntervention(draft: BatopsData, interventionId: string, reason: string, ctx: MutationContext): boolean {
  const intervention = draft.interventions.find((i) => i.id === interventionId);
  if (!intervention || intervention.status === "terminee" || intervention.status === "annulee") return false;
  intervention.status = "annulee";
  logActivity(
    draft,
    {
      client_id: intervention.client_id,
      type: "intervention_status",
      title: `Intervention ${intervention.reference} annulée`,
      description: reason.trim() || undefined,
      actor_name: ctx.actor,
      entity: { kind: "intervention", id: intervention.id },
    },
    ctx.now,
  );
  return true;
}
