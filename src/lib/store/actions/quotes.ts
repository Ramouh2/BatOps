/** Relance d'un devis envoyé (P0 : 1 clic, modèle pré-écrit ; l'automatisation arrive en P1). */
import type { BatopsData } from "@/types/batops";
import { clientContactName, clientDisplayName } from "@/lib/domain/clients";
import { diffInCalendarDays, toDate } from "@/lib/domain/dates";
import { formatEUR } from "@/lib/domain/format";
import { createId } from "@/lib/domain/ids";
import type { OutgoingMessage, SendResult } from "@/providers/notifications/notification.provider";
import { logActivity } from "../mutations";
import type { MutationContext } from "./context";

export function buildQuoteReminder(data: BatopsData, quoteId: string, now: Date): OutgoingMessage | null {
  const quote = data.quotes.find((q) => q.id === quoteId);
  const client = quote && data.clients.find((c) => c.id === quote.client_id);
  if (!quote || !client || quote.status !== "envoye") return null;
  const days = quote.sent_at ? diffInCalendarDays(toDate(quote.sent_at), now) : undefined;
  const greeting = client.type === "particulier" ? clientDisplayName(client) : clientContactName(client);
  const org = data.organization;
  const body = [
    `Bonjour ${greeting},`,
    `Nous revenons vers vous au sujet de notre devis ${quote.reference} « ${quote.title} » (${formatEUR(quote.total_ttc)} TTC)${days !== undefined ? `, envoyé il y a ${days} jour${days > 1 ? "s" : ""}` : ""}.`,
    "Avez-vous des questions ? Nous restons disponibles pour en discuter ou ajuster la proposition.",
    `Bien cordialement,\n${org.name} — ${org.phone ?? ""}`.trim(),
  ].join("\n\n");

  return client.email
    ? { channel: "email", to: client.email, subject: `Votre devis ${quote.reference} — ${org.name}`, body }
    : { channel: "sms", to: client.phone, body };
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
  logActivity(
    draft,
    {
      client_id: quote.client_id,
      type: "quote_reminder",
      title: `Relance du devis ${quote.reference}`,
      description:
        result.status === "echec"
          ? "Échec de l'envoi de la relance."
          : `${message.channel === "email" ? "E-mail" : "SMS"} de relance envoyé à ${message.to}${result.provider_mode === "mock" ? " (simulation, mode démo)" : ""}.`,
      actor_name: ctx.actor,
      entity: { kind: "quote", id: quote.id },
      created_at: result.sent_at,
    },
    ctx.now,
  );
  return true;
}
