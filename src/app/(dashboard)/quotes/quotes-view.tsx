"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  CheckCheckIcon,
  EyeIcon,
  FilePenLineIcon,
  FileTextIcon,
  HourglassIcon,
  PercentIcon,
  PlusIcon,
  SearchIcon,
  SearchXIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedTabs } from "@/components/ui/segmented";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Reveal, Stagger } from "@/components/motion/reveal";
import { Swap } from "@/components/motion/swap";
import { ClientAvatar } from "@/components/crm/client-avatar";
import { useCurrentUser, useData, useNow } from "@/lib/store";
import { countQuoteTabs, filterQuoteRows, selectQuoteKpis, selectQuoteRows, type QuoteRow, type QuoteTab } from "@/lib/store/quote-selectors";
import { can } from "@/lib/permissions";
import { marginLevel } from "@/lib/domain/catalog";
import { formatDate, formatEUR, formatEURCompact, formatPercent, formatRelativeTime } from "@/lib/domain/format";
import { QUOTE_STATUS } from "@/lib/domain/labels";
import { DURATION, EASE_OUT, listItem, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

const TABS: { value: QuoteTab; label: string }[] = [
  { value: "tous", label: "Tous" },
  { value: "brouillons", label: "Brouillons" },
  { value: "envoyes", label: "En attente" },
  { value: "signes", label: "Signés" },
  { value: "clos", label: "Refusés & expirés" },
];

const TONE_TEXT = { danger: "text-rose-600", warning: "text-amber-600", info: "text-blue-600", success: "text-emerald-600" } as const;
const GRID_OWNER = "md:grid-cols-[7.5rem_minmax(0,2fr)_minmax(0,1.6fr)_7rem_7.5rem_5rem]";
const GRID = "md:grid-cols-[7.5rem_minmax(0,2fr)_minmax(0,1.6fr)_7rem_7.5rem]";

function isTab(value: string | null): value is QuoteTab {
  return TABS.some((t) => t.value === value);
}

function QuoteRowItem({ row, now, showMargins }: { row: QuoteRow; now: Date; showMargins: boolean }) {
  const { quote } = row;
  const status = QUOTE_STATUS[row.status];
  const level = marginLevel(row.marginPercent, quote.estimated_margin_ht);
  const hint =
    row.status === "brouillon"
      ? `modifié ${formatRelativeTime(quote.updated_at ?? quote.created_at, now)}`
      : row.status === "accepte" && quote.signed_at
        ? `signé ${formatRelativeTime(quote.signed_at, now)}`
        : row.status === "refuse" && quote.refused_at
          ? `refusé ${formatRelativeTime(quote.refused_at, now)}`
          : row.status === "expire"
            ? `expiré le ${formatDate(quote.valid_until)}`
            : quote.sent_at
              ? `envoyé ${formatRelativeTime(quote.last_reminder_at ?? quote.sent_at, now)}${quote.last_reminder_at ? " (relance)" : ""}`
              : "";

  return (
    <motion.li
      layout
      variants={listItem}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={SPRING.layout}
      className={cn("group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-slate-50/80", showMargins ? GRID_OWNER : GRID)}
      data-testid={`quote-row-${quote.reference}`}
    >
      <div className="relative hidden md:block">
        <span className="font-mono text-xs text-slate-500">{quote.reference}</span>
        <p className="text-[11px] text-muted-foreground">{formatDate(quote.issue_date)}</p>
      </div>
      <div className="relative min-w-0">
        <Link
          href={`/quotes/${quote.id}`}
          className="block truncate text-sm font-medium text-slate-900 outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-primary focus-visible:after:rounded-md focus-visible:after:ring-[3px] focus-visible:after:ring-ring/40"
        >
          {quote.title || "Devis sans objet"}
        </Link>
        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <span className="font-mono md:hidden">{quote.reference} ·</span>
          {quote.ai_generated ? (
            <span className="inline-flex items-center gap-0.5 text-amber-700">
              <SparklesIcon className="size-3" /> IA
            </span>
          ) : null}
          {hint}
          {row.status === "envoye" && quote.viewed_at ? (
            <span className="inline-flex items-center gap-0.5 text-blue-700">
              · <EyeIcon className="size-3" /> consulté
            </span>
          ) : null}
        </p>
      </div>
      <div className="relative hidden min-w-0 items-center gap-2 md:flex">
        {row.client ? <ClientAvatar client={row.client} className="size-7" /> : null}
        <span className="truncate text-sm text-slate-700">{row.clientName}</span>
      </div>
      <div className="relative flex justify-end md:justify-start">
        <Badge tone={status.tone}>
          <Swap swapKey={row.status}>{status.label}</Swap>
        </Badge>
      </div>
      <p className="relative hidden text-right text-sm font-semibold text-slate-900 tabular md:block">{formatEUR(quote.total_ttc)}</p>
      {showMargins ? (
        <p className={cn("relative hidden text-right text-sm tabular md:block", quote.total_ht > 0 ? TONE_TEXT[level.tone] : "text-slate-400")}>
          {quote.total_ht > 0 ? formatPercent(row.marginPercent) : "—"}
        </p>
      ) : null}
    </motion.li>
  );
}

export function QuotesView() {
  const data = useData((d) => d);
  const now = useNow();
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: QuoteTab = isTab(tabParam) ? tabParam : "tous";
  const [query, setQuery] = useState("");

  const canManage = user ? can(user.role, "manage_quotes") : false;
  const showMargins = user ? can(user.role, "view_margins") : false;
  const rows = useMemo(() => selectQuoteRows(data, now), [data, now]);
  const counts = useMemo(() => countQuoteTabs(rows), [rows]);
  const visible = useMemo(() => filterQuoteRows(rows, tab, query), [rows, tab, query]);
  const kpis = useMemo(() => selectQuoteKpis(data, now), [data, now]);

  const setTab = (value: QuoteTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "tous") params.delete("tab");
    else params.set("tab", value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <>
      <Reveal>
        <PageHeader
          title="Devis"
          description={
            <>
              <Swap swapKey={kpis.pendingCount}>{kpis.pendingCount}</Swap> en attente de signature ·{" "}
              <Swap swapKey={kpis.draftsCount}>{kpis.draftsCount}</Swap> brouillon{kpis.draftsCount > 1 ? "s" : ""}
            </>
          }
          actions={
            canManage ? (
              <Button asChild>
                <Link href="/quotes/new" data-testid="new-quote">
                  <PlusIcon />
                  Nouveau devis
                </Link>
              </Button>
            ) : null
          }
        />
      </Reveal>

      <Stagger className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" delay={0.05}>
        <KpiCard
          label="En attente de signature"
          icon={HourglassIcon}
          value={kpis.pendingTotalTtc}
          format={formatEURCompact}
          detail={`${kpis.pendingCount} devis envoyé${kpis.pendingCount > 1 ? "s" : ""} (TTC)`}
          testId="quotes-kpi-pending"
        />
        <KpiCard
          label="Signés ce mois-ci"
          icon={CheckCheckIcon}
          value={kpis.signedThisMonthTotalHt}
          format={formatEURCompact}
          detail={`${kpis.signedThisMonthCount} devis · montant HT`}
          accent="success"
          testId="quotes-kpi-signed"
        />
        <KpiCard
          label="Taux de signature"
          icon={PercentIcon}
          value={kpis.signatureRate}
          format={(v) => formatPercent(v)}
          detail="devis signés / devis envoyés"
          accent="primary"
        />
        <KpiCard
          label="Brouillons"
          icon={FilePenLineIcon}
          value={kpis.draftsCount}
          detail={kpis.draftsCount > 0 ? `${formatEUR(kpis.draftsTotalTtc)} TTC à envoyer` : "Rien en attente d'envoi"}
          accent="warning"
        />
      </Stagger>

      <Reveal delay={0.1} className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SegmentedTabs
          label="Filtrer les devis"
          value={tab}
          onValueChange={setTab}
          items={TABS.map((t) => ({
            value: t.value,
            label: t.label,
            suffix: (
              <span className="rounded-full bg-slate-200/70 px-1.5 text-[11px] font-semibold text-slate-600 tabular">
                <Swap swapKey={counts[t.value]}>{counts[t.value]}</Swap>
              </span>
            ),
          }))}
        />
        <div className="relative w-full lg:w-72">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Référence, client, objet…" aria-label="Rechercher un devis" className="pr-9 pl-9" />
          <AnimatePresence>
            {query ? (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: DURATION.fast, ease: EASE_OUT }}
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Effacer la recherche"
              >
                <XIcon className="size-3.5" />
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>
      </Reveal>

      <Reveal delay={0.16}>
        <section className="overflow-hidden rounded-lg border bg-card shadow-xs" aria-label="Liste des devis">
          <div className={cn("hidden gap-4 border-b bg-slate-50/70 px-4 py-2 text-xs font-medium text-muted-foreground md:grid", showMargins ? GRID_OWNER : GRID)} aria-hidden="true">
            <span>Référence</span>
            <span>Objet</span>
            <span>Client</span>
            <span>Statut</span>
            <span className="text-right">Montant TTC</span>
            {showMargins ? <span className="text-right">Marge</span> : null}
          </div>
          <AnimatePresence mode="popLayout" initial={false}>
            {visible.length === 0 ? (
              <motion.div key={`empty-${tab}-${query ? "q" : ""}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {query ? (
                  <EmptyState icon={SearchXIcon} title={`Aucun devis pour « ${query} »`} description="Cherchez par référence (DEV-…), client, ville ou objet." />
                ) : (
                  <EmptyState
                    icon={FileTextIcon}
                    title={tab === "brouillons" ? "Aucun brouillon" : "Aucun devis dans cette vue"}
                    description={canManage ? "Créez un devis en 2 minutes avec l'assistant IA : il ne propose que les prix de votre catalogue." : undefined}
                    action={
                      canManage ? (
                        <Button asChild size="sm">
                          <Link href="/quotes/new">
                            <PlusIcon />
                            Nouveau devis
                          </Link>
                        </Button>
                      ) : undefined
                    }
                  />
                )}
              </motion.div>
            ) : (
              <motion.ul key="list" className="divide-y" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <AnimatePresence mode="popLayout" initial={false}>
                  {visible.map((row) => (
                    <QuoteRowItem key={row.quote.id} row={row} now={now} showMargins={showMargins} />
                  ))}
                </AnimatePresence>
              </motion.ul>
            )}
          </AnimatePresence>
        </section>
      </Reveal>
    </>
  );
}
