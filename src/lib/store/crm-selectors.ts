/** Sélecteurs du CRM (liste, onglets, fiche 360°). Fonctions pures. */
import type { BatopsData, CallLog, Client, ClientActivity } from "@/types/batops";
import { clientContactName, clientDisplayName } from "@/lib/domain/clients";
import { isSameMonth, toDate } from "@/lib/domain/dates";
import { round2 } from "@/lib/domain/money";
import { normalize } from "@/providers/text";
import {
  getContractDisplayStatus,
  isQuoteAwaitingResponse,
  OPEN_STATUSES,
} from "@/lib/domain/status";

export type ClientTab = "tous" | "prospects" | "clients" | "contrat";

export interface ClientRow {
  client: Client;
  name: string;
  contact: string;
  equipmentCount: number;
  hasContract: boolean;
  openQuotes: number;
  /** Dernière demande entrante (appel) liée, pour la vue Prospects. */
  lastCall?: CallLog;
  lastActivityAt?: string;
}

export function selectClientRows(data: BatopsData, now: Date): ClientRow[] {
  const activeContracts = new Set(
    data.contracts.filter((c) => getContractDisplayStatus(c, data.interventions, now) !== "expire").map((c) => c.client_id),
  );
  const lastActivity = new Map<string, string>();
  for (const a of data.activities) {
    const current = lastActivity.get(a.client_id);
    if (!current || a.created_at > current) lastActivity.set(a.client_id, a.created_at);
  }
  return data.clients
    .map((client) => {
      const calls = data.calls
        .filter((c) => c.client_id === client.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return {
        client,
        name: clientDisplayName(client),
        contact: client.company_name ? clientContactName(client) : client.phone,
        equipmentCount: data.equipment.filter((e) => e.client_id === client.id).length,
        hasContract: activeContracts.has(client.id),
        openQuotes: data.quotes.filter((q) => q.client_id === client.id && isQuoteAwaitingResponse(q, now)).length,
        lastCall: calls[0],
        lastActivityAt: lastActivity.get(client.id),
      };
    })
    .sort((a, b) => (b.lastActivityAt ?? b.client.created_at).localeCompare(a.lastActivityAt ?? a.client.created_at));
}

export function filterClientRows(rows: ClientRow[], tab: ClientTab, query: string): ClientRow[] {
  const q = normalize(query);
  return rows.filter((row) => {
    if (tab === "prospects" && row.client.status !== "prospect") return false;
    if (tab === "clients" && row.client.status !== "client") return false;
    if (tab === "contrat" && !row.hasContract) return false;
    if (!q) return true;
    const haystack = normalize(
      [row.name, row.contact, row.client.city, row.client.postal_code, row.client.email, row.client.phone.replace(/\s/g, ""), row.client.phone]
        .filter(Boolean)
        .join(" "),
    );
    return haystack.includes(q.replace(/\s/g, "")) || haystack.includes(q);
  });
}

export function countByTab(rows: ClientRow[]): Record<ClientTab, number> {
  return {
    tous: rows.length,
    prospects: rows.filter((r) => r.client.status === "prospect").length,
    clients: rows.filter((r) => r.client.status === "client").length,
    contrat: rows.filter((r) => r.hasContract).length,
  };
}

export interface Client360 {
  client: Client;
  equipment: BatopsData["equipment"];
  quotes: BatopsData["quotes"];
  interventions: BatopsData["interventions"];
  invoices: BatopsData["invoices"];
  contracts: BatopsData["contracts"];
  calls: BatopsData["calls"];
  activities: ClientActivity[];
  stats: {
    cashCollected: number;
    cashThisMonth: number;
    openQuotes: number;
    upcomingInterventions: number;
  };
}

export function selectClient360(data: BatopsData, clientId: string, now: Date): Client360 | null {
  const client = data.clients.find((c) => c.id === clientId);
  if (!client) return null;
  const invoices = data.invoices.filter((i) => i.client_id === clientId);
  const payments = invoices.flatMap((i) => i.payments);
  const quotes = data.quotes.filter((q) => q.client_id === clientId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const interventions = data.interventions
    .filter((i) => i.client_id === clientId)
    .sort((a, b) => (b.scheduled_start ?? b.created_at).localeCompare(a.scheduled_start ?? a.created_at));
  return {
    client,
    equipment: data.equipment.filter((e) => e.client_id === clientId).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    quotes,
    interventions,
    invoices: invoices.sort((a, b) => b.issue_date.localeCompare(a.issue_date)),
    contracts: data.contracts.filter((c) => c.client_id === clientId),
    calls: data.calls.filter((c) => c.client_id === clientId).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    activities: data.activities.filter((a) => a.client_id === clientId).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    stats: {
      cashCollected: round2(payments.reduce((s, p) => s + p.amount, 0)),
      cashThisMonth: round2(payments.filter((p) => isSameMonth(toDate(p.paid_at), now)).reduce((s, p) => s + p.amount, 0)),
      openQuotes: quotes.filter((q) => isQuoteAwaitingResponse(q, now)).length,
      upcomingInterventions: interventions.filter((i) => OPEN_STATUSES.includes(i.status)).length,
    },
  };
}
