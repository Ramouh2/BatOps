/**
 * Géométrie et identifiants partagés par les vues du planning (grille horaire, matrice, colonne « À planifier »).
 */
import { parseISODate, toISODate } from "@/lib/domain/dates";
import { GRID_END_HOUR, GRID_START_HOUR } from "@/lib/domain/planning";

/** Hauteur d'une heure dans les grilles (px). */
export const HOUR_PX = 48;
export const PX_PER_MIN = HOUR_PX / 60;
export const GRID_START_MIN = GRID_START_HOUR * 60;
export const GRID_END_MIN = GRID_END_HOUR * 60;
export const GRID_HEIGHT = (GRID_END_MIN - GRID_START_MIN) * PX_PER_MIN;

export function minuteToY(minutes: number): number {
  return (Math.min(Math.max(minutes, GRID_START_MIN), GRID_END_MIN) - GRID_START_MIN) * PX_PER_MIN;
}

export function yToMinute(y: number): number {
  return GRID_START_MIN + y / PX_PER_MIN;
}

/** Couleur d'un technicien avec transparence (`#2563EB` + alpha). */
export function tint(hex: string, alpha: number): string {
  return `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`;
}

export type PlanningView = "jour" | "semaine" | "technicien";

/**
 * Cibles de dépôt :
 *  - `col:<jour>:<technicien?>` colonne horaire (Semaine : un jour ; Jour : un technicien) ;
 *  - `cell:<jour>:<technicien>` case de la matrice Technicien × jour ;
 *  - `unplanned` colonne « À planifier » (retirer du planning).
 */
export type DropTarget =
  | { kind: "column"; day: Date; technicianId?: string }
  | { kind: "cell"; day: Date; technicianId: string }
  | { kind: "unplanned" };

export function dropId(target: DropTarget): string {
  if (target.kind === "unplanned") return "unplanned";
  const day = toISODate(target.day);
  return target.kind === "column" ? `col:${day}:${target.technicianId ?? ""}` : `cell:${day}:${target.technicianId}`;
}

export function parseDropId(id: string | number | undefined | null): DropTarget | null {
  if (typeof id !== "string") return null;
  if (id === "unplanned") return { kind: "unplanned" };
  const [kind, day, tech] = id.split(":");
  if (!day) return null;
  if (kind === "col") return { kind: "column", day: parseISODate(day), technicianId: tech || undefined };
  if (kind === "cell" && tech) return { kind: "cell", day: parseISODate(day), technicianId: tech };
  return null;
}

export const DRAG_PREFIX = "int:";
export const dragId = (interventionId: string) => `${DRAG_PREFIX}${interventionId}`;
export const interventionIdFromDrag = (id: string | number) => String(id).slice(DRAG_PREFIX.length);
