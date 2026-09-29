"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, InboxIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/shared/page-header";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useMediaQuery } from "@/components/shared/use-media-query";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Reveal } from "@/components/motion/reveal";
import { Swap } from "@/components/motion/swap";
import { useFeedback } from "@/components/motion/use-flash";
import { DragPreview } from "@/components/planning/planning-cards";
import { interventionIdFromDrag, parseDropId, PX_PER_MIN, GRID_START_MIN, type PlanningView as View, dropId } from "@/components/planning/planning-shared";
import { TechMatrix, type MatrixPreview } from "@/components/planning/tech-matrix";
import { TimeGrid, type DropPreview, type GridColumn } from "@/components/planning/time-grid";
import { UnplannedColumn } from "@/components/planning/unplanned-column";
import { PlanningMobile } from "@/components/planning/planning-mobile";
import { PlanSheet, type PlanDefaults } from "@/components/interventions/plan-sheet";
import { InterventionFormSheet } from "@/components/interventions/intervention-form-sheet";
import { usePlanningActions } from "@/components/interventions/use-planning-actions";
import { useCurrentUser, useData, useNow } from "@/lib/store";
import { selectTechnicians } from "@/lib/store/selectors";
import {
  itemsOnDay,
  layoutLanes,
  selectPlanningItems,
  selectPlanningKpis,
  selectUnplanned,
  type PlanningItem,
} from "@/lib/store/planning-selectors";
import { can } from "@/lib/permissions";
import { addDays, isSameDay, parseISODate, startOfDay, toDate, toISODate } from "@/lib/domain/dates";
import { formatTime } from "@/lib/domain/format";
import {
  atMinutes,
  computeEnd,
  dayLoad,
  detectConflicts,
  findFreeSlots,
  GRID_END_HOUR,
  isFree,
  isWorkingDay,
  minutesOfDay,
  segmentOnDay,
  SLOT_MINUTES,
  startOfWeek,
  suggestTechnician,
  WORK_START,
  type Conflict,
} from "@/lib/domain/planning";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

const VIEWS: { value: View; label: string }[] = [
  { value: "jour", label: "Jour" },
  { value: "semaine", label: "Semaine" },
  { value: "technicien", label: "Technicien" },
];
const VIEW_INDEX: Record<View, number> = { jour: 0, semaine: 1, technicien: 2 };
const dayTitle = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const shortDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const weekdayShort = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });

interface Resolution {
  interventionId: string;
  unplan?: boolean;
  technicianId?: string;
  start?: Date;
  end?: Date;
  conflicts: Conflict[];
  note?: string;
  previewKey: string;
  gridPreview?: DropPreview;
  matrixPreview?: MatrixPreview;
}

/** La cible est la zone sous le curseur (plus intuitif qu'une intersection de rectangles sur un calendrier). */
const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : rectIntersection(args);
};

