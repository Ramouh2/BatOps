/**
 * Mutations CRM : prospects, clients, notes, équipements.
 * Chaque fonction opère sur un brouillon immer et journalise l'événement dans la timeline du client.
 */
import type { BatopsData, Client, Equipment } from "@/types/batops";
import { createId, createPortalToken } from "@/lib/domain/ids";
import { clientDisplayName } from "@/lib/domain/clients";
import { CLIENT_SOURCE_LABEL, EQUIPMENT_CATEGORY_LABEL } from "@/lib/domain/labels";
import {
  normalizeClientInput,
  normalizeEquipmentInput,
  type ClientInput,
  type EquipmentInput,
} from "@/lib/domain/validation";
import { logActivity } from "../mutations";
import type { MutationContext } from "./context";

const CLIENT_FIELD_LABELS: Partial<Record<keyof ClientInput, string>> = {
  type: "type",
  civility: "civilité",
  first_name: "prénom",
  last_name: "nom",
  company_name: "raison sociale",
  email: "e-mail",
  phone: "téléphone",
  address: "adresse",
  postal_code: "code postal",
  city: "ville",
  access_notes: "notes d'accès",
  source: "source",
  notes: "notes",
  housing_over_2_years: "ancienneté du logement",
};

export function createClient(draft: BatopsData, input: ClientInput, ctx: MutationContext): string {
  const clean = normalizeClientInput(input);
  const client: Client = {
    ...clean,
    id: createId("cli"),
    organization_id: draft.organization.id,
    portal_token: createPortalToken(),
    created_at: ctx.now.toISOString(),
  };
  draft.clients.push(client);
  logActivity(
    draft,
    {
      client_id: client.id,
      type: "client_created",
      title: client.status === "prospect" ? "Prospect créé" : "Fiche client créée",
      description: [client.source ? `Source : ${CLIENT_SOURCE_LABEL[client.source]}` : undefined, client.notes]
        .filter(Boolean)
        .join(" — ") || undefined,
      actor_name: ctx.actor,
    },
    ctx.now,
  );
  return client.id;
}

/** Met à jour les coordonnées (le statut ne change que par conversion). Retourne les champs modifiés. */
export function updateClient(draft: BatopsData, clientId: string, input: ClientInput, ctx: MutationContext): string[] {
  const client = draft.clients.find((c) => c.id === clientId);
  if (!client) return [];
  const clean = normalizeClientInput({ ...input, status: client.status });
  const changed: string[] = [];
  for (const key of Object.keys(CLIENT_FIELD_LABELS) as (keyof ClientInput)[]) {
    if ((client[key as keyof Client] ?? undefined) !== (clean[key] ?? undefined)) {
      changed.push(CLIENT_FIELD_LABELS[key]!);
      (client as unknown as Record<string, unknown>)[key] = clean[key];
    }
  }
  if (changed.length > 0) {
    logActivity(
      draft,
      {
        client_id: client.id,
        type: "client_updated",
        title: "Fiche mise à jour",
        description: `${changed.join(", ").replace(/^./, (c) => c.toUpperCase())} modifié${changed.length > 1 ? "s" : ""}.`,
        actor_name: ctx.actor,
      },
      ctx.now,
    );
  }
  return changed;
}

export function convertProspect(draft: BatopsData, clientId: string, ctx: MutationContext): boolean {
  const client = draft.clients.find((c) => c.id === clientId);
  if (!client || client.status !== "prospect") return false;
  client.status = "client";
  logActivity(
    draft,
    {
      client_id: client.id,
      type: "client_converted",
      title: "Prospect converti en client",
      description: `${clientDisplayName(client)} rejoint le portefeuille clients.`,
      actor_name: ctx.actor,
    },
    ctx.now,
  );
  return true;
}

export function addClientNote(draft: BatopsData, clientId: string, text: string, ctx: MutationContext): boolean {
  const note = text.trim();
  if (!note || !draft.clients.some((c) => c.id === clientId)) return false;
  logActivity(draft, { client_id: clientId, type: "note", title: "Note", description: note, actor_name: ctx.actor }, ctx.now);
  return true;
}

/* ------------------------------------------------------------------ */
/* Équipements                                                         */
/* ------------------------------------------------------------------ */

const equipmentLabel = (e: Pick<Equipment, "brand" | "model" | "category">) =>
  `${EQUIPMENT_CATEGORY_LABEL[e.category]} ${e.brand} ${e.model}`;

export function addEquipment(draft: BatopsData, clientId: string, input: EquipmentInput, ctx: MutationContext): string | null {
  if (!draft.clients.some((c) => c.id === clientId)) return null;
  const clean = normalizeEquipmentInput(input);
  const equipment: Equipment = {
    ...clean,
    id: createId("eq"),
    organization_id: draft.organization.id,
    client_id: clientId,
    created_at: ctx.now.toISOString(),
  };
  draft.equipment.push(equipment);
  logActivity(
    draft,
    {
      client_id: clientId,
      type: "equipment_added",
      title: "Équipement ajouté au parc",
      description: equipmentLabel(equipment),
      actor_name: ctx.actor,
      entity: { kind: "equipment", id: equipment.id },
    },
    ctx.now,
  );
  return equipment.id;
}

export function updateEquipment(draft: BatopsData, equipmentId: string, input: EquipmentInput, ctx: MutationContext): boolean {
  const equipment = draft.equipment.find((e) => e.id === equipmentId);
  if (!equipment) return false;
  Object.assign(equipment, normalizeEquipmentInput(input));
  logActivity(
    draft,
    {
      client_id: equipment.client_id,
      type: "equipment_updated",
      title: "Équipement mis à jour",
      description: equipmentLabel(equipment),
      actor_name: ctx.actor,
      entity: { kind: "equipment", id: equipment.id },
    },
    ctx.now,
  );
  return true;
}

export interface EquipmentUsage {
  interventions: number;
  contracts: number;
}

/** Un équipement référencé par une intervention ou un contrat ne peut pas être retiré (historique). */
export function equipmentUsage(data: Pick<BatopsData, "interventions" | "contracts">, equipmentId: string): EquipmentUsage {
  return {
    interventions: data.interventions.filter((i) => i.equipment_id === equipmentId).length,
    contracts: data.contracts.filter((c) => c.equipment_id === equipmentId).length,
  };
}

export function removeEquipment(draft: BatopsData, equipmentId: string, ctx: MutationContext): boolean {
  const index = draft.equipment.findIndex((e) => e.id === equipmentId);
  if (index === -1) return false;
  const usage = equipmentUsage(draft, equipmentId);
  if (usage.interventions > 0 || usage.contracts > 0) return false;
  const [removed] = draft.equipment.splice(index, 1);
  logActivity(
    draft,
    {
      client_id: removed.client_id,
      type: "equipment_removed",
      title: "Équipement retiré du parc",
      description: equipmentLabel(removed),
      actor_name: ctx.actor,
    },
    ctx.now,
  );
  return true;
}
