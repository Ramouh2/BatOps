/**
 * Primitives de mutation partagées par toutes les actions métier du store.
 * Elles opèrent sur un brouillon immer de `BatopsData` : toute action métier (signature de devis,
 * clôture d'intervention, paiement…) doit passer par ces helpers pour garder la numérotation
 * et la timeline client cohérentes.
 */
import type { BatopsData, ClientActivity, ISODateTime, SequenceKey } from "@/types/batops";
import { createId, formatReference } from "@/lib/domain/ids";

/** Réserve la prochaine référence continue (`DEV-2026-0042`) et incrémente la séquence. */
export function takeReference(draft: BatopsData, kind: SequenceKey, date: Date): string {
  const number = draft.sequences[kind];
  draft.sequences[kind] = number + 1;
  return formatReference(kind, date.getFullYear(), number);
}

export type NewActivity = Omit<ClientActivity, "id" | "organization_id" | "created_at"> & {
  created_at?: ISODateTime;
};

/** Ajoute un événement à la timeline 360° du client. */
export function logActivity(draft: BatopsData, activity: NewActivity, now: Date): ClientActivity {
  const entry: ClientActivity = {
    ...activity,
    id: createId("act"),
    organization_id: draft.organization.id,
    created_at: activity.created_at ?? now.toISOString(),
  };
  draft.activities.push(entry);
  return entry;
}
