"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { batopsStore, useActions } from "@/lib/store";
import { formatDateTime, formatDuration, formatTime } from "@/lib/domain/format";
import { isSameDay, toDate } from "@/lib/domain/dates";
import type { Conflict } from "@/lib/domain/planning";
import type { ScheduleChange } from "@/lib/store/actions/interventions";

interface Snapshot {
  status: string;
  technicianId?: string;
  start?: string;
  duration: number;
}

const TITLES: Record<Exclude<ScheduleChange, "unchanged">, string> = {
  planned: "planifiée",
  moved: "déplacée",
  reassigned: "réaffectée",
  rescheduled: "replanifiée",
  resized: "durée ajustée",
};

/**
 * Planifier / déplacer / réaffecter / retirer avec un retour immédiat : toast explicite (créneau, technicien,
 * conflits) et bouton « Annuler » qui restaure l'état précédent.
 */
export function usePlanningActions(onChanged?: (interventionId: string) => void) {
  const actions = useActions();

  const snapshot = (interventionId: string): Snapshot | null => {
    const i = batopsStore.getState().data?.interventions.find((x) => x.id === interventionId);
    return i ? { status: i.status, technicianId: i.assigned_technician_id, start: i.scheduled_start, duration: i.duration_minutes } : null;
  };

  const restore = useCallback(
    (interventionId: string, previous: Snapshot) => {
      if (previous.status === "nouvelle" || !previous.start || !previous.technicianId) actions.unscheduleIntervention(interventionId);
      else actions.scheduleIntervention({ intervention_id: interventionId, technician_id: previous.technicianId, start: previous.start, duration_minutes: previous.duration });
      onChanged?.(interventionId);
      toast("Modification annulée", { duration: 1800 });
    },
    [actions, onChanged],
  );

  const schedule = useCallback(
    (interventionId: string, technicianId: string, start: Date, durationMinutes?: number, note?: string): { change: ScheduleChange; conflicts: Conflict[] } | null => {
      const previous = snapshot(interventionId);
      const result = actions.scheduleIntervention({ intervention_id: interventionId, technician_id: technicianId, start: start.toISOString(), duration_minutes: durationMinutes });
      if (!result.ok) {
        toast.error("Planification impossible", { description: Object.values(result.errors)[0] });
        return null;
      }
      const { change, conflicts } = result.value;
      if (change === "unchanged") return result.value;
      onChanged?.(interventionId);
      const data = batopsStore.getState().data!;
      const intervention = data.interventions.find((i) => i.id === interventionId)!;
      const tech = data.users.find((u) => u.id === technicianId);
      const end = toDate(intervention.scheduled_end!);
      const when = `${formatDateTime(start)} → ${isSameDay(start, end) ? formatTime(end) : formatDateTime(end)}`;
      const title = `${intervention.reference} ${TITLES[change]}${change === "reassigned" && tech ? ` à ${tech.full_name.split(" ")[0]}` : ""}`;
      const description = [
        change === "resized" ? `${formatDuration(intervention.duration_minutes)} de travail · ${when}` : `${when} · ${tech?.full_name ?? ""}`,
        note,
        ...conflicts.map((c) => `⚠ ${c.message}`),
      ]
        .filter(Boolean)
        .join("\n");
      const options = {
        description,
        action: previous ? { label: "Annuler", onClick: () => restore(interventionId, previous) } : undefined,
        duration: conflicts.length > 0 ? 6000 : 4000,
      };
      if (conflicts.some((c) => c.severity === "error")) toast.warning(title, options);
      else toast.success(title, options);
      return result.value;
    },
    [actions, onChanged, restore],
  );

  const unschedule = useCallback(
    (interventionId: string) => {
      const previous = snapshot(interventionId);
      if (!actions.unscheduleIntervention(interventionId)) return false;
      onChanged?.(interventionId);
      const reference = batopsStore.getState().data?.interventions.find((i) => i.id === interventionId)?.reference ?? "";
      toast(`${reference} remise « À planifier »`, {
        description: "Le créneau et le technicien sont libérés.",
        action: previous ? { label: "Annuler", onClick: () => restore(interventionId, previous) } : undefined,
      });
      return true;
    },
    [actions, onChanged, restore],
  );

  return { schedule, unschedule };
}
