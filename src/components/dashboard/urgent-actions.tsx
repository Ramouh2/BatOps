"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { BellRingIcon, ChevronRightIcon, CircleCheckIcon, Loader2Icon, PhoneIncomingIcon, ReceiptTextIcon } from "lucide-react";
import { toast } from "sonner";
import type { Client, Intervention, Quote } from "@/types/batops";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SuccessCheck } from "@/components/motion/success-check";
import { Swap } from "@/components/motion/swap";
import { useActions, useNow } from "@/lib/store";
import type { InboundRequest } from "@/lib/store/dashboard";
import { clientDisplayName } from "@/lib/domain/clients";
import { formatEUR, formatRelativeDay, formatRelativeTime } from "@/lib/domain/format";
import { CALL_STATUS, URGENCY } from "@/lib/domain/labels";
import { daysSinceLastQuoteContact } from "@/lib/domain/status";
import { DURATION, EASE_OUT, listItem, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

function Group({ icon: Icon, title, count, children, empty }: { icon: typeof BellRingIcon; title: string; count: number; children: ReactNode; empty: string }) {
  return (
    <section className="py-4 first:pt-0 last:pb-0">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        <Icon className="size-3.5" />
        {title}
        <span className="ml-auto rounded-full bg-slate-100 px-1.5 py-px text-[11px] text-slate-600 tabular">
          <Swap swapKey={count}>{count}</Swap>
        </span>
      </h3>
      <AnimatePresence initial={false} mode="popLayout">
        {count === 0 ? (
          <motion.p
            key="empty"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 rounded-md bg-emerald-50/60 px-3 py-2 text-sm text-emerald-800"
          >
            <CircleCheckIcon className="size-4" />
            {empty}
          </motion.p>
        ) : null}
      </AnimatePresence>
      <motion.ul layout className="space-y-1">
        <AnimatePresence initial={false} mode="popLayout">
          {children}
        </AnimatePresence>
      </motion.ul>
    </section>
  );
}

const itemClass =
  "group -mx-2 flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-slate-50 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none";

type ReminderState = "sending" | "sent";

/** Actions urgentes : demandes entrantes, devis à relancer (1 clic), interventions à facturer. */
export function UrgentActions({
  requests,
  quotesToRemind,
  readyToInvoice,
  clients,
}: {
  requests: InboundRequest[];
  quotesToRemind: Quote[];
  readyToInvoice: Intervention[];
  clients: Client[];
}) {
  const now = useNow();
  const { sendQuoteReminder } = useActions();
  // Un devis relancé quitte la liste du store : on le garde affiché le temps de montrer la confirmation.
  const [pinned, setPinned] = useState<{ quote: Quote; index: number; state: ReminderState }[]>([]);
  const clientName = (id?: string) => {
    const client = clients.find((c) => c.id === id);
    return client ? clientDisplayName(client) : "Client";
  };

  const displayedQuotes = (() => {
    const list: { quote: Quote; state?: ReminderState }[] = quotesToRemind
      .filter((q) => !pinned.some((p) => p.quote.id === q.id))
      .map((quote) => ({ quote }));
    for (const p of [...pinned].sort((a, b) => a.index - b.index)) {
      list.splice(Math.min(p.index, list.length), 0, { quote: p.quote, state: p.state });
    }
    return list;
  })();

  const remind = async (quote: Quote, index: number) => {
    setPinned((current) => [...current, { quote, index, state: "sending" }]);
    const result = await sendQuoteReminder(quote.id);
    if (result.ok) {
      setPinned((current) => current.map((p) => (p.quote.id === quote.id ? { ...p, state: "sent" } : p)));
      toast.success(`Relance envoyée — ${quote.reference}`, {
        description: `${result.channel === "email" ? "E-mail" : "SMS"} à ${result.to} avec le lien du portail · simulation gratuite (mode démo)`,
      });
      window.setTimeout(() => setPinned((current) => current.filter((p) => p.quote.id !== quote.id)), 1400);
    } else {
      setPinned((current) => current.filter((p) => p.quote.id !== quote.id));
      toast.error("La relance n'a pas pu être envoyée.");
    }
  };

  return (
    <div className="divide-y">
      <Group icon={PhoneIncomingIcon} title="Demandes à traiter" count={requests.length} empty="Toutes les demandes sont traitées.">
        {requests.map((request) => (
          <motion.li key={request.id} layout variants={listItem} initial="initial" animate="animate" exit="exit" transition={SPRING.layout}>
            <Link href={request.client_id ? `/clients/${request.client_id}` : "/clients"} className={itemClass}>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <span className="truncate group-hover:text-primary">{request.name}</span>
                  {request.urgency === "urgente" || request.urgency === "haute" ? (
                    <Badge tone={URGENCY[request.urgency].tone}>{URGENCY[request.urgency].label}</Badge>
                  ) : null}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{request.summary}</p>
                <p className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                  {request.status === "nouveau" ? (
                    <Badge tone="info">Nouveau prospect</Badge>
                  ) : (
                    <Badge tone={CALL_STATUS[request.status].tone}>{CALL_STATUS[request.status].label}</Badge>
                  )}
                  {formatRelativeTime(request.created_at, now)}
                </p>
              </div>
              <ChevronRightIcon className="mt-1 size-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
            </Link>
          </motion.li>
        ))}
      </Group>

      <Group icon={BellRingIcon} title="Devis à relancer" count={quotesToRemind.length} empty="Aucun devis en attente depuis plus de 3 jours.">
        {displayedQuotes.map(({ quote, state }, index) => {
          const days = daysSinceLastQuoteContact(quote, now);
          return (
            <motion.li
              key={quote.id}
              layout
              variants={listItem}
              initial="initial"
              animate="animate"
              exit={{ opacity: 0, x: 24, transition: { duration: DURATION.base, ease: EASE_OUT } }}
              transition={SPRING.layout}
              className={cn("-mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors", state === "sent" && "bg-emerald-50/70")}
            >
              <Link href={`/quotes/${quote.id}`} className="group min-w-0 flex-1 focus-visible:outline-none">
                <p className="truncate text-sm font-medium text-slate-900 group-hover:text-primary">{clientName(quote.client_id)}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  <span className="font-mono">{quote.reference}</span> · {formatEUR(quote.total_ttc)} TTC
                  {days !== undefined ? ` · ${quote.last_reminder_at ? "relancé" : "envoyé"} ${formatRelativeDay(quote.last_reminder_at ?? quote.sent_at!, now)}` : ""}
                </p>
              </Link>
              <Button
                size="sm"
                variant={state === "sent" ? "ghost" : "outline"}
                disabled={state !== undefined}
                onClick={() => void remind(quote, index)}
                aria-label={`Relancer le devis ${quote.reference}`}
                className="min-w-[6.5rem]"
              >
                <AnimatePresence mode="wait" initial={false}>
                  {state === "sending" ? (
                    <motion.span key="sending" className="flex items-center gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Loader2Icon className="animate-spin" /> Envoi…
                    </motion.span>
                  ) : state === "sent" ? (
                    <motion.span key="sent" className="flex items-center gap-1.5 text-emerald-700" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                      <SuccessCheck /> Relancé
                    </motion.span>
                  ) : (
                    <motion.span key="idle" className="flex items-center gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <BellRingIcon /> Relancer
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
            </motion.li>
          );
        })}
      </Group>

      <Group icon={ReceiptTextIcon} title="Terminées, à facturer" count={readyToInvoice.length} empty="Toutes les interventions terminées sont facturées.">
        {readyToInvoice.map((job) => (
          <motion.li key={job.id} layout variants={listItem} initial="initial" animate="animate" exit="exit" transition={SPRING.layout}>
            <Link href={`/clients/${job.client_id}`} className={itemClass}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900 group-hover:text-primary">{clientName(job.client_id)}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  <span className="font-mono">{job.reference}</span> · {job.title}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">Terminée {job.actual_end ? formatRelativeTime(job.actual_end, now) : ""}</p>
              </div>
              <ChevronRightIcon className="mt-1 size-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
            </Link>
          </motion.li>
        ))}
      </Group>
    </div>
  );
}
