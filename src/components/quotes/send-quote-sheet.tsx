"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ExternalLinkIcon, Loader2Icon, MailIcon, MessageSquareIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import type { MessageChannel, Quote } from "@/types/batops";
import { Button } from "@/components/ui/button";
import { SegmentedChoice } from "@/components/ui/segmented";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SuccessCheck } from "@/components/motion/success-check";
import { useActions, useBatops, useData } from "@/lib/store";
import { buildQuoteMessage, defaultChannelFor } from "@/lib/store/actions/quotes";
import { clientDisplayName } from "@/lib/domain/clients";
import { formatEUR } from "@/lib/domain/format";
import { DURATION, EASE_OUT, SPRING } from "@/lib/motion";
import { CopyLinkButton } from "./copy-link-button";

function highlightLink(body: string, link: string) {
  const parts = body.split(link);
  return parts.flatMap((part, index) =>
    index < parts.length - 1
      ? [
          part,
          <span key={index} className="rounded bg-blue-50 px-0.5 break-all text-primary underline decoration-blue-200 underline-offset-2">
            {link}
          </span>,
        ]
      : [part],
  );
}

/**
 * Envoi du devis : canal (e-mail / SMS), aperçu exact du message avec le lien du portail, envoi simulé (0 €).
 */
export function SendQuoteSheet({
  open,
  onOpenChange,
  quote,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: Quote;
  onSent?: () => void;
}) {
  const data = useData((d) => d);
  const userId = useBatops((s) => s.session.userId);
  const { sendQuote } = useActions();
  const client = data.clients.find((c) => c.id === quote.client_id);
  const [channel, setChannel] = useState<MessageChannel>(() => (client ? defaultChannelFor(client) : "sms"));
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [sentTo, setSentTo] = useState("");

  const message = useMemo(
    () =>
      state === "sent"
        ? null
        : buildQuoteMessage(data, quote.id, { origin: window.location.origin, channel, actorId: userId ?? undefined, now: new Date() }),
    [data, quote.id, channel, userId, state],
  );
  const [portalLink, setPortalLink] = useState("");
  const link = message?.link ?? portalLink;

  if (!client) return null;

  const send = async () => {
    if (!message) return;
    setState("sending");
    setPortalLink(message.link);
    const result = await sendQuote(quote.id, channel);
    if (!result.ok) {
      setState("idle");
      toast.error("Le devis n'a pas pu être envoyé.");
      return;
    }
    setSentTo(result.to ?? "");
    setState("sent");
    onSent?.();
    toast.success(`Devis ${quote.reference} envoyé`, {
      description: `${result.channel === "email" ? "E-mail" : "SMS"} à ${result.to} · simulation gratuite (mode démo)`,
      action: { label: "Ouvrir le portail", onClick: () => window.open(result.link, "_blank", "noopener") },
    });
  };

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) window.setTimeout(() => setState("idle"), 300);
  };

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent className="sm:w-[min(36rem,100%)]">
        <SheetHeader>
          <SheetTitle>Envoyer le devis {quote.reference}</SheetTitle>
          <SheetDescription>
            {clientDisplayName(client)} · {formatEUR(quote.total_ttc)} TTC — le client consulte et signe en ligne.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <AnimatePresence mode="wait" initial={false}>
            {state === "sent" ? (
              <motion.div
                key="sent"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: DURATION.slow, ease: EASE_OUT }}
                className="flex flex-col items-center py-8 text-center"
                role="status"
                data-testid="quote-sent"
              >
                <motion.span initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={SPRING.pop} className="flex size-16 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/60">
                  <SuccessCheck className="size-9" />
                </motion.span>
                <p className="mt-5 text-base font-semibold text-slate-900">Devis envoyé</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {channel === "email" ? "E-mail" : "SMS"} transmis à {sentTo} avec le lien de signature. Envoi simulé : aucun message réel n&apos;est parti (mode démo, 0 €).
                </p>
                <p className="mt-4 max-w-full rounded-md bg-slate-50 px-3 py-2 font-mono text-xs break-all text-slate-600">{link}</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <CopyLinkButton url={link} />
                  <Button asChild size="sm">
                    <a href={link} target="_blank" rel="noreferrer" data-testid="open-portal">
                      <ExternalLinkIcon />
                      Ouvrir le portail client
                    </a>
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -6 }} className="space-y-5">
                <div>
                  <p className="mb-1.5 text-sm font-medium text-slate-900">Canal</p>
                  {client.email ? (
                    <SegmentedChoice<MessageChannel>
                      name="Canal d'envoi"
                      value={channel}
                      onValueChange={setChannel}
                      options={[
                        { value: "email", label: "E-mail" },
                        { value: "sms", label: "SMS" },
                      ]}
                    />
                  ) : (
                    <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      Pas d&apos;e-mail sur la fiche : envoi par SMS au {client.phone}.
                    </p>
                  )}
                </div>

                {message ? (
                  <motion.div key={channel} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DURATION.base, ease: EASE_OUT }}>
                    <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-900">
                      {channel === "email" ? <MailIcon className="size-4 text-slate-400" /> : <MessageSquareIcon className="size-4 text-slate-400" />}
                      Aperçu du message
                    </p>
                    <div className="overflow-hidden rounded-lg border" data-testid="message-preview">
                      <dl className="space-y-0.5 border-b bg-slate-50/70 px-3 py-2 text-xs">
                        <div className="flex gap-2">
                          <dt className="w-12 text-muted-foreground">À</dt>
                          <dd className="font-medium text-slate-900">{message.to}</dd>
                        </div>
                        {message.subject ? (
                          <div className="flex gap-2">
                            <dt className="w-12 text-muted-foreground">Objet</dt>
                            <dd className="text-slate-900">{message.subject}</dd>
                          </div>
                        ) : null}
                      </dl>
                      <p className="px-3 py-3 text-sm whitespace-pre-line text-slate-700">{highlightLink(message.body, message.link)}</p>
                    </div>
                  </motion.div>
                ) : (
                  <p className="text-sm text-rose-600">Ce devis ne peut pas être envoyé (aucune ligne ou statut incompatible).</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Mode démo : l&apos;envoi est simulé par le MockNotificationProvider et journalisé dans BATOPS. Le lien ouvre le portail client dans ce navigateur.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </SheetBody>
        <SheetFooter>
          {state === "sent" ? (
            <Button variant="outline" onClick={() => close(false)}>
              Fermer
            </Button>
          ) : (
            <>
              {message ? <CopyLinkButton url={message.link} /> : null}
              <Button onClick={() => void send()} disabled={!message || state === "sending"} data-testid="confirm-send" className="min-w-[9.5rem]">
                <AnimatePresence mode="wait" initial={false}>
                  {state === "sending" ? (
                    <motion.span key="sending" className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Loader2Icon className="animate-spin" />
                      Envoi…
                    </motion.span>
                  ) : (
                    <motion.span key="idle" className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <SendIcon />
                      Envoyer le devis
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
