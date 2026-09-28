import type { Client } from "@/types/batops";

/** Nom affiché : raison sociale pour un pro / syndic, sinon civilité + prénom + nom. */
export function clientDisplayName(client: Pick<Client, "company_name" | "civility" | "first_name" | "last_name">): string {
  if (client.company_name) return client.company_name;
  return [client.civility, client.first_name, client.last_name].filter(Boolean).join(" ");
}

/** Interlocuteur : prénom + nom (utile pour les pros et syndics). */
export function clientContactName(client: Pick<Client, "civility" | "first_name" | "last_name">): string {
  return [client.civility, client.first_name, client.last_name].filter(Boolean).join(" ");
}

export function formatAddress(parts: { address: string; postal_code: string; city: string }): string {
  return `${parts.address}, ${parts.postal_code} ${parts.city}`;
}
