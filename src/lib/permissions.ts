/**
 * Matrice des rôles BATOPS (cadrage §3 module 17).
 *  - owner       : accès total, marges, factures, paramètres.
 *  - dispatcher  : appels, clients, devis, planning, factures — sans marges ni paramètres.
 *  - technician  : uniquement l'app terrain /tech, zéro information financière.
 *  - accountant  : lecture seule sur devis, factures et paiements.
 */
import type { UserRole } from "@/types/batops";

export type Capability =
  | "view_dashboard"
  | "view_financials"
  | "view_margins"
  | "manage_calls"
  | "manage_clients"
  | "read_catalog"
  | "manage_catalog"
  | "read_quotes"
  | "manage_quotes"
  | "manage_planning"
  | "manage_interventions"
  | "read_invoices"
  | "manage_invoices"
  | "manage_contracts"
  | "manage_settings"
  | "use_field_app";

const OFFICE_OPERATIONS: Capability[] = [
  "view_dashboard",
  "view_financials",
  "manage_calls",
  "manage_clients",
  "read_catalog",
  "read_quotes",
  "manage_quotes",
  "manage_planning",
  "manage_interventions",
  "read_invoices",
  "manage_invoices",
  "manage_contracts",
  "use_field_app",
];

export const ROLE_CAPABILITIES: Record<UserRole, readonly Capability[]> = {
  owner: [...OFFICE_OPERATIONS, "view_margins", "manage_catalog", "manage_settings"],
  dispatcher: OFFICE_OPERATIONS,
  technician: ["use_field_app"],
  accountant: ["view_financials", "read_quotes", "read_invoices"],
};

export function can(role: UserRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

/** Page d'accueil par rôle (redirection intelligente de `/`). */
export const ROLE_HOME: Record<UserRole, string> = {
  owner: "/dashboard",
  dispatcher: "/dashboard",
  technician: "/tech",
  accountant: "/invoices",
};

/** Règles d'accès par préfixe de route : il suffit d'une des capacités listées. */
const ROUTE_RULES: { prefix: string; anyOf: Capability[] }[] = [
  { prefix: "/dashboard", anyOf: ["view_dashboard"] },
  { prefix: "/calls", anyOf: ["manage_calls"] },
  { prefix: "/clients", anyOf: ["manage_clients"] },
  { prefix: "/quotes", anyOf: ["read_quotes"] },
  { prefix: "/planning", anyOf: ["manage_planning"] },
  { prefix: "/interventions", anyOf: ["manage_interventions"] },
  { prefix: "/photos", anyOf: ["manage_interventions"] },
  { prefix: "/invoices", anyOf: ["read_invoices"] },
  { prefix: "/sav", anyOf: ["manage_contracts"] },
  { prefix: "/catalog", anyOf: ["read_catalog"] },
  { prefix: "/settings", anyOf: ["manage_settings"] },
  { prefix: "/tech", anyOf: ["use_field_app"] },
];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Routes non listées (ex. `/login`, `/portal/*`) : publiques. */
export function canAccessPath(role: UserRole, pathname: string): boolean {
  const rule = ROUTE_RULES.find((r) => matches(pathname, r.prefix));
  if (!rule) return true;
  return rule.anyOf.some((capability) => can(role, capability));
}
