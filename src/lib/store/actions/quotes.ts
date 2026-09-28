/**
 * Mutations « Devis » : brouillon → envoi (lien portail) → consultation → signature (intervention préparée)
 * ou refus. Chaque étape met à jour toutes les entités liées et la timeline du client.
 */
import type { BatopsData, Client, Intervention, MessageChannel, Quote } from "@/types/batops";
import { clientContactName, clientDisplayName } from "@/lib/domain/clients";
import { addDays, diffInCalendarDays, toDate, toISODate } from "@/lib/domain/dates";
import { formatDate, formatEUR } from "@/lib/domain/format";
import { createId } from "@/lib/domain/ids";
import { INTERVENTION_TYPE_LABEL } from "@/lib/domain/labels";
import { portalUrl } from "@/lib/domain/portal";
import { computeQuoteTotals, depositAmount, interventionPlanFromQuote, quoteValidityDays } from "@/lib/domain/quotes";
import { getQuoteDisplayStatus } from "@/lib/domain/status";
import { normalizeQuoteInput, type FieldErrors, type QuoteInput } from "@/lib/domain/validation";
import type { OutgoingMessage, SendResult } from "@/providers/notifications/notification.provider";
import { logActivity, takeReference } from "../mutations";
import type { MutationContext } from "./context";

/* ------------------------------------------------------------------ */
/* Brouillon                                                           */
/* ------------------------------------------------------------------ */

/** Saisie d'éditeur reconstituée depuis un devis existant. */
export function quoteToInput(quote: Quote): QuoteInput {
  return {
    client_id: quote.client_id,
    equipment_id: quote.equipment_id,
    title: quote.title,
    site_address: quote.site_address,
    site_postal_code: quote.site_postal_code,
    site_city: quote.site_city,
    items: quote.items,
    discount_amount_ht: quote.discount_amount_ht,
    discount_percent: quote.discount_percent,
    deposit_percent: quote.deposit_percent,
    validity_days: quoteValidityDays(quote),
    conditions: quote.conditions,
    notes: quote.notes,
    ai_generated: quote.ai_generated,
    call_log_id: quote.call_log_id,
  };
}

function applyInput(quote: Quote, input: QuoteInput) {
  const clean = normalizeQuoteInput(input);
  const totals = computeQuoteTotals(clean.items, clean);
  quote.equipment_id = clean.equipment_id;
  quote.title = clean.title;
  quote.site_address = clean.site_address;
  quote.site_postal_code = clean.site_postal_code;
  quote.site_city = clean.site_city;
  quote.items = clean.items;
  quote.subtotal_ht = totals.subtotal_ht;
  quote.discount_amount_ht = totals.discount_amount_ht;
  quote.discount_percent = clean.discount_percent;
  quote.total_ht = totals.total_ht;
  quote.total_tva = totals.total_tva;
  quote.total_ttc = totals.total_ttc;
  quote.estimated_cost_ht = totals.cost_ht;
  quote.estimated_margin_ht = totals.margin_ht;
  quote.deposit_percent = clean.deposit_percent;
  quote.valid_until = toISODate(addDays(toDate(quote.issue_date), clean.validity_days));
  quote.conditions = clean.conditions;
  quote.notes = clean.notes;
  quote.ai_generated = quote.ai_generated || clean.ai_generated;
}

/** Relie le devis à l'appel d'origine (l'appel est alors « converti »). */
function linkCall(draft: BatopsData, quote: Quote, callId?: string) {
  if (!callId || quote.call_log_id === callId) return;
  const call = draft.calls.find((c) => c.id === callId && c.client_id === quote.client_id);
  if (!call) return;
  quote.call_log_id = call.id;
  call.quote_id = quote.id;
  call.status = "converti";
}

