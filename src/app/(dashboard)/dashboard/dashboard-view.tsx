"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDownRightIcon, ArrowUpRightIcon, CalendarClockIcon, FileTextIcon, ReceiptTextIcon, WalletIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { ProgressBar } from "@/components/motion/progress-bar";
import { Reveal, Stagger } from "@/components/motion/reveal";
import { Swap } from "@/components/motion/swap";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { CashChart } from "@/components/dashboard/cash-chart";
import { TodaySchedule } from "@/components/dashboard/today-schedule";
import { UrgentActions } from "@/components/dashboard/urgent-actions";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { useCurrentUser, useData, useNow } from "@/lib/store";
import { selectInterventionsOfDay } from "@/lib/store/selectors";
import {
  selectCashSeries,
  selectDashboardKpis,
  selectInboundRequests,
  selectQuotesToRemind,
  selectReadyToInvoice,
  selectRecentActivities,
  selectToSchedule,
} from "@/lib/store/dashboard";
import { formatDateLong, formatEURCompact, formatPercent } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

function Panel({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border bg-card shadow-xs", className)}>
      <header className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {aside ? <div className="text-xs text-muted-foreground">{aside}</div> : null}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function TrendBadge({ percent, versus }: { percent: number | null; versus: string }) {
  if (percent === null) return <span>Pas de référence le mois précédent</span>;
  const up = percent >= 0;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge tone={up ? "success" : "danger"} className="tabular">
        {up ? <ArrowUpRightIcon /> : <ArrowDownRightIcon />}
        {up ? "+" : ""}
        {formatPercent(percent)}
      </Badge>
      vs {versus}
    </span>
  );
}

export function DashboardView() {
  const user = useCurrentUser();
  const data = useData((d) => d);
  const now = useNow();

  const view = useMemo(
    () => ({
      kpis: selectDashboardKpis(data, now),
      series: selectCashSeries(data, now),
      today: selectInterventionsOfDay(data, now),
      requests: selectInboundRequests(data),
      toSchedule: selectToSchedule(data),
      quotesToRemind: selectQuotesToRemind(data, now),
      readyToInvoice: selectReadyToInvoice(data),
      recent: selectRecentActivities(data, 8),
    }),
    [data, now],
  );
  const { kpis } = view;
  const firstName = user?.full_name.split(" ")[0] ?? "";
  const date = formatDateLong(now);

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          className="mb-0"
          title={`Bonjour ${firstName}`}
          description={
            <>
              {date.charAt(0).toUpperCase()}
              {date.slice(1)} —{" "}
              <Swap swapKey={kpis.todayTotal}>
                {kpis.todayTotal} intervention{kpis.todayTotal > 1 ? "s" : ""} prévue{kpis.todayTotal > 1 ? "s" : ""} aujourd&apos;hui
              </Swap>
              .
            </>
          }
        />
      </Reveal>

      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" interval={0.07} delay={0.05}>
        <KpiCard
          testId="kpi-cash"
          label={`CA encaissé · ${view.series.currentLabel}`}
          icon={WalletIcon}
          value={kpis.cashThisMonth}
          format={formatEURCompact}
          accent="success"
          detail={<TrendBadge percent={kpis.cashTrendPercent} versus={view.series.previousLabel} />}
          footer={<p className="text-xs text-muted-foreground">Paiements reçus depuis le 1er du mois, TTC.</p>}
        />
        <KpiCard
          testId="kpi-quotes"
          label="Devis en attente"
          icon={FileTextIcon}
          value={kpis.pendingQuotesCount}
          suffix={<span className="text-sm font-normal text-muted-foreground">devis</span>}
          detail={
            <span className="tabular">
              <AnimatedNumber value={kpis.pendingQuotesTotal} format={formatEURCompact} /> TTC en jeu
            </span>
          }
          footer={
            kpis.quotesToRemindCount > 0 ? (
              <Badge tone="warning">
                <Swap swapKey={kpis.quotesToRemindCount}>{kpis.quotesToRemindCount}</Swap> à relancer (&gt; 3 jours)
              </Badge>
            ) : (
              <Badge tone="success">Tous relancés récemment</Badge>
            )
          }
        />
        <KpiCard
          testId="kpi-today"
          label="Interventions du jour"
          icon={CalendarClockIcon}
          value={kpis.todayDone}
          suffix={<span className="text-base font-medium text-slate-400">/ {kpis.todayTotal}</span>}
          detail={kpis.todayOnSite > 0 ? `${kpis.todayOnSite} technicien(s) sur place` : "terminées"}
          footer={<ProgressBar value={kpis.todayDone} max={Math.max(kpis.todayTotal, 1)} tone="success" label="Interventions terminées aujourd'hui" />}
        />
        <KpiCard
          testId="kpi-overdue"
          label="Factures en retard"
          icon={ReceiptTextIcon}
          value={kpis.overdueTotal}
          format={formatEURCompact}
          accent={kpis.overdueCount > 0 ? "danger" : "success"}
          detail={kpis.overdueCount > 0 ? `${kpis.overdueCount} facture${kpis.overdueCount > 1 ? "s" : ""} à encaisser` : "Aucun retard de paiement"}
          footer={
            kpis.overdueCount > 0 ? <Badge tone="danger">Échéance dépassée</Badge> : <Badge tone="success">À jour</Badge>
          }
        />
      </Stagger>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Reveal delay={0.25}>
            <Panel
              title="Programme de la journée"
              aside={
                <span className="flex items-center gap-3">
                  <span className="tabular">
                    {kpis.todayDone}/{kpis.todayTotal} terminée{kpis.todayDone > 1 ? "s" : ""}
                  </span>
                  <Link href="/planning" className="font-medium text-primary hover:underline" data-testid="dashboard-planning-link">
                    Planning →
                  </Link>
                </span>
              }
            >
              <TodaySchedule interventions={view.today} clients={data.clients} users={data.users} />
            </Panel>
          </Reveal>
          <Reveal delay={0.35}>
            <Panel title="Encaissements cumulés" aside="TTC, par jour du mois">
              <CashChart series={view.series} />
            </Panel>
          </Reveal>
        </div>
        <div className="space-y-4">
          <Reveal delay={0.3}>
            <Panel title="Actions urgentes">
              <UrgentActions
                requests={view.requests}
                toSchedule={view.toSchedule}
                quotesToRemind={view.quotesToRemind}
                readyToInvoice={view.readyToInvoice}
                clients={data.clients}
              />
            </Panel>
          </Reveal>
          <Reveal delay={0.4}>
            <Panel title="Activité récente">
              <RecentActivity activities={view.recent} clients={data.clients} />
            </Panel>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
