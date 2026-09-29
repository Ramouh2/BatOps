"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  CalendarClockIcon,
  CalendarDaysIcon,
  CalendarRangeIcon,
  InboxIcon,
  PlusIcon,
  ReceiptTextIcon,
  RotateCcwIcon,
  SearchIcon,
  SearchXIcon,
  SnowflakeIcon,
  TriangleAlertIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import type { Intervention } from "@/types/batops";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedTabs } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { UserAvatar } from "@/components/shared/user-avatar";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Reveal, Stagger } from "@/components/motion/reveal";
import { Swap } from "@/components/motion/swap";
import { ClientAvatar } from "@/components/crm/client-avatar";
import { PlanSheet } from "@/components/interventions/plan-sheet";
import { InterventionFormSheet } from "@/components/interventions/intervention-form-sheet";
import { useCurrentUser, useData, useNow } from "@/lib/store";
import {
  countInterventionTabs,
  filterInterventionRows,
  selectInterventionRows,
  selectPlanningKpis,
  type InterventionTab,
  type PlanningItem,
} from "@/lib/store/planning-selectors";
import { selectTechnicians } from "@/lib/store/selectors";
import { can } from "@/lib/permissions";
import { isSameDay, toDate } from "@/lib/domain/dates";
import { startOfWeek } from "@/lib/domain/planning";
import { isReadyToInvoice } from "@/lib/domain/status";
import { formatDate, formatDuration, formatRelativeDay, formatTime } from "@/lib/domain/format";
import { INTERVENTION_STATUS, INTERVENTION_TYPE_LABEL, PRIORITY } from "@/lib/domain/labels";
import { DURATION, EASE_OUT, listItem, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

const TABS: { value: InterventionTab; label: string }[] = [
  { value: "toutes", label: "Toutes" },
  { value: "a_planifier", label: "À planifier" },
  { value: "planifiees", label: "Planifiées" },
  { value: "en_cours", label: "En cours" },
  { value: "terminees", label: "Terminées" },
  { value: "annulees", label: "Annulées" },
];

const ALL = "__all";
const GRID = "md:grid-cols-[7rem_minmax(0,2fr)_minmax(0,1.5fr)_8.5rem_2.5rem_7.5rem]";

function isTab(value: string | null): value is InterventionTab {
  return TABS.some((t) => t.value === value);
}

/** Créneau lisible : « Aujourd'hui 14:00 », « mer. 30 sept. 08:00 », ou l'état « À planifier ». */
function SlotCell({ intervention, now }: { intervention: Intervention; now: Date }) {
  const start = intervention.actual_start ?? intervention.scheduled_start;
  if (!start) {
    return <span className="text-xs font-medium text-amber-700">À planifier · {formatDuration(intervention.duration_minutes)}</span>;
  }
  const date = toDate(start);
  const relative = formatRelativeDay(date, now);
  const dayLabel = Math.abs((date.getTime() - now.getTime()) / 86_400_000) < 2 ? relative.charAt(0).toUpperCase() + relative.slice(1) : formatDate(date);
  return (
    <span className="text-xs text-slate-600 tabular">
      <span className={cn("block font-medium", isSameDay(date, now) ? "text-primary" : "text-slate-900")}>{dayLabel}</span>
      {formatTime(date)}
      {intervention.scheduled_end && !intervention.actual_start ? ` – ${formatTime(intervention.scheduled_end)}` : ""}
      {intervention.scheduled_end && !isSameDay(date, toDate(intervention.scheduled_end)) ? ` (${formatDate(intervention.scheduled_end)})` : ""}
    </span>
  );
}

function InterventionRowItem({
  row,
  now,
  readyToInvoice,
  canPlan,
  fresh,
  onPlan,
}: {
  row: PlanningItem;
  now: Date;
  readyToInvoice: boolean;
  canPlan: boolean;
  fresh: boolean;
  onPlan: () => void;
}) {
  const { intervention } = row;
  const status = INTERVENTION_STATUS[intervention.status];
  return (
    <motion.li
      layout
      variants={listItem}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={SPRING.layout}
      className={cn("group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 transition-colors hover:bg-slate-50/80", GRID)}
      data-testid={`intervention-row-${intervention.reference}`}
    >
      {fresh ? (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-blue-50"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.4, delay: 0.2, ease: "easeOut" }}
        />
      ) : null}
      <div className="relative hidden md:block">
        <span className="font-mono text-xs text-slate-500">{intervention.reference}</span>
        <p className="text-[11px] text-muted-foreground">{INTERVENTION_TYPE_LABEL[intervention.type]}</p>
      </div>
      <div className="relative min-w-0">
        <Link
          href={`/interventions/${intervention.id}`}
          className="block truncate text-sm font-medium text-slate-900 outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-primary focus-visible:after:rounded-md focus-visible:after:ring-[3px] focus-visible:after:ring-ring/40"
        >
          {intervention.title}
        </Link>
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <span className="font-mono md:hidden">{intervention.reference} ·</span>
          {intervention.priority !== "normale" ? (
            <span className={cn("font-medium", intervention.priority === "urgente" ? "text-rose-700" : "text-amber-700")}>{PRIORITY[intervention.priority].label} ·</span>
          ) : null}
          <span className="truncate">{row.source.label}</span>
          {row.needsRefrigerant ? (
            <span className="inline-flex items-center gap-0.5 text-sky-700" title="Manipulation de fluide frigorigène : technicien frigoriste requis">
              · <SnowflakeIcon className="size-3" /> frigoriste
            </span>
          ) : null}
          {row.conflicts.length ? (
            <span className="inline-flex items-center gap-0.5 font-medium text-rose-700" data-testid="row-conflict">
              · <TriangleAlertIcon className="size-3" /> {row.conflicts.length > 1 ? `${row.conflicts.length} conflits` : "conflit"}
            </span>
          ) : null}
        </p>
      </div>
      <div className="relative hidden min-w-0 items-center gap-2 md:flex">
        {row.client ? <ClientAvatar client={row.client} className="size-7" /> : null}
        <span className="min-w-0">
          <span className="block truncate text-sm text-slate-700">{row.clientName}</span>
          <span className="block truncate text-xs text-muted-foreground">{intervention.site_label ? `${intervention.site_label} · ` : ""}{intervention.city}</span>
        </span>
      </div>
      <div className="relative col-start-1 flex items-center gap-2 md:col-start-auto md:block">
        {intervention.status === "nouvelle" && canPlan ? (
          <Button size="sm" variant="outline" className="relative z-10 h-8" onClick={onPlan} data-testid="row-plan">
            <CalendarClockIcon />
            Planifier
          </Button>
        ) : (
          <SlotCell intervention={intervention} now={now} />
        )}
      </div>
      <div className="relative hidden md:block">
        {row.technician ? (
          <span title={row.technician.full_name}>
            <UserAvatar user={row.technician} />
          </span>
        ) : (
          <span className="flex size-7 items-center justify-center rounded-full border border-dashed text-slate-300" title="Non affectée">
            ?
          </span>
        )}
      </div>
      <div className="relative col-start-2 row-start-1 flex flex-col items-end gap-1 md:col-start-auto md:row-start-auto md:items-start">
        <Badge tone={status.tone}>
          <Swap swapKey={intervention.status}>{status.label}</Swap>
        </Badge>
        {readyToInvoice ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
            <ReceiptTextIcon className="size-3" /> À facturer
          </span>
        ) : null}
      </div>
    </motion.li>
  );
}

