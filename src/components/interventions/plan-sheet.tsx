"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { CalendarClockIcon, CircleCheckIcon, ExternalLinkIcon, SnowflakeIcon, SparklesIcon, TriangleAlertIcon, UndoDotIcon } from "lucide-react";
import type { Intervention } from "@/types/batops";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UserAvatar } from "@/components/shared/user-avatar";
import { StatusBadge } from "@/components/shared/status-badge";
import { DecimalInput } from "@/components/quotes/decimal-input";
import { useData, useNow } from "@/lib/store";
import { selectTechnicians } from "@/lib/store/selectors";
import { clientDisplayName } from "@/lib/domain/clients";
import { addDays, isSameDay, parseISODate, startOfDay, toDate, toISODate } from "@/lib/domain/dates";
import { formatDateTime, formatDuration, formatTime } from "@/lib/domain/format";
import { INTERVENTION_STATUS, INTERVENTION_TYPE_LABEL, PRIORITY } from "@/lib/domain/labels";
import {
  atMinutes,
  computeEnd,
  dayLoad,
  detectConflicts,
  findFreeSlots,
  isRefrigerantQualified,
  isWorkingDay,
  minutesOfDay,
  nextFreeSlot,
  requiresRefrigerantSkill,
  suggestTechnician,
  WORK_DAY_MINUTES,
  WORK_START,
} from "@/lib/domain/planning";
import { DURATION, EASE_OUT, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { usePlanningActions } from "./use-planning-actions";

const DURATION_CHIPS = [
  { label: "1 h", minutes: 60 },
  { label: "2 h", minutes: 120 },
  { label: "4 h", minutes: 240 },
  { label: "1 j", minutes: 600 },
  { label: "2 j", minutes: 1200 },
];
const dayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const toTimeValue = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export interface PlanDefaults {
  technicianId?: string;
  start?: Date;
}

function Form({
  intervention,
  defaults,
  showFicheLink,
  onDone,
}: {
  intervention: Intervention;
  defaults?: PlanDefaults;
  showFicheLink: boolean;
  onDone: (interventionId: string) => void;
}) {
  const data = useData((d) => d);
  const now = useNow();
  const technicians = useMemo(() => selectTechnicians(data), [data]);
  const { schedule, unschedule } = usePlanningActions(onDone);
  const client = data.clients.find((c) => c.id === intervention.client_id);
  const needsRefrigerant = requiresRefrigerantSkill(intervention, data.catalog, data.equipment);
  const scheduled = intervention.scheduled_start ? toDate(intervention.scheduled_start) : undefined;

  const [duration, setDuration] = useState(intervention.duration_minutes);
  const initial = useMemo(() => {
    if (defaults?.start) return defaults.start;
    if (scheduled) return scheduled;
    const tech = defaults?.technicianId ?? intervention.assigned_technician_id ?? technicians.find((t) => !needsRefrigerant || isRefrigerantQualified(t))?.id;
    return (tech && nextFreeSlot(tech, now, intervention.duration_minutes, data.interventions, { excludeId: intervention.id })) || atMinutes(addDays(now, 1), WORK_START);
    // Valeurs initiales calculées à l'ouverture uniquement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [day, setDay] = useState(() => startOfDay(initial));
  const [startMin, setStartMin] = useState(() => minutesOfDay(initial));
  const [techId, setTechId] = useState<string>(
    () =>
      defaults?.technicianId ??
      intervention.assigned_technician_id ??
      suggestTechnician(technicians, { start: initial, end: computeEnd(initial, intervention.duration_minutes) }, needsRefrigerant, data.interventions, intervention.id) ??
      technicians[0]?.id ??
      "",
  );

  const start = atMinutes(day, startMin);
  const end = computeEnd(start, duration);
  const conflicts = detectConflicts(
    { id: intervention.id, technician_id: techId, start, end, needsRefrigerant, priority: intervention.priority },
    { interventions: data.interventions, users: data.users, now },
  );
  const slots = findFreeSlots(techId, day, duration, data.interventions, { excludeId: intervention.id, now, limit: 6 });
  const dayChips = useMemo(() => {
    const list: Date[] = [];
    let cursor = startOfDay(now);
    while (list.length < 6) {
      if (isWorkingDay(cursor)) list.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return list;
  }, [now]);
  const planned = intervention.status === "planifiee";
  const unchanged = planned && scheduled?.getTime() === start.getTime() && intervention.assigned_technician_id === techId && duration === intervention.duration_minutes;

  // `onDone` est appelé par usePlanningActions après chaque changement (et après une annulation).
  const submit = () => {
    schedule(intervention.id, techId, start, duration);
  };

  return (
    <>
      <SheetBody className="space-y-6">
        {/* Résumé */}
        <div className="rounded-lg border bg-slate-50/60 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-slate-500">{intervention.reference}</span>
            <StatusBadge meta={INTERVENTION_STATUS[intervention.status]} />
            <Badge>{INTERVENTION_TYPE_LABEL[intervention.type]}</Badge>
            {intervention.priority !== "normale" ? <Badge tone={PRIORITY[intervention.priority].tone}>{PRIORITY[intervention.priority].label}</Badge> : null}
            {needsRefrigerant ? (
              <Badge tone="info">
                <SnowflakeIcon /> Frigoriste requis
              </Badge>
            ) : null}
          </div>
          <p className="mt-1.5 font-medium text-slate-900">{intervention.title}</p>
          <p className="text-xs text-muted-foreground">
            {client ? clientDisplayName(client) : "Client"} · {intervention.address}, {intervention.city}
          </p>
          {showFicheLink ? (
            <Link href={`/interventions/${intervention.id}`} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <ExternalLinkIcon className="size-3" /> Ouvrir la fiche complète
            </Link>
          ) : null}
        </div>

        {/* Technicien */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-900">Technicien</legend>
          <div role="radiogroup" aria-label="Technicien" className="grid gap-2 sm:grid-cols-2">
            {technicians.map((tech) => {
              const active = tech.id === techId;
              const load = dayLoad(tech.id, day, data.interventions.filter((i) => i.id !== intervention.id));
              const qualified = !needsRefrigerant || isRefrigerantQualified(tech);
              const techConflicts = detectConflicts({ id: intervention.id, technician_id: tech.id, start, end, needsRefrigerant }, { interventions: data.interventions, users: data.users });
              return (
                <button
                  key={tech.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTechId(tech.id)}
                  className={cn(
                    "relative flex items-center gap-3 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
                    active ? "border-transparent" : "hover:border-slate-300",
                  )}
                  data-testid={`plan-tech-${tech.id}`}
                >
                  {active ? (
                    <motion.span
                      layoutId="plan-tech-active"
                      transition={SPRING.snappy}
                      className="absolute inset-0 rounded-lg"
                      style={{ boxShadow: `0 0 0 2px ${tech.color_hex}, inset 0 0 0 999px ${tech.color_hex}0F` }}
                    />
                  ) : null}
                  <UserAvatar user={tech} className="relative size-9 text-xs" />
                  <span className="relative min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{tech.full_name}</span>
                    <span className="mt-1 flex items-center gap-1.5">
                      <span className="h-1 w-14 overflow-hidden rounded-full bg-slate-100">
                        <motion.span
                          className={cn("block h-full origin-left rounded-full", load >= WORK_DAY_MINUTES ? "bg-rose-500" : load >= WORK_DAY_MINUTES * 0.75 ? "bg-amber-500" : "bg-emerald-500")}
                          initial={false}
                          animate={{ scaleX: Math.min(load / WORK_DAY_MINUTES, 1) }}
                          transition={{ duration: DURATION.slow, ease: EASE_OUT }}
                        />
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular">{formatDuration(Math.round(load))} ce jour</span>
                    </span>
                  </span>
                  <span className="relative shrink-0">
                    {techConflicts.some((c) => c.kind === "overlap") ? (
                      <TriangleAlertIcon className="size-4 text-rose-500" aria-label="Occupé sur ce créneau" />
                    ) : !qualified ? (
                      <SnowflakeIcon className="size-4 text-amber-500" aria-label="Non frigoriste" />
                    ) : (
                      <CircleCheckIcon className="size-4 text-emerald-500" aria-label="Disponible" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Jour */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-900">Jour</legend>
          <div className="flex flex-wrap gap-1.5">
            {dayChips.map((chip) => {
              const active = isSameDay(chip, day);
              return (
                <button
                  key={chip.toISOString()}
                  type="button"
                  onClick={() => setDay(chip)}
                  className={cn(
                    "relative rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    active ? "border-primary text-primary" : "text-slate-600 hover:border-slate-300",
                  )}
                  aria-pressed={active}
                >
                  {active ? <motion.span layoutId="plan-day-active" transition={SPRING.snappy} className="absolute inset-0 rounded-full bg-blue-50" /> : null}
                  <span className="relative">{isSameDay(chip, now) ? "Aujourd'hui" : isSameDay(chip, addDays(now, 1)) ? "Demain" : dayFormat.format(chip)}</span>
                </button>
              );
            })}
            <label className="sr-only" htmlFor="plan-date">
              Autre date
            </label>
            <Input
              id="plan-date"
              type="date"
              value={toISODate(day)}
              onChange={(e) => e.target.value && setDay(parseISODate(e.target.value))}
              className="h-8 w-auto text-xs"
            />
          </div>
        </fieldset>

        {/* Heure */}
        <fieldset>
          <legend className="mb-2 flex w-full items-center justify-between text-sm font-medium text-slate-900">
            Heure de début
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              onClick={() => {
                const next = nextFreeSlot(techId, now, duration, data.interventions, { excludeId: intervention.id });
                if (next) {
                  setDay(startOfDay(next));
                  setStartMin(minutesOfDay(next));
                }
              }}
            >
              <SparklesIcon className="size-3" /> Prochain créneau libre
            </button>
          </legend>
          <div className="flex flex-wrap items-center gap-1.5">
            <AnimatePresence initial={false} mode="popLayout">
              {slots.map((slot, index) => {
                const minutes = minutesOfDay(slot);
                const active = minutes === startMin;
                return (
                  <motion.button
                    key={`${toISODate(day)}-${minutes}`}
                    type="button"
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ ...SPRING.snappy, delay: index * 0.03 }}
                    onClick={() => setStartMin(minutes)}
                    className={cn(
                      "rounded-md border px-2.5 py-1.5 text-xs font-semibold tabular transition-colors",
                      active ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50",
                    )}
                    aria-pressed={active}
                    data-testid="free-slot"
                  >
                    {formatTime(slot)}
                  </motion.button>
                );
              })}
            </AnimatePresence>
            {slots.length === 0 ? <span className="text-xs text-muted-foreground">Aucun créneau libre ce jour-là pour cette durée.</span> : null}
            <label className="sr-only" htmlFor="plan-time">
              Heure précise
            </label>
            <Input
              id="plan-time"
              type="time"
              step={900}
              value={toTimeValue(startMin)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                if (Number.isFinite(h) && Number.isFinite(m)) setStartMin(h * 60 + m);
              }}
              className="h-8 w-28 text-xs tabular"
            />
          </div>
        </fieldset>

        {/* Durée */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-900">Durée de travail</legend>
          <div className="flex flex-wrap items-center gap-1.5">
            {DURATION_CHIPS.map((chip) => (
              <button
                key={chip.minutes}
                type="button"
                onClick={() => setDuration(chip.minutes)}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  duration === chip.minutes ? "border-primary bg-blue-50 text-primary" : "text-slate-600 hover:border-slate-300",
                )}
                aria-pressed={duration === chip.minutes}
              >
                {chip.label}
              </button>
            ))}
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DecimalInput
                id="plan-duration"
                value={Math.round((duration / 60) * 100) / 100}
                onValueChange={(hours) => setDuration(Math.max(15, Math.round((hours * 60) / 15) * 15))}
                max={100}
                className="h-8 w-16 text-right text-xs"
                aria-label="Durée en heures"
              />
              h
            </label>
          </div>
        </fieldset>

        {/* Synthèse + conflits en direct */}
        <div className="space-y-2" aria-live="polite">
          <motion.p
            key={`${start.getTime()}-${end.getTime()}-${techId}`}
            initial={{ opacity: 0.4, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm text-white"
            data-testid="plan-summary"
          >
            <CalendarClockIcon className="size-4 shrink-0 text-slate-300" />
            <span className="tabular">
              {formatDateTime(start)} → {isSameDay(start, end) ? formatTime(end) : formatDateTime(end)}
            </span>
          </motion.p>
          <AnimatePresence initial={false} mode="popLayout">
            {conflicts.length === 0 ? (
              <motion.p key="ok" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-sm text-emerald-700">
                <CircleCheckIcon className="size-4" /> Aucun conflit : technicien libre et qualifié.
              </motion.p>
            ) : (
              conflicts.map((conflict) => (
                <motion.p
                  key={conflict.kind + (conflict.with_id ?? "")}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: [0, -4, 4, -2, 0] }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.35 }}
                  className={cn(
                    "flex items-start gap-2 rounded-md px-3 py-2 text-sm",
                    conflict.severity === "error" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900",
                  )}
                  data-testid="plan-conflict"
                >
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                  {conflict.message}
                </motion.p>
              ))
            )}
          </AnimatePresence>
        </div>
      </SheetBody>
      <SheetFooter className="justify-between">
        {planned ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => unschedule(intervention.id)}
          >
            <UndoDotIcon />
            Retirer du planning
          </Button>
        ) : (
          <span />
        )}
        <Button type="button" onClick={submit} disabled={!techId || unchanged} data-testid="confirm-plan" className="min-w-[9rem]">
          <CalendarClockIcon />
          {planned ? "Enregistrer le créneau" : "Planifier"}
        </Button>
      </SheetFooter>
    </>
  );
}

/** Tiroir de planification : technicien, jour, créneau libre, durée — conflits calculés en direct. */
export function PlanSheet({
  open,
  onOpenChange,
  interventionId,
  defaults,
  showFicheLink = true,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interventionId: string | null;
  defaults?: PlanDefaults;
  showFicheLink?: boolean;
  onDone?: (interventionId: string) => void;
}) {
  const intervention = useData((d) => (interventionId ? d.interventions.find((i) => i.id === interventionId) : undefined));
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:w-[min(34rem,100%)]" data-testid="plan-sheet">
        <SheetHeader>
          <SheetTitle>{intervention?.status === "planifiee" ? "Modifier le créneau" : "Planifier l'intervention"}</SheetTitle>
          <SheetDescription>Technicien, jour et heure : les conflits s&apos;affichent avant de valider.</SheetDescription>
        </SheetHeader>
        {open && intervention ? (
          <Form
            key={intervention.id}
            intervention={intervention}
            defaults={defaults}
            showFicheLink={showFicheLink}
            onDone={(id) => {
              onOpenChange(false);
              onDone?.(id);
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