export function createQuote(draft: BatopsData, input: QuoteInput, ctx: MutationContext): string {
  const today = toISODate(ctx.now);
  const quote: Quote = {
    id: createId("quo"),
    organization_id: draft.organization.id,
    client_id: input.client_id,
    reference: takeReference(draft, "quote", ctx.now),
    title: "",
    status: "brouillon",
    issue_date: today,
    valid_until: today,
    site_address: "",
    site_postal_code: "",
    site_city: "",
    items: [],
    subtotal_ht: 0,
    discount_amount_ht: 0,
    total_ht: 0,
    total_tva: 0,
    total_ttc: 0,
    estimated_cost_ht: 0,
    estimated_margin_ht: 0,
    deposit_percent: draft.organization.default_deposit_percent,
    ai_generated: false,
    created_by_user_id: ctx.actorId,
    created_at: ctx.now.toISOString(),
    updated_at: ctx.now.toISOString(),
  };
  applyInput(quote, input);
  draft.quotes.push(quote);
  linkCall(draft, quote, input.call_log_id);
  logActivity(
    draft,
    {
      client_id: quote.client_id,
      type: "quote_created",
      title: `Devis ${quote.reference} créé`,
      description: `${quote.title}${quote.ai_generated ? " — préparé avec l'assistant IA (prix du catalogue)" : ""}`,
      actor_name: ctx.actor,
      entity: { kind: "quote", id: quote.id },
    },
    ctx.now,
  );
  return quote.id;
}

/** Enregistre un brouillon (le client d'un devis ne change pas après création). */
export function updateQuote(draft: BatopsData, quoteId: string, input: QuoteInput, ctx: MutationContext): boolean {
  const quote = draft.quotes.find((q) => q.id === quoteId);
  if (!quote || quote.status !== "brouillon") return false;
  applyInput(quote, { ...input, client_id: quote.client_id });
  linkCall(draft, quote, input.call_log_id);
  quote.updated_at = ctx.now.toISOString();
  return true;
}

/** Devis envoyé (ou expiré) repassé en brouillon pour être corrigé puis renvoyé. */
export function reopenQuote(draft: BatopsData, quoteId: string, ctx: MutationContext): boolean {
  const quote = draft.quotes.find((q) => q.id === quoteId);
  if (!quote || quote.status !== "envoye") return false;
  quote.status = "brouillon";
  quote.updated_at = ctx.now.toISOString();
  logActivity(
    draft,
    {
      client_id: quote.client_id,
      type: "quote_updated",
      title: `Devis ${quote.reference} repassé en brouillon`,
      description: "Modification en cours : le client verra la nouvelle version une fois le devis renvoyé.",
      actor_name: ctx.actor,
      entity: { kind: "quote", id: quote.id },
    },
    ctx.now,
  );
  return true;
}

/** Suppression d'un brouillon jamais envoyé (un devis transmis au client reste dans l'historique). */
export function deleteQuoteDraft(draft: BatopsData, quoteId: string, ctx: MutationContext): boolean {
  const index = draft.quotes.findIndex((q) => q.id === quoteId);
  const quote = draft.quotes[index];
  if (!quote || quote.status !== "brouillon" || quote.sent_at) return false;
  draft.quotes.splice(index, 1);
  const call = quote.call_log_id ? draft.calls.find((c) => c.id === quote.call_log_id) : undefined;
  if (call && call.quote_id === quote.id) {
    call.quote_id = undefined;
    if (!call.intervention_id) call.status = "a_rappeler";
  }
  logActivity(
    draft,
    {
      client_id: quote.client_id,
      type: "quote_deleted",
      title: `Brouillon ${quote.reference} supprimé`,
      description: quote.title,
      actor_name: ctx.actor,
    },
    ctx.now,
  );
  return true;
}

/* ------------------------------------------------------------------ */
/* Envoi & relance (lien portail)                                      */
/* ------------------------------------------------------------------ */

export interface QuoteMessage extends OutgoingMessage {
  link: string;
}

function greetingFor(client: Client): string {
  return client.type === "particulier" ? clientDisplayName(client) : clientContactName(client) || clientDisplayName(client);
}