/** Position du pointeur au début du glisser (souris ou doigt ; `null` au clavier). */
function pointerStart(event: Event | null): { x: number; y: number } | null {
  if (!event) return null;
  if ("touches" in event) {
    const touch = (event as TouchEvent).touches[0] ?? (event as TouchEvent).changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  if ("clientY" in event) return { x: (event as PointerEvent).clientX, y: (event as PointerEvent).clientY };
  return null;
}

function isView(value: string | null): value is View {
  return value === "jour" || value === "semaine" || value === "technicien";
}

export function PlanningView() {
  const data = useData((d) => d);
  const now = useNow();
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const canManage = user ? can(user.role, "manage_planning") : false;

  const viewParam = params.get("vue");
  const dateParam = params.get("date");
  const view: View = isView(viewParam) ? viewParam : "semaine";
  const anchor = useMemo(() => (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? parseISODate(dateParam) : startOfDay(now)), [dateParam, now]);
  const [direction, setDirection] = useState(0);
  const [techFilter, setTechFilter] = useState<string[]>([]);
  const [showWeekend, setShowWeekend] = useState(false);
  const [freshIds, setFreshIds] = useState<string[]>([]);
  const [sheet, setSheet] = useState<{ id: string; defaults?: PlanDefaults } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { scope: conflictScope, shake } = useFeedback<HTMLDivElement>();

  const markFresh = useCallback((id: string) => {
    setFreshIds((list) => [...list.filter((x) => x !== id), id]);
    window.setTimeout(() => setFreshIds((list) => list.filter((x) => x !== id)), 1600);
  }, []);
  const { schedule, unschedule } = usePlanningActions(markFresh);

  const items = useMemo(() => selectPlanningItems(data), [data]);
  const technicians = useMemo(() => selectTechnicians(data), [data]);
  const unplanned = useMemo(() => selectUnplanned(items), [items]);
  const kpis = useMemo(() => selectPlanningKpis(items, now, startOfWeek(now)), [items, now]);
  const byId = useMemo(() => new Map(items.map((i) => [i.intervention.id, i])), [items]);

  // Secousse du compteur quand un nouveau conflit apparaît.
  const previousConflicts = useRef(kpis.conflicts);
  useEffect(() => {
    if (kpis.conflicts > previousConflicts.current) shake();
    previousConflicts.current = kpis.conflicts;
  }, [kpis.conflicts, shake]);

  // Ouverture directe depuis le dashboard / la fiche : `?planifier=<id>`.
  const focusParam = params.get("planifier");
  useEffect(() => {
    if (focusParam && byId.has(focusParam)) setSheet({ id: focusParam });
    // Une seule ouverture par lien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusParam]);

  const setQuery = (next: { vue?: View; date?: Date | null }) => {
    const search = new URLSearchParams(params.toString());
    if (next.vue) search.set("vue", next.vue);
    if (next.date !== undefined) {
      if (next.date === null || isSameDay(next.date, now)) search.delete("date");
      else search.set("date", toISODate(next.date));
    }
    search.delete("planifier");
    router.replace(`${pathname}?${search.toString()}`, { scroll: false });
  };

  const weekStart = startOfWeek(anchor);
  const weekDays = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    return days.filter((day, i) => i < 5 || showWeekend || items.some((item) => item.range && segmentOnDay(item.range, day)));
  }, [weekStart, showWeekend, items]);

  const navigate = (delta: number) => {
    setDirection(delta);
    const step = view === "jour" ? 1 : 7;
    let next = addDays(anchor, delta * step);
    if (view === "jour" && !showWeekend) while (!isWorkingDay(next)) next = addDays(next, delta);
    setQuery({ date: next });
  };

  const periodLabel =
    view === "jour"
      ? dayTitle.format(anchor)
      : `Semaine du ${shortDay.format(weekDays[0])} au ${shortDay.format(weekDays[weekDays.length - 1])}`;
  const periodKey = view === "jour" ? toISODate(anchor) : toISODate(weekStart);

  /* ------------------------------ Grilles ------------------------------ */

  const visibleItems = useMemo(
    () => (techFilter.length === 0 ? items : items.filter((i) => i.intervention.assigned_technician_id && techFilter.includes(i.intervention.assigned_technician_id))),
    [items, techFilter],
  );

  const weekColumns: GridColumn[] = weekDays.map((day) => {
    const entries = layoutLanes(itemsOnDay(visibleItems, day));
    return {
      id: dropId({ kind: "column", day }),
      day,
      isToday: isSameDay(day, now),
      entries,
      header: (
        <div className={cn("flex items-baseline justify-between gap-1", isSameDay(day, now) ? "text-primary" : "text-slate-700")}>
          <span className="text-xs font-medium capitalize">
            {weekdayShort.format(day)} <span className="text-base font-semibold tabular">{day.getDate()}</span>
          </span>
          <span className="rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500 tabular">
            <Swap swapKey={entries.length}>{entries.length}</Swap>
          </span>
        </div>
      ),
    };
  });

  const dayColumns: GridColumn[] = technicians.map((tech) => {
    const load = dayLoad(tech.id, anchor, data.interventions);
    return {
      id: dropId({ kind: "column", day: anchor, technicianId: tech.id }),
      day: anchor,
      technicianId: tech.id,
      isToday: isSameDay(anchor, now),
      entries: layoutLanes(itemsOnDay(items, anchor, tech.id)),
      header: (
        <div className="flex items-center gap-2">
          <UserAvatar user={tech} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{tech.full_name}</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <div className="h-1 w-20 overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  className={cn("h-full origin-left rounded-full", load >= 600 ? "bg-rose-500" : load >= 450 ? "bg-amber-500" : "bg-emerald-500")}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: Math.min(load / 600, 1) }}
                  transition={{ duration: DURATION.slow, ease: EASE_OUT }}
                />
              </div>
              <span className="text-[10px] text-slate-400 tabular">{Math.round(load / 60)} h / 10 h</span>
            </div>
          </div>
        </div>
      ),
    };
  });

  const matrixItems = useCallback(
    (technicianId: string, day: Date) => itemsOnDay(items, day, technicianId).map((entry) => entry.item),
    [items],
  );
  const matrixLoad = useCallback((technicianId: string, day: Date) => dayLoad(technicianId, day, data.interventions), [data.interventions]);

  const evaluate = useCallback(
    (item: PlanningItem, column: GridColumn, startMin: number, endMin: number) =>
      item.intervention.assigned_technician_id
        ? detectConflicts(
            {
              id: item.intervention.id,
              technician_id: item.intervention.assigned_technician_id,
              start: atMinutes(column.day, startMin),
              end: atMinutes(column.day, endMin),
              needsRefrigerant: item.needsRefrigerant,
              priority: item.intervention.priority,
            },
            { interventions: data.interventions, users: data.users, now },
          )
        : [],
    [data.interventions, data.users, now],
  );

  /* --------------------------- Glisser-déposer --------------------------- */

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    // Espace saisit / dépose ; Entrée reste réservée à l'ouverture de la carte.
    useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] } }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const activeItem = activeId ? byId.get(activeId) : undefined;
  const activeVariant = useRef<"card" | "event">("card");
  /** Décalage vertical du pointeur dans la carte saisie : le haut de la carte tombe sur l'heure visée. */
  const grabOffset = useRef(0);

  const resolve = useCallback(
    (event: DragMoveEvent | DragOverEvent | DragEndEvent): Resolution | null => {
      const interventionId = interventionIdFromDrag(event.active.id);
      const item = byId.get(interventionId);
      const target = parseDropId(event.over?.id);
      if (!item || !target || !event.over) return null;
      const intervention = item.intervention;

      if (target.kind === "unplanned") {
        return intervention.status === "planifiee" ? { interventionId, unplan: true, conflicts: [], previewKey: "unplanned" } : null;
      }

      let start: Date;
      let technicianId = target.technicianId ?? intervention.assigned_technician_id;
      let note: string | undefined;
      if (target.kind === "column") {
        const origin = pointerStart(event.activatorEvent);
        const top = origin ? origin.y + event.delta.y - grabOffset.current : (event.active.rect.current.translated?.top ?? event.over.rect.top);
        const raw = GRID_START_MIN + (top - event.over.rect.top) / PX_PER_MIN;
        const minutes = Math.min(Math.max(Math.round(raw / SLOT_MINUTES) * SLOT_MINUTES, GRID_START_MIN), GRID_END_HOUR * 60 - SLOT_MINUTES);
        start = atMinutes(target.day, minutes);
      } else {
        // Matrice : même heure si le technicien est libre, sinon premier créneau libre de la journée.
        const keep = intervention.scheduled_start ? minutesOfDay(toDate(intervention.scheduled_start)) : WORK_START;
        const candidate = atMinutes(target.day, keep);
        const free = isFree(target.technicianId, { start: candidate, end: computeEnd(candidate, intervention.duration_minutes) }, data.interventions, intervention.id);
        start = free
          ? candidate
          : (findFreeSlots(target.technicianId, target.day, intervention.duration_minutes, data.interventions, { excludeId: intervention.id, limit: 1 })[0] ?? atMinutes(target.day, WORK_START));
        if (!free) note = "Heure ajustée au premier créneau libre.";
      }
      const end = computeEnd(start, intervention.duration_minutes);
      if (!technicianId) {
        technicianId =
          techFilter.length === 1
            ? techFilter[0]
            : suggestTechnician(technicians, { start, end }, item.needsRefrigerant, data.interventions, intervention.id);
        const tech = technicians.find((t) => t.id === technicianId);
        if (tech) note = `Affectée à ${tech.full_name.split(" ")[0]} (technicien conseillé : ${isFree(tech.id, { start, end }, data.interventions, intervention.id) ? "libre" : "occupé"}${item.needsRefrigerant ? ", frigoriste requis" : ""}).`;
      }
      if (!technicianId) return null;
      const conflicts = detectConflicts(
        { id: intervention.id, technician_id: technicianId, start, end, needsRefrigerant: item.needsRefrigerant, priority: intervention.priority },
        { interventions: data.interventions, users: data.users, now },
      );
      const tech = technicians.find((t) => t.id === technicianId);
      const segment = segmentOnDay({ start, end }, target.day);
      const label = `${formatTime(start)} – ${isSameDay(start, end) ? formatTime(end) : "…"}${tech && !target.technicianId ? ` · ${tech.full_name.split(" ")[0]}` : ""}`;
      const previewKey = `${event.over.id}|${start.getTime()}|${technicianId}`;
      return {
        interventionId,
        technicianId,
        start,
        end,
        conflicts,
        note,
        previewKey,
        gridPreview:
          target.kind === "column" && segment
            ? { columnId: String(event.over.id), startMin: segment.startMin, endMin: segment.endMin, label, conflicts }
            : undefined,
        matrixPreview: target.kind === "cell" ? { cellId: String(event.over.id), label: `→ ${formatTime(start)} – ${isSameDay(start, end) ? formatTime(end) : "…"}`, conflicts } : undefined,
      };
    },
    [byId, data.interventions, data.users, now, technicians, techFilter],
  );

  const onDragStart = (event: DragStartEvent) => {
    const id = interventionIdFromDrag(event.active.id);
    const origin = pointerStart(event.activatorEvent);
    const grabbed = (event.activatorEvent?.target as HTMLElement | null)?.closest<HTMLElement>("[data-intervention]");
    const rect = grabbed?.getBoundingClientRect();
    grabOffset.current = origin && rect ? Math.min(Math.max(origin.y - rect.top, 0), rect.height) : 0;
    setActiveId(id);
    activeVariant.current = byId.get(id)?.intervention.status === "planifiee" && view !== "technicien" ? "event" : "card";
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(8);
  };
  // `onDragOver` aussi : la cible survolée peut changer sans nouveau mouvement (mise à jour décalée des collisions).
  const onDragMove = (event: DragMoveEvent | DragOverEvent) => {
    const next = resolve(event);
    setResolution((current) => (current?.previewKey === next?.previewKey ? current : next));
  };
  const onDragEnd = (event: DragEndEvent) => {
    const final = resolve(event);
    setActiveId(null);
    setResolution(null);
    if (!final) return;
    if (final.unplan) unschedule(final.interventionId);
    else if (final.technicianId && final.start) schedule(final.interventionId, final.technicianId, final.start, undefined, final.note);
  };
  const onDragCancel = () => {
    setActiveId(null);
    setResolution(null);
  };

  const openItem = (item: PlanningItem) => setSheet({ id: item.intervention.id });

  if (!isDesktop) {
    return (
      <>
        <PlanningMobile
          items={items}
          unplanned={unplanned}
          technicians={technicians}
          now={now}
          freshIds={freshIds}
          kpis={kpis}
          canCreate={canManage}
          onOpen={openItem}
          onCreate={() => setCreateOpen(true)}
        />
        <PlanSheet open={sheet !== null} onOpenChange={(open) => !open && setSheet(null)} interventionId={sheet?.id ?? null} defaults={sheet?.defaults} onDone={markFresh} />
        <InterventionFormSheet open={createOpen} onOpenChange={setCreateOpen} onSaved={(id) => setSheet({ id })} />
      </>
    );
  }

  const viewBody =
    view === "technicien" ? (
      <TechMatrix
        technicians={technicians}
        days={weekDays}
        itemsFor={matrixItems}
        loadFor={matrixLoad}
        preview={resolution?.matrixPreview ?? null}
        freshIds={freshIds}
        today={now}
        onOpen={openItem}
      />
    ) : (
      <TimeGrid
        columns={view === "jour" ? dayColumns : weekColumns}
        preview={resolution?.gridPreview ?? null}
        dragging={activeId !== null}
        freshIds={freshIds}
        nowMin={minutesOfDay(now)}
        onOpen={openItem}
        onResize={(item, duration) => item.intervention.assigned_technician_id && item.range && schedule(item.intervention.id, item.intervention.assigned_technician_id, item.range.start, duration)}
        evaluate={evaluate}
      />
    );

  return (
    <>
      <Reveal>
        <PageHeader
          title="Planning"
          description="Glissez les interventions pour les planifier, déplacer ou réaffecter. Les conflits s'affichent en direct."
          actions={
            canManage ? (
              <Button onClick={() => setCreateOpen(true)} data-testid="new-intervention">
                <PlusIcon />
                Nouvelle intervention
              </Button>
            ) : null
          }
        />
      </Reveal>

      {/* Indicateurs */}
      <Reveal delay={0.04} className="mb-4 flex flex-wrap items-center gap-2" aria-label="Indicateurs du planning">
        <span className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm shadow-xs" data-testid="kpi-to-schedule">
          <InboxIcon className="size-4 text-amber-500" />
          <AnimatedNumber value={kpis.toSchedule} className="font-semibold text-slate-900" /> à planifier
          {kpis.urgentToSchedule > 0 ? <span className="text-xs font-medium text-rose-600">dont {kpis.urgentToSchedule} urgente{kpis.urgentToSchedule > 1 ? "s" : ""}</span> : null}
        </span>
        <span className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm shadow-xs">
          <CalendarDaysIcon className="size-4 text-blue-500" />
          <AnimatedNumber value={kpis.today} className="font-semibold text-slate-900" /> aujourd&apos;hui ·{" "}
          <AnimatedNumber value={kpis.week} className="font-semibold text-slate-900" /> cette semaine
        </span>
        <div ref={conflictScope}>
          <span
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm shadow-xs transition-colors duration-300",
              kpis.conflicts > 0 ? "border-rose-200 bg-rose-50 text-rose-800" : "bg-card text-slate-600",
            )}
            data-testid="kpi-conflicts"
          >
            <TriangleAlertIcon className={cn("size-4", kpis.conflicts > 0 ? "text-rose-500" : "text-slate-300")} />
            <AnimatedNumber value={kpis.conflicts} className="font-semibold" countUp={false} /> conflit{kpis.conflicts > 1 ? "s" : ""}
          </span>
        </div>
      </Reveal>

      {/* Barre d'outils */}
      <Reveal delay={0.08} className="mb-3 flex flex-wrap items-center gap-3">
        <SegmentedTabs
          label="Vue du planning"
          value={view}
          onValueChange={(v) => {
            setDirection(VIEW_INDEX[v] - VIEW_INDEX[view]);
            setQuery({ vue: v });
          }}
          items={VIEWS}
        />
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => navigate(-1)} aria-label={view === "jour" ? "Jour précédent" : "Semaine précédente"}>
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setQuery({ date: null })}>
            Aujourd&apos;hui
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => navigate(1)} aria-label={view === "jour" ? "Jour suivant" : "Semaine suivante"}>
            <ChevronRightIcon />
          </Button>
        </div>
        <h2 className="min-w-0 text-sm font-semibold text-slate-900 first-letter:uppercase" data-testid="planning-period">
          <Swap swapKey={periodLabel}>{periodLabel}</Swap>
        </h2>
        <div className="ml-auto flex items-center gap-3">
          {view === "semaine" ? (
            <div className="flex items-center gap-1" role="group" aria-label="Filtrer par technicien">
              {technicians.map((tech) => {
                const active = techFilter.includes(tech.id);
                return (
                  <button
                    key={tech.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTechFilter((list) => (active ? list.filter((id) => id !== tech.id) : [...list, tech.id]))}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-xs font-medium transition-all",
                      active ? "border-transparent text-white" : techFilter.length > 0 ? "opacity-50 hover:opacity-100" : "hover:border-slate-300",
                    )}
                    style={active ? { backgroundColor: tech.color_hex } : undefined}
                  >
                    <UserAvatar user={tech} className="size-5 text-[8px] ring-2 ring-white" />
                    {tech.full_name.split(" ")[0]}
                  </button>
                );
              })}
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <Switch checked={showWeekend} onCheckedChange={setShowWeekend} aria-label="Afficher le week-end" />
            Week-end
          </label>
        </div>
      </Reveal>

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragOver={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "Pour déplacer une intervention : Espace pour la saisir, flèches pour la déplacer, Espace pour la déposer, Échap pour annuler. Ou Entrée pour ouvrir le tiroir de planification.",
          },
          announcements: {
            onDragStart: ({ active }) => `Intervention ${byId.get(interventionIdFromDrag(active.id))?.intervention.reference ?? ""} saisie.`,
            onDragOver: ({ over }) => (over ? `Au-dessus de ${String(over.id).replace("col:", "").replace("cell:", "")}.` : "Hors zone de dépôt."),
            onDragEnd: ({ over }) => (over ? "Intervention déposée." : "Déplacement annulé."),
            onDragCancel: () => "Déplacement annulé.",
          },
        }}
      >
        <div className="grid grid-cols-[17rem_minmax(0,1fr)] gap-4">
          <Reveal delay={0.12} className="min-h-0">
            <UnplannedColumn
              items={unplanned}
              freshIds={freshIds}
              draggingPlanned={activeItem?.intervention.status === "planifiee"}
              canCreate={canManage}
              onOpen={openItem}
              onCreate={() => setCreateOpen(true)}
              className="sticky top-20 max-h-[calc(100dvh-6rem)]"
            />
          </Reveal>
          <div className="min-w-0">
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div
                key={`${view}-${periodKey}`}
                custom={direction}
                variants={{
                  enter: (d: number) => ({ opacity: 0, x: d * 28 }),
                  center: { opacity: 1, x: 0 },
                  exit: (d: number) => ({ opacity: 0, x: d * -28 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2, ease: EASE_OUT }}
              >
                {viewBody}
              </motion.div>
            </AnimatePresence>
            <AnimatePresence>
              {resolution?.note && activeId ? (
                <motion.p
                  key="note"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-2 text-xs text-slate-500"
                  role="status"
                >
                  {resolution.note}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
          {activeItem ? <DragPreview item={activeItem} variant={activeVariant.current} /> : null}
        </DragOverlay>
      </DndContext>

      <PlanSheet open={sheet !== null} onOpenChange={(open) => !open && setSheet(null)} interventionId={sheet?.id ?? null} defaults={sheet?.defaults} onDone={markFresh} />
      <InterventionFormSheet open={createOpen} onOpenChange={setCreateOpen} onSaved={(id) => setSheet({ id })} />
    </>
  );
}