export function InterventionsView() {
  const data = useData((d) => d);
  const now = useNow();
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: InterventionTab = isTab(tabParam) ? tabParam : "toutes";
  const [query, setQuery] = useState("");
  const [type, setType] = useState<Intervention["type"] | undefined>();
  const [priority, setPriority] = useState<Intervention["priority"] | undefined>();
  const [technicianId, setTechnicianId] = useState<string | undefined>();
  const [planId, setPlanId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [freshId, setFreshId] = useState<string | null>(null);

  const canManage = user ? can(user.role, "manage_interventions") : false;
  const canPlan = user ? can(user.role, "manage_planning") : false;
  const rows = useMemo(() => selectInterventionRows(data), [data]);
  const counts = useMemo(() => countInterventionTabs(rows), [rows]);
  const visible = useMemo(() => filterInterventionRows(rows, { tab, query, type, priority, technicianId }), [rows, tab, query, type, priority, technicianId]);
  const kpis = useMemo(() => selectPlanningKpis(rows.filter((r) => r.intervention.status !== "annulee"), now, startOfWeek(now)), [rows, now]);
  const technicians = useMemo(() => selectTechnicians(data), [data]);
  const readyIds = useMemo(() => new Set(data.interventions.filter((i) => isReadyToInvoice(i, data.invoices)).map((i) => i.id)), [data.interventions, data.invoices]);
  const filtered = Boolean(type || priority || technicianId);

  // Ouverture directe depuis la palette de commandes : `?nouvelle=1`.
  const newParam = searchParams.get("nouvelle");
  useEffect(() => {
    if (newParam === "1") setCreateOpen(true);
  }, [newParam]);

  const setTab = (value: InterventionTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "toutes") params.delete("tab");
    else params.set("tab", value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const resetFilters = () => {
    setType(undefined);
    setPriority(undefined);
    setTechnicianId(undefined);
  };
  const markFresh = (id: string) => {
    setFreshId(id);
    window.setTimeout(() => setFreshId((current) => (current === id ? null : current)), 1800);
  };

  return (
    <>
      <Reveal>
        <PageHeader
          title="Interventions"
          description={
            <>
              <Swap swapKey={kpis.toSchedule}>{kpis.toSchedule}</Swap> à planifier · <Swap swapKey={kpis.today}>{kpis.today}</Swap> aujourd&apos;hui ·{" "}
              <Swap swapKey={readyIds.size}>{readyIds.size}</Swap> prête{readyIds.size > 1 ? "s" : ""} à facturer
            </>
          }
          actions={
            <div className="flex flex-wrap gap-2">
              {canPlan ? (
                <Button asChild variant="outline">
                  <Link href="/planning">
                    <CalendarDaysIcon />
                    Planning
                  </Link>
                </Button>
              ) : null}
              {canManage ? (
                <Button onClick={() => setCreateOpen(true)} data-testid="new-intervention">
                  <PlusIcon />
                  Nouvelle intervention
                </Button>
              ) : null}
            </div>
          }
        />
      </Reveal>

      <Stagger className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" delay={0.05}>
        <KpiCard
          label="À planifier"
          icon={InboxIcon}
          value={kpis.toSchedule}
          detail={kpis.urgentToSchedule > 0 ? `dont ${kpis.urgentToSchedule} urgente${kpis.urgentToSchedule > 1 ? "s" : ""}` : "Devis signés, appels, contrats"}
          accent="warning"
          testId="interventions-kpi-to-schedule"
        />
        <KpiCard label="Aujourd'hui" icon={CalendarClockIcon} value={kpis.today} detail="interventions sur le terrain" accent="primary" testId="interventions-kpi-today" />
        <KpiCard label="Cette semaine" icon={CalendarRangeIcon} value={kpis.week} detail="créneaux planifiés ou réalisés" accent="success" />
        <KpiCard
          label="Conflits"
          icon={TriangleAlertIcon}
          value={kpis.conflicts}
          detail={kpis.conflicts > 0 ? "chevauchement ou compétence à revoir" : "Aucun chevauchement"}
          accent={kpis.conflicts > 0 ? "danger" : "success"}
          testId="interventions-kpi-conflicts"
        />
      </Stagger>

      <Reveal delay={0.1} className="mb-3">
        <SegmentedTabs
          label="Filtrer les interventions par statut"
          value={tab}
          onValueChange={setTab}
          items={TABS.map((t) => ({
            value: t.value,
            label: t.label,
            suffix: (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] font-semibold tabular",
                  t.value === "a_planifier" && counts.a_planifier > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-200/70 text-slate-600",
                )}
              >
                <Swap swapKey={counts[t.value]}>{counts[t.value]}</Swap>
              </span>
            ),
          }))}
        />
      </Reveal>

      <Reveal delay={0.14} className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative w-full lg:w-72">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Référence, client, ville, objet…" aria-label="Rechercher une intervention" className="pr-9 pl-9" />
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
        <div className="grid grid-cols-3 gap-2 lg:flex">
          <Select value={type ?? ALL} onValueChange={(v) => setType(v === ALL ? undefined : (v as Intervention["type"]))}>
            <SelectTrigger className="lg:w-40" aria-label="Type d'intervention" data-testid="filter-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tous les types</SelectItem>
              {(Object.keys(INTERVENTION_TYPE_LABEL) as Intervention["type"][]).map((t) => (
                <SelectItem key={t} value={t}>
                  {INTERVENTION_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priority ?? ALL} onValueChange={(v) => setPriority(v === ALL ? undefined : (v as Intervention["priority"]))}>
            <SelectTrigger className="lg:w-40" aria-label="Priorité" data-testid="filter-priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Toutes priorités</SelectItem>
              {(Object.keys(PRIORITY) as Intervention["priority"][]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY[p].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={technicianId ?? ALL} onValueChange={(v) => setTechnicianId(v === ALL ? undefined : v)}>
            <SelectTrigger className="lg:w-44" aria-label="Technicien" data-testid="filter-technician">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tous les techniciens</SelectItem>
              {technicians.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <AnimatePresence initial={false}>
          {filtered ? (
            <motion.span key="reset" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: DURATION.fast, ease: EASE_OUT }}>
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <RotateCcwIcon />
                Réinitialiser
              </Button>
            </motion.span>
          ) : null}
        </AnimatePresence>
      </Reveal>

      <Reveal delay={0.18}>
        <section className="overflow-hidden rounded-lg border bg-card shadow-xs" aria-label="Liste des interventions">
          <div className={cn("hidden gap-4 border-b bg-slate-50/70 px-4 py-2 text-xs font-medium text-muted-foreground md:grid", GRID)} aria-hidden="true">
            <span>Référence</span>
            <span>Intervention</span>
            <span>Client & chantier</span>
            <span>Créneau</span>
            <span>Tech.</span>
            <span>Statut</span>
          </div>
          <AnimatePresence mode="popLayout" initial={false}>
            {visible.length === 0 ? (
              <motion.div key={`empty-${tab}-${query ? "q" : ""}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {query || filtered ? (
                  <EmptyState
                    icon={SearchXIcon}
                    title={query ? `Aucune intervention pour « ${query} »` : "Aucune intervention avec ces filtres"}
                    description="Cherchez par référence (INT-…), client, ville, technicien ou objet."
                    action={
                      filtered ? (
                        <Button variant="outline" size="sm" onClick={resetFilters}>
                          <RotateCcwIcon />
                          Réinitialiser les filtres
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <EmptyState
                    icon={WrenchIcon}
                    title={tab === "a_planifier" ? "Tout est planifié" : "Aucune intervention dans cette vue"}
                    description={tab === "a_planifier" ? "Les devis signés, les appels convertis et les visites d'entretien arrivent ici." : undefined}
                  />
                )}
              </motion.div>
            ) : (
              <motion.ul key="list" className="divide-y" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <AnimatePresence mode="popLayout" initial={false}>
                  {visible.map((row) => (
                    <InterventionRowItem
                      key={row.intervention.id}
                      row={row}
                      now={now}
                      readyToInvoice={readyIds.has(row.intervention.id)}
                      canPlan={canPlan}
                      fresh={freshId === row.intervention.id}
                      onPlan={() => setPlanId(row.intervention.id)}
                    />
                  ))}
                </AnimatePresence>
              </motion.ul>
            )}
          </AnimatePresence>
        </section>
      </Reveal>

      <PlanSheet open={planId !== null} onOpenChange={(open) => !open && setPlanId(null)} interventionId={planId} onDone={markFresh} />
      <InterventionFormSheet
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open && searchParams.get("nouvelle")) router.replace(pathname, { scroll: false });
        }}
        onSaved={(id) => {
          markFresh(id);
          router.push(`/interventions/${id}`);
        }}
      />
    </>
  );
}