function signatureLines(data: BatopsData, actorId?: string): string {
  const author = data.users.find((u) => u.id === actorId && u.role !== "technician");
  const org = data.organization;
  return [author ? `${author.full_name} — ${org.name}` : org.name, org.phone].filter(Boolean).join("\n");
}

/** Canal par défaut : e-mail si le client en a un, sinon SMS. */
export function defaultChannelFor(client: Pick<Client, "email">): MessageChannel {
  return client.email ? "email" : "sms";
}

/** Message d'envoi du devis avec son lien de consultation / signature sur le portail. */
export function buildQuoteMessage(
  data: BatopsData,
  quoteId: string,
  options: { origin: string; channel?: MessageChannel; actorId?: string; now: Date },
): QuoteMessage | null {
  const quote = data.quotes.find((q) => q.id === quoteId);
  const client = quote && data.clients.find((c) => c.id === quote.client_id);
  if (!quote || !client || quote.status !== "brouillon" || quote.items.length === 0) return null;
  const channel = options.channel ?? defaultChannelFor(client);
  if (channel === "email" && !client.email) return null;
  const link = portalUrl(options.origin, client.portal_token, quote.reference);
  const org = data.organization;
  const validUntil = formatDate(addDays(toDate(toISODate(options.now)), quoteValidityDays(quote)));
  const deposit = quote.deposit_percent > 0 ? depositAmount(quote.total_ttc, quote.deposit_percent) : 0;

  if (channel === "sms") {
    return {
      channel,
      to: client.phone,
      body: `${org.name} : votre devis ${quote.reference} (${formatEUR(quote.total_ttc)} TTC) est disponible. Consultez-le et signez-le en ligne : ${link}`,
      link,
    };
  }
  const body = [
    `Bonjour ${greetingFor(client)},`,
    `Suite à notre échange, voici notre devis ${quote.reference} « ${quote.title} » d'un montant de ${formatEUR(quote.total_ttc)} TTC.`,
    `Consultez-le et signez-le en ligne, en toute sécurité :\n${link}`,
    [
      `Ce devis est valable jusqu'au ${validUntil}.`,
      deposit > 0 ? `Un acompte de ${quote.deposit_percent} % (${formatEUR(deposit)}) est demandé à la signature.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    "Nous restons à votre disposition pour toute question.",
    `Bien cordialement,\n${signatureLines(data, options.actorId)}`,
  ].join("\n\n");
  return { channel, to: client.email!, subject: `Votre devis ${quote.reference} — ${org.name}`, body, link };
}

/** Journalise un envoi (réussi ou non) dans l'outbox du client. */
function pushOutbox(draft: BatopsData, quote: Quote, message: OutgoingMessage, result: SendResult) {
  draft.outbox.push({
    id: createId("msg"),
    organization_id: draft.organization.id,
    channel: message.channel,
    to: message.to,
    subject: message.subject,
    body: message.body,
    client_id: quote.client_id,
    entity: { kind: "quote", id: quote.id },
    provider_mode: result.provider_mode,
    status: result.status,
    created_at: result.sent_at,
  });
}

export function applyQuoteSent(
  draft: BatopsData,
  quoteId: string,
  message: OutgoingMessage,
  result: SendResult,
  ctx: MutationContext,
): boolean {
  const quote = draft.quotes.find((q) => q.id === quoteId);
  if (!quote || quote.status !== "brouillon") return false;
  pushOutbox(draft, quote, message, result);
  if (result.status === "echec") return false;

  const validity = quoteValidityDays(quote);
  const today = toISODate(ctx.now);
  quote.status = "envoye";
  quote.issue_date = today;
  quote.valid_until = toISODate(addDays(toDate(today), validity));
  quote.sent_at = result.sent_at;
  quote.viewed_at = undefined;
  quote.last_reminder_at = undefined;
  quote.updated_at = ctx.now.toISOString();
  logActivity(
    draft,
    {
      client_id: quote.client_id,
      type: "quote_sent",
      title: `Devis ${quote.reference} envoyé`,
      description: `${formatEUR(quote.total_ttc)} TTC — ${message.channel === "email" ? "e-mail" : "SMS"} à ${message.to} avec le lien de signature${result.provider_mode === "mock" ? " (simulation, mode démo)" : ""}.`,
      actor_name: ctx.actor,
      entity: { kind: "quote", id: quote.id },
      created_at: result.sent_at,
    },
    ctx.now,
  );
  return true;
}

export function buildQuoteReminder(data: BatopsData, quoteId: string, now: Date, origin: string): QuoteMessage | null {
  const quote = data.quotes.find((q) => q.id === quoteId);
  const client = quote && data.clients.find((c) => c.id === quote.client_id);
  if (!quote || !client || quote.status !== "envoye") return null;
  const days = quote.sent_at ? diffInCalendarDays(toDate(quote.sent_at), now) : undefined;
  const link = portalUrl(origin, client.portal_token, quote.reference);
  const org = data.organization;
  const sentSince = days !== undefined ? `, envoyé il y a ${days} jour${days > 1 ? "s" : ""}` : "";

  if (!client.email) {
    return {
      channel: "sms",
      to: client.phone,
      body: `${org.name} : nous revenons vers vous au sujet du devis ${quote.reference} (${formatEUR(quote.total_ttc)} TTC). Consultez-le et signez-le en ligne : ${link}`,
      link,
    };
  }
  const body = [
    `Bonjour ${greetingFor(client)},`,
    `Nous revenons vers vous au sujet de notre devis ${quote.reference} « ${quote.title} » (${formatEUR(quote.total_ttc)} TTC)${sentSince}.`,
    `Vous pouvez le consulter et le signer en ligne à tout moment :\n${link}`,
    "Avez-vous des questions ? Nous restons disponibles pour en discuter ou ajuster la proposition.",
    `Bien cordialement,\n${org.name} — ${org.phone ?? ""}`.trim(),
  ].join("\n\n");
  return { channel: "email", to: client.email, subject: `Votre devis ${quote.reference} — ${org.name}`, body, link };
}

export function applyQuoteReminder(
  draft: BatopsData,
  quoteId: string,
  message: OutgoingMessage,
  result: SendResult,
  ctx: MutationContext,
): boolean {
  const quote = draft.quotes.find((q) => q.id === quoteId);
  if (!quote) return false;
  if (result.status !== "echec") quote.last_reminder_at = result.sent_at;
  pushOutbox(draft, quote, message, result);
  logActivity(
    draft,
    {
      client_id: quote.client_id,
      type: "quote_reminder",
      title: `Relance du devis ${quote.reference}`,
      description:
        result.status === "echec"
          ? "Échec de l'envoi de la relance."
          : `${message.channel === "email" ? "E-mail" : "SMS"} de relance envoyé à ${message.to} avec le lien de signature${result.provider_mode === "mock" ? " (simulation, mode démo)" : ""}.`,
      actor_name: ctx.actor,
      entity: { kind: "quote", id: quote.id },
      created_at: result.sent_at,
    },
    ctx.now,
  );
  return true;
}

/* ------------------------------------------------------------------ */
/* Portail client : consultation, remarque, signature, refus            */
/* ------------------------------------------------------------------ */

/** Les devis en brouillon ne sont jamais visibles sur le portail. */
export function isVisibleOnPortal(quote: Pick<Quote, "status">): boolean {
  return quote.status !== "brouillon";
}

/** Première ouverture du devis par le client (sert au suivi « consulté »). */
export function markQuoteViewed(draft: BatopsData, quoteId: string, ctx: MutationContext): boolean {
  const quote = draft.quotes.find((q) => q.id === quoteId);
  const client = quote && draft.clients.find((c) => c.id === quote.client_id);
  if (!quote || !client || quote.status !== "envoye" || quote.viewed_at) return false;
  quote.viewed_at = ctx.now.toISOString();
  logActivity(
    draft,
    {
      client_id: quote.client_id,
      type: "quote_viewed",
      title: `Devis ${quote.reference} consulté par le client`,
      description: "Ouvert depuis l'espace client (portail).",
      actor_name: clientDisplayName(client),
      entity: { kind: "quote", id: quote.id },
    },
    ctx.now,
  );
  return true;
}

export const COMMENT_MAX_LENGTH = 1000;

export function addQuoteComment(draft: BatopsData, quoteId: string, text: string, ctx: MutationContext): boolean {
  const quote = draft.quotes.find((q) => q.id === quoteId);
  const client = quote && draft.clients.find((c) => c.id === quote.client_id);
  const clean = text.trim();
  if (!quote || !client || !isVisibleOnPortal(quote) || !clean || clean.length > COMMENT_MAX_LENGTH) return false;
  logActivity(
    draft,
    {
      client_id: quote.client_id,
      type: "quote_comment",
      title: `Remarque du client sur le devis ${quote.reference}`,
      description: clean,
      actor_name: clientDisplayName(client),
      entity: { kind: "quote", id: quote.id },
    },
    ctx.now,
  );
  return true;
}

export interface SignatureInput {
  quote_id: string;
  signer_name: string;
  /** Tracé manuscrit (data-URL image). */
  signature_data_url: string;
  /** « Bon pour accord » : lecture du devis et des conditions acceptée. */
  accepted_terms: boolean;
}

export type SignatureField = "quote" | "signer_name" | "signature" | "accepted_terms";

const SIGNATURE_MAX_BYTES = 300_000;

export function validateSignature(data: Pick<BatopsData, "quotes">, input: SignatureInput, now: Date): FieldErrors<SignatureField> {
  const errors: FieldErrors<SignatureField> = {};
  const quote = data.quotes.find((q) => q.id === input.quote_id);
  if (!quote) errors.quote = "Devis introuvable.";
  else if (quote.status === "accepte") errors.quote = "Ce devis est déjà signé.";
  else if (quote.status !== "envoye") errors.quote = "Ce devis n'est pas ouvert à la signature.";
  else if (getQuoteDisplayStatus(quote, now) === "expire") errors.quote = "Ce devis a expiré : demandez une mise à jour.";
  if (input.signer_name.trim().length < 2) errors.signer_name = "Indiquez vos nom et prénom.";
  if (!/^data:image\/(png|svg\+xml)/.test(input.signature_data_url) || input.signature_data_url.length > SIGNATURE_MAX_BYTES) {
    errors.signature = "Signez dans le cadre.";
  }
  if (!input.accepted_terms) errors.accepted_terms = "Cochez « Bon pour accord » pour signer.";
  return errors;
}

export interface SignatureResult {
  intervention_id: string;
  intervention_reference: string;
}

/**
 * Signature électronique : devis « signé », prospect devenu client et intervention préparée
 * (« À planifier ») avec les fournitures et la durée issues du devis.
 */
export function signQuote(draft: BatopsData, input: SignatureInput, ctx: MutationContext): SignatureResult | null {
  const quote = draft.quotes.find((q) => q.id === input.quote_id);
  const client = quote && draft.clients.find((c) => c.id === quote.client_id);
  if (!quote || !client || quote.status !== "envoye") return null;
  const signer = input.signer_name.trim();
  const at = ctx.now.toISOString();

  quote.status = "accepte";
  quote.signed_at = at;
  quote.signed_by_name = signer;
  quote.signature_data_url = input.signature_data_url;
  quote.updated_at = at;
  const deposit = quote.deposit_percent > 0 ? depositAmount(quote.total_ttc, quote.deposit_percent) : 0;
  logActivity(
    draft,
    {
      client_id: client.id,
      type: "quote_signed",
      title: `Devis ${quote.reference} signé`,
      description: `Signé électroniquement par ${signer} — ${formatEUR(quote.total_ttc)} TTC${deposit > 0 ? ` · acompte de ${quote.deposit_percent} % : ${formatEUR(deposit)}` : ""}.`,
      actor_name: signer,
      entity: { kind: "quote", id: quote.id },
    },
    ctx.now,
  );

  if (client.status === "prospect") {
    client.status = "client";
    logActivity(
      draft,
      {
        client_id: client.id,
        type: "client_converted",
        title: "Prospect converti en client",
        description: `Devis ${quote.reference} signé.`,
        actor_name: signer,
      },
      ctx.now,
    );
  }

  const plan = interventionPlanFromQuote(quote, draft.catalog);
  const id = createId("int");
  const intervention: Intervention = {
    id,
    organization_id: draft.organization.id,
    client_id: client.id,
    quote_id: quote.id,
    call_log_id: quote.call_log_id,
    equipment_id: quote.equipment_id,
    reference: takeReference(draft, "intervention", ctx.now),
    title: quote.title,
    type: plan.type,
    priority: "normale",
    status: "nouvelle",
    address: quote.site_address,
    postal_code: quote.site_postal_code,
    city: quote.site_city,
    duration_minutes: plan.duration_minutes,
    is_billable: true,
    description: [`Préparée à la signature du devis ${quote.reference}.`, quote.notes].filter(Boolean).join(" "),
    checklist: plan.checklist.map((label, index) => ({ id: `${id}_c${index + 1}`, label, checked: false })),
    parts_used: plan.parts.map((part, index) => ({ ...part, id: `${id}_q${index + 1}` })),
    created_at: at,
  };
  draft.interventions.push(intervention);
  logActivity(
    draft,
    {
      client_id: client.id,
      type: "intervention_created",
      title: `Intervention ${intervention.reference} créée`,
      description: `${INTERVENTION_TYPE_LABEL[intervention.type]} — ${intervention.title} · à planifier (devis ${quote.reference} signé).`,
      actor_name: "BATOPS (automatique)",
      entity: { kind: "intervention", id },
    },
    ctx.now,
  );
  return { intervention_id: id, intervention_reference: intervention.reference };
}

export interface RefusalInput {
  quote_id: string;
  reason: string;
  comment?: string;
}

export function validateRefusal(data: Pick<BatopsData, "quotes">, input: RefusalInput): FieldErrors<"quote" | "reason"> {
  const errors: FieldErrors<"quote" | "reason"> = {};
  const quote = data.quotes.find((q) => q.id === input.quote_id);
  if (!quote) errors.quote = "Devis introuvable.";
  else if (quote.status !== "envoye") errors.quote = "Ce devis n'attend plus de réponse.";
  if (!input.reason.trim()) errors.reason = "Choisissez un motif.";
  if ((input.comment?.length ?? 0) > COMMENT_MAX_LENGTH) errors.reason = "Précision trop longue.";
  return errors;
}

export function refuseQuote(draft: BatopsData, input: RefusalInput, ctx: MutationContext): boolean {
  const quote = draft.quotes.find((q) => q.id === input.quote_id);
  const client = quote && draft.clients.find((c) => c.id === quote.client_id);
  if (!quote || !client || quote.status !== "envoye") return false;
  const comment = input.comment?.trim();
  quote.status = "refuse";
  quote.refused_at = ctx.now.toISOString();
  quote.refusal_reason = comment ? `${input.reason.trim()} — ${comment}` : input.reason.trim();
  quote.updated_at = quote.refused_at;
  logActivity(
    draft,
    {
      client_id: client.id,
      type: "quote_refused",
      title: `Devis ${quote.reference} refusé`,
      description: quote.refusal_reason,
      actor_name: clientDisplayName(client),
      entity: { kind: "quote", id: quote.id },
    },
    ctx.now,
  );
  return true;
}
