"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  BellRingIcon,
  CalendarClockIcon,
  ExternalLinkIcon,
  EyeIcon,
  FileSignatureIcon,
  FileXIcon,
  HistoryIcon,
  Loader2Icon,
  MessageSquareTextIcon,
  PackageIcon,
  ReceiptEuroIcon,
  WrenchIcon,
} from "lucide-react";
import type { BatopsData, Client, ClientActivity, Equipment, Intervention, Quote } from "@/types/batops";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActivityIcon } from "@/components/shared/activity-meta";
import { StatusBadge } from "@/components/shared/status-badge";
import { Reveal } from "@/components/motion/reveal";
import { SuccessCheck } from "@/components/motion/success-check";
import { useCurrentUser, useNow } from "@/lib/store";
import { can } from "@/lib/permissions";
import { diffInCalendarDays, toDate } from "@/lib/domain/dates";
import { formatDate, formatDateTime, formatDuration, formatRelativeTime } from "@/lib/domain/format";
import { INTERVENTION_STATUS, INTERVENTION_TYPE_LABEL } from "@/lib/domain/labels";
import type { DocumentTotals } from "@/lib/domain/money";
import { getQuoteDisplayStatus } from "@/lib/domain/status";
import { DURATION, EASE_OUT, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { A4Paper } from "./a4-paper";
import { CopyLinkButton } from "./copy-link-button";
import { QuoteDocument, type QuoteDocumentData } from "./quote-document";
import { QuoteMargin, QuoteTotals } from "./quote-summary";

function Panel({ title, icon: Icon, children, className, delay = 0, tone }: { title: string; icon: typeof EyeIcon; children: React.ReactNode; className?: string; delay?: number; tone?: "success" | "danger" }) {
  return (
    <Reveal delay={delay}>
      <section
        className={cn(
          "rounded-lg border bg-card p-4 shadow-xs",
          tone === "success" && "border-emerald-200 bg-emerald-50/30",
          tone === "danger" && "border-rose-200 bg-rose-50/30",
          className,
        )}
        aria-label={title}
      >
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Icon className="size-4 text-slate-400" />
          {title}
        </h2>
        {children}
      </section>
    </Reveal>
  );
}

export function QuoteDetailBody({
  quote,
  client,
  equipment,
  intervention,
  activities,
  comments,
  data,
  doc,
  totals,
  showMargins,
  canManage,
  portalLink,
  reminding,
  onRemind,
}: {
  quote: Quote;
  client: Client;
  equipment?: Equipment;
  intervention?: Intervention;
  activities: ClientActivity[];
  comments: ClientActivity[];
  data: BatopsData;
  doc: QuoteDocumentData;
  totals: DocumentTotals;
  showMargins: boolean;
  canManage: boolean;
  portalLink: string;
  reminding: boolean;
  onRemind: () => void;
}) {
  const now = useNow();
  const user = useCurrentUser();
  const canOpenInterventions = user ? can(user.role, "manage_interventions") : false;
  const status = getQuoteDisplayStatus(quote, now);
  const daysLeft = diffInCalendarDays(now, toDate(quote.valid_until));
  const tech = intervention?.assigned_technician_id ? data.users.find((u) => u.id === intervention.assigned_technician_id) : undefined;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.05 }}
        className="min-w-0 rounded-xl bg-slate-100/80 p-3 ring-1 ring-slate-200/70 sm:p-5"
      >
        <A4Paper>
          <QuoteDocument doc={doc} organization={data.organization} client={client} equipment={equipment} reveal />
        </A4Paper>
      </motion.div>

      <div className="space-y-4">
        {status === "accepte" && quote.signed_at ? (
          <Panel title="Devis signé" icon={FileSignatureIcon} tone="success" delay={0.08}>
            <div className="flex items-start gap-3" data-testid="signed-panel">
              <motion.span initial={{ scale: 0.5, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={SPRING.pop} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                <SuccessCheck className="size-6" />
              </motion.span>
              <div className="min-w-0 text-sm">
                <p className="font-medium text-slate-900">Signé par {quote.signed_by_name}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(quote.signed_at)} · signature électronique</p>
                {quote.signature_data_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signature en data-URL locale
                  <img src={quote.signature_data_url} alt={`Signature de ${quote.signed_by_name}`} className="mt-2 h-14 max-w-full rounded border bg-white object-contain p-1" />
                ) : null}
              </div>
            </div>
          </Panel>
        ) : null}

        {intervention ? (
          <Panel title="Intervention préparée" icon={WrenchIcon} delay={0.12}>
            <motion.div
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: DURATION.slow, ease: EASE_OUT, delay: 0.2 }}
              className="space-y-2 text-sm"
              data-testid="prepared-intervention"
            >
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-slate-500">{intervention.reference}</span>
                <StatusBadge meta={INTERVENTION_STATUS[intervention.status]} />
              </p>
              <p className="font-medium text-slate-900">{intervention.title}</p>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md bg-slate-50 px-2.5 py-1.5">
                  <dt className="text-muted-foreground">Type</dt>
                  <dd className="font-medium text-slate-900">{INTERVENTION_TYPE_LABEL[intervention.type]}</dd>
                </div>
                <div className="rounded-md bg-slate-50 px-2.5 py-1.5">
                  <dt className="text-muted-foreground">Durée estimée</dt>
                  <dd className="font-medium text-slate-900">{formatDuration(intervention.duration_minutes)}</dd>
                </div>
                <div className="rounded-md bg-slate-50 px-2.5 py-1.5">
                  <dt className="flex items-center gap-1 text-muted-foreground">
                    <PackageIcon className="size-3" /> Fournitures
                  </dt>
                  <dd className="font-medium text-slate-900">{intervention.parts_used.length} reprises du devis</dd>
                </div>
                <div className="rounded-md bg-slate-50 px-2.5 py-1.5">
                  <dt className="text-muted-foreground">Checklist</dt>
                  <dd className="font-medium text-slate-900">{intervention.checklist.length} points</dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">
                {intervention.scheduled_start
                  ? `Planifiée le ${formatDateTime(intervention.scheduled_start)}${tech ? ` avec ${tech.full_name}` : ""}.`
                  : "À planifier : elle attend dans la colonne « À planifier » du planning."}
              </p>
              {canOpenInterventions ? (
                <div className="flex flex-wrap gap-2">
                  {intervention.status === "nouvelle" ? (
                    <Button asChild size="sm" data-testid="quote-plan-intervention">
                      <Link href={`/planning?planifier=${intervention.id}`}>
                        <CalendarClockIcon />
                        Planifier
                      </Link>
                    </Button>
                  ) : null}
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/interventions/${intervention.id}`}>Ouvrir la fiche intervention</Link>
                  </Button>
                </div>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/clients/${client.id}`}>Voir la fiche client</Link>
                </Button>
              )}
            </motion.div>
          </Panel>
        ) : null}

        {status === "refuse" ? (
          <Panel title="Refusé par le client" icon={FileXIcon} tone="danger" delay={0.08}>
            <p className="text-sm text-slate-800" data-testid="refusal-reason">
              {quote.refusal_reason}
            </p>
            {quote.refused_at ? <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(quote.refused_at)} · depuis le portail client</p> : null}
          </Panel>
        ) : null}

        {status === "envoye" || status === "expire" ? (
          <Panel title="Suivi de l'envoi" icon={CalendarClockIcon} delay={0.08}>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Envoyé</dt>
                <dd className="text-slate-900">{quote.sent_at ? formatRelativeTime(quote.sent_at, now) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Consulté par le client</dt>
                <dd>
                  {quote.viewed_at ? (
                    <Badge tone="info">
                      <EyeIcon /> {formatRelativeTime(quote.viewed_at, now)}
                    </Badge>
                  ) : (
                    <span className="text-slate-500">pas encore</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Dernière relance</dt>
                <dd className="text-slate-900">{quote.last_reminder_at ? formatRelativeTime(quote.last_reminder_at, now) : "aucune"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Validité</dt>
                <dd className={cn("text-slate-900", daysLeft < 0 ? "text-rose-700" : daysLeft <= 7 ? "text-amber-700" : "")}>
                  {daysLeft < 0 ? `expiré le ${formatDate(quote.valid_until)}` : daysLeft === 0 ? "expire aujourd'hui" : `encore ${daysLeft} jour${daysLeft > 1 ? "s" : ""}`}
                </dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyLinkButton url={portalLink} />
              <Button asChild variant="outline" size="sm">
                <a href={portalLink} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon />
                  Portail
                </a>
              </Button>
              {canManage && status === "envoye" ? (
                <Button size="sm" variant="outline" onClick={onRemind} disabled={reminding} data-testid="remind-quote">
                  {reminding ? <Loader2Icon className="animate-spin" /> : <BellRingIcon />}
                  Relancer
                </Button>
              ) : null}
            </div>
          </Panel>
        ) : null}

        {comments.length > 0 ? (
          <Panel title={`Remarques du client (${comments.length})`} icon={MessageSquareTextIcon} delay={0.14}>
            <ul className="space-y-2" data-testid="quote-comments">
              {comments.map((comment) => (
                <li key={comment.id} className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm">
                  <p className="whitespace-pre-line text-slate-800">{comment.description}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {comment.actor_name} · {formatRelativeTime(comment.created_at, now)}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        <Panel title="Montants" icon={ReceiptEuroIcon} delay={0.18}>
          <QuoteTotals totals={totals} depositPercent={quote.deposit_percent} />
          {showMargins ? (
            <div className="mt-4 border-t pt-4">
              <QuoteMargin totals={totals} compact />
            </div>
          ) : null}
        </Panel>

        <Panel title="Historique du devis" icon={HistoryIcon} delay={0.22}>
          <ol className="space-y-2.5" data-testid="quote-history">
            {activities.map((activity, index) => (
              <motion.li
                key={activity.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: DURATION.base, ease: EASE_OUT, delay: 0.25 + index * 0.04 }}
                className="flex gap-2.5"
              >
                <ActivityIcon type={activity.type} className="size-6" />
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-slate-900">{activity.title}</p>
                  {activity.description && activity.type !== "quote_comment" ? <p className="text-xs text-slate-600">{activity.description}</p> : null}
                  <p className="text-[11px] text-muted-foreground">
                    {[activity.actor_name, formatRelativeTime(activity.created_at, now)].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </motion.li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}
