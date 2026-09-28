/**
 * Sélecteurs du module Devis et du portail client (fonctions pures, testées en Vitest).
 */
import type { BatopsData, Client, ClientActivity, Equipment, Intervention, Quote, QuoteStatus } from "@/types/batops";
import { clientContactName, clientDisplayName } from "@/lib/domain/clients";
import { isSameMonth, toDate } from "@/lib/domain/dates";
import { round2 } from "@/lib/domain/money";
import { getQuoteDisplayStatus } from "@/lib/domain/status";
import { normalize } from "@/providers/text";
import { isVisibleOnPortal } from "./actions/quotes";
import { newestFirst } from "./selectors";

export type QuoteTab = "tous" | "brouillons" | "envoyes" | "signes" | "clos";

export interface QuoteRow {
  quote: Quote;
  client?: Client;
  clientName: string;
  status: QuoteStatus;
  /** Marge estimée en % du total HT. */
  marginPercent: number;
  updatedAt: string;
}

export function selectQuoteRows(data: BatopsData, now: Date): QuoteRow[] {
  const clients = new Map(data.clients.map((c) => [c.id, c]));
  return data.quotes
    .map((quote) => {
      const client = clients.get(quote.client_id);
      return {
        quote,
        client,
        clientName: client ? clientDisplayName(client) : "Client supprimé",
        status: getQuoteDisplayStatus(quote, now),
        marginPercent: quote.total_ht > 0 ? round2((quote.estimated_margin_ht / quote.total_ht) * 100) : 0,
        updatedAt: quote.signed_at ?? quote.refused_at ?? quote.updated_at ?? quote.sent_at ?? quote.created_at,
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.quote.reference.localeCompare(a.quote.reference));
}

const TAB_STATUSES: Record<Exclude<QuoteTab, "tous">, QuoteStatus[]> = {
  brouillons: ["brouillon"],
  envoyes: ["envoye"],
  signes: ["accepte"],
  clos: ["refuse", "expire"],
};

export function filterQuoteRows(rows: QuoteRow[], tab: QuoteTab, query: string): QuoteRow[] {
  const q = normalize(query.trim());
  return rows.filter((row) => {
    if (tab !== "tous" && !TAB_STATUSES[tab].includes(row.status)) return false;
    if (!q) return true;
    const haystack = normalize([row.quote.reference, row.quote.title, row.clientName, row.client?.city].filter(Boolean).join(" "));
    return haystack.includes(q);
  });
}

export function countQuoteTabs(rows: QuoteRow[]): Record<QuoteTab, number> {
  const count = (statuses: QuoteStatus[]) => rows.filter((r) => statuses.includes(r.status)).length;
  return {
    tous: rows.length,
    brouillons: count(TAB_STATUSES.brouillons),
    envoyes: count(TAB_STATUSES.envoyes),
    signes: count(TAB_STATUSES.signes),
    clos: count(TAB_STATUSES.clos),
  };
}

export interface QuoteKpis {
  draftsCount: number;
  draftsTotalTtc: number;
  pendingCount: number;
  pendingTotalTtc: number;
  signedThisMonthCount: number;
  signedThisMonthTotalHt: number;
  /** Devis signés / devis transmis au client (en %). */
  signatureRate: number;
}

export function selectQuoteKpis(data: BatopsData, now: Date): QuoteKpis {
  const statuses = data.quotes.map((q) => ({ quote: q, status: getQuoteDisplayStatus(q, now) }));
  const drafts = statuses.filter((s) => s.status === "brouillon");
  const pending = statuses.filter((s) => s.status === "envoye");
  const sent = statuses.filter((s) => s.status !== "brouillon");
  const signed = statuses.filter((s) => s.status === "accepte");
  const signedThisMonth = signed.filter((s) => s.quote.signed_at && isSameMonth(toDate(s.quote.signed_at), now));
  const sum = (list: typeof statuses, key: "total_ttc" | "total_ht") => round2(list.reduce((acc, s) => acc + s.quote[key], 0));
  return {
    draftsCount: drafts.length,
    draftsTotalTtc: sum(drafts, "total_ttc"),
    pendingCount: pending.length,
    pendingTotalTtc: sum(pending, "total_ttc"),
    signedThisMonthCount: signedThisMonth.length,
    signedThisMonthTotalHt: sum(signedThisMonth, "total_ht"),
    signatureRate: sent.length > 0 ? round2((signed.length / sent.length) * 100) : 0,
  };
}

export interface QuoteDetail {
  quote: Quote;
  client: Client;
  equipment?: Equipment;
  intervention?: Intervention;
  /** Événements du devis, du plus récent au plus ancien. */
  activities: ClientActivity[];
  comments: ClientActivity[];
  authorName?: string;
}

export function selectQuoteDetail(data: BatopsData, quoteId: string): QuoteDetail | null {
  const quote = data.quotes.find((q) => q.id === quoteId);
  const client = quote && data.clients.find((c) => c.id === quote.client_id);
  if (!quote || !client) return null;
  const activities = newestFirst(data.activities.filter((a) => a.entity?.kind === "quote" && a.entity.id === quote.id));
  return {
    quote,
    client,
    equipment: quote.equipment_id ? data.equipment.find((e) => e.id === quote.equipment_id) : undefined,
    intervention: data.interventions.find((i) => i.quote_id === quote.id),
    activities,
    comments: activities.filter((a) => a.type === "quote_comment").reverse(),
    authorName: data.users.find((u) => u.id === quote.created_by_user_id)?.full_name,
  };
}

export interface PortalView {
  client: Client;
  /** Interlocuteur (« Bonjour Jean-Pierre Bernard »). */
  contactName: string;
  quotes: Quote[];
}

/** Espace client : uniquement les devis transmis (jamais les brouillons), du plus récent au plus ancien. */
export function selectPortal(data: BatopsData, token: string): PortalView | null {
  const client = data.clients.find((c) => c.portal_token === token);
  if (!client) return null;
  return {
    client,
    contactName: clientContactName(client) || clientDisplayName(client),
    quotes: data.quotes
      .filter((q) => q.client_id === client.id && isVisibleOnPortal(q))
      .sort((a, b) => (b.sent_at ?? b.created_at).localeCompare(a.sent_at ?? a.created_at)),
  };
}

/** Devis mis en avant sur le portail : celui du lien, sinon le premier en attente de signature. */
export function selectPortalFocus(view: PortalView, reference: string | null, now: Date): Quote | undefined {
  const byReference = reference ? view.quotes.find((q) => q.reference === reference) : undefined;
  return byReference ?? view.quotes.find((q) => getQuoteDisplayStatus(q, now) === "envoye") ?? view.quotes[0];
}

/** Demande de devis encore ouverte du client : un nouveau devis y répond (lien visible et annulable). */
export function openQuoteRequest(data: Pick<BatopsData, "calls">, clientId: string) {
  return data.calls
    .filter((c) => c.client_id === clientId && c.status !== "converti" && c.detected_intent === "devis_installation")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

export function selectComments(data: Pick<BatopsData, "activities">, quoteId: string): ClientActivity[] {
  return data.activities
    .filter((a) => a.type === "quote_comment" && a.entity?.kind === "quote" && a.entity.id === quoteId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}
