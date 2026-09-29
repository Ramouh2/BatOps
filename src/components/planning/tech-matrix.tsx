"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { AnimatePresence, motion } from "motion/react";
import { SnowflakeIcon, TriangleAlertIcon } from "lucide-react";
import type { User } from "@/types/batops";
import { UserAvatar } from "@/components/shared/user-avatar";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { toISODate } from "@/lib/domain/dates";
import { formatDuration, formatTime } from "@/lib/domain/format";
import { isRefrigerantQualified, WORK_DAY_MINUTES, type Conflict } from "@/lib/domain/planning";
import type { PlanningItem } from "@/lib/store/planning-selectors";
import { DURATION, EASE_OUT, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { dragId, dropId, tint } from "./planning-shared";

export interface MatrixPreview {
  cellId: string;
  label: string;
  conflicts: Conflict[];
}

const loadTone = (ratio: number) => (ratio >= 1 ? "bg-rose-500" : ratio >= 0.75 ? "bg-amber-500" : "bg-emerald-500");

function Chip({ item, fresh, onOpen, index }: { item: PlanningItem; fresh: boolean; onOpen: () => void; index: number }) {
  const plannable = item.intervention.status === "planifiee";
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId(item.intervention.id), data: { interventionId: item.intervention.id }, disabled: !plannable });
  const color = item.technician?.color_hex ?? "#94A3B8";
  const done = item.intervention.status === "terminee";
  return (
    <motion.button
      ref={setNodeRef}
      type="button"
      layout
      initial={fresh ? { opacity: 0, scale: 0.9 } : { opacity: 0, y: 4 }}
      animate={{ opacity: isDragging ? 0.35 : 1, scale: 1, y: 0 }}
      transition={fresh ? SPRING.pop : { duration: DURATION.base, ease: EASE_OUT, delay: Math.min(index * 0.03, 0.25) }}
      onClick={onOpen}
      className={cn(
        "flex w-full min-w-0 items-center gap-1.5 rounded-md border px-1.5 py-1 text-left text-[11px] transition-shadow hover:shadow-sm",
        plannable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        item.conflicts.length > 0 && "ring-2 ring-rose-400/70",
      )}
      style={{ backgroundColor: done ? "#F8FAFC" : tint(color, 0.1), borderColor: tint(color, 0.3) }}
      data-testid="matrix-chip"
      data-intervention={item.intervention.id}
      {...(plannable ? attributes : {})}
      {...(plannable ? listeners : {})}
    >
      <span className="font-semibold tabular" style={{ color: done ? "#64748B" : color }}>
        {item.intervention.scheduled_start ? formatTime(item.intervention.scheduled_start) : "--:--"}
      </span>
      <span className={cn("min-w-0 flex-1 truncate", done ? "text-slate-500" : "text-slate-800")}>{item.intervention.title}</span>
      {item.conflicts.length > 0 ? <TriangleAlertIcon className="size-3 shrink-0 text-rose-600" /> : null}
    </motion.button>
  );
}

function Cell({
  technician,
  day,
  entries,
  load,
  preview,
  freshIds,
  onOpen,
  isToday,
}: {
  technician: User;
  day: Date;
  entries: PlanningItem[];
  load: number;
  preview: MatrixPreview | null;
  freshIds: string[];
  onOpen: (item: PlanningItem) => void;
  isToday: boolean;
}) {
  const id = dropId({ kind: "cell", day, technicianId: technician.id });
  const { setNodeRef, isOver } = useDroppable({ id });
  const ratio = load / WORK_DAY_MINUTES;
  const showPreview = preview?.cellId === id;
  const severity = preview?.conflicts.some((c) => c.severity === "error") ? "error" : preview?.conflicts.length ? "warning" : "ok";
  return (
    <motion.div
      ref={setNodeRef}
      className="relative flex min-h-28 flex-col gap-1 border-l p-1.5"
      animate={{ backgroundColor: isOver ? "rgba(37, 99, 235, 0.07)" : isToday ? "rgba(239, 246, 255, 0.5)" : "rgba(255, 255, 255, 0)" }}
      transition={{ duration: 0.15 }}
      data-testid="matrix-cell"
      data-drop={id}
    >
      <div className="mb-0.5 flex items-center gap-1.5" title={`${formatDuration(Math.round(load))} planifiées sur 10 h`}>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
          <motion.div
            className={cn("h-full origin-left rounded-full transition-colors duration-500", loadTone(ratio))}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: Math.min(ratio, 1) }}
            transition={{ duration: DURATION.slow, ease: EASE_OUT }}
          />
        </div>
        <span className="text-[10px] text-slate-400 tabular">{Math.round(ratio * 100)} %</span>
      </div>
      <AnimatePresence initial={false} mode="popLayout">
        {entries.map((item, index) => (
          <Chip key={item.intervention.id} item={item} index={index} fresh={freshIds.includes(item.intervention.id)} onOpen={() => onOpen(item)} />
        ))}
      </AnimatePresence>
      <AnimatePresence>
        {showPreview ? (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={SPRING.snappy}
            className={cn(
              "rounded-md border-2 border-dashed px-1.5 py-1 text-[11px] font-medium",
              severity === "error" ? "border-rose-400 bg-rose-50 text-rose-800" : severity === "warning" ? "border-amber-400 bg-amber-50 text-amber-900" : "border-blue-400 bg-blue-50 text-blue-800",
            )}
            data-testid="drop-preview"
            data-severity={severity}
          >
            {preview!.label}
            {preview!.conflicts[0] ? <span className="block text-[10px] font-normal">{preview!.conflicts[0].message}</span> : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
      {isOver ? <span className="pointer-events-none absolute inset-0 ring-2 ring-blue-400/60 ring-inset" aria-hidden="true" /> : null}
    </motion.div>
  );
}

/** Vue « Technicien » : charge de chaque technicien jour par jour (glisser une carte pour affecter). */
export function TechMatrix({
  technicians,
  days,
  itemsFor,
  loadFor,
  preview,
  freshIds,
  today,
  onOpen,
}: {
  technicians: User[];
  days: Date[];
  itemsFor: (technicianId: string, day: Date) => PlanningItem[];
  loadFor: (technicianId: string, day: Date) => number;
  preview: MatrixPreview | null;
  freshIds: string[];
  today: Date;
  onOpen: (item: PlanningItem) => void;
}) {
  const template = { gridTemplateColumns: `12rem repeat(${days.length}, minmax(0, 1fr))` };
  const dayLabel = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-xs" data-testid="tech-matrix">
      <div className="grid border-b bg-slate-50/70 text-xs font-medium text-slate-600" style={template}>
        <div className="px-3 py-2">Technicien</div>
        {days.map((day) => (
          <div key={toISODate(day)} className={cn("border-l px-2 py-2 capitalize", toISODate(day) === toISODate(today) && "text-primary")}>
            {dayLabel.format(day)}
          </div>
        ))}
      </div>
      {technicians.map((technician, row) => {
        const weekLoad = days.reduce((sum, day) => sum + loadFor(technician.id, day), 0);
        const weekRatio = weekLoad / (WORK_DAY_MINUTES * days.length);
        return (
          <motion.div
            key={technician.id}
            className="grid border-b last:border-b-0"
            style={template}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.slow, ease: EASE_OUT, delay: row * 0.06 }}
          >
            <div className="flex flex-col gap-1.5 px-3 py-2.5">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <UserAvatar user={technician} />
                <span className="truncate">{technician.full_name}</span>
              </p>
              <p className="flex flex-wrap gap-1 text-[10px] text-slate-500">
                {isRefrigerantQualified(technician) ? (
                  <span className="inline-flex items-center gap-0.5 rounded bg-sky-50 px-1 py-px text-sky-700">
                    <SnowflakeIcon className="size-2.5" /> Frigoriste
                  </span>
                ) : null}
                {technician.specialties.slice(0, 2).map((s) => (
                  <span key={s} className="rounded bg-slate-100 px-1 py-px">
                    {s}
                  </span>
                ))}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Semaine : <AnimatedNumber value={Math.round(weekRatio * 100)} format={(v) => `${Math.round(v)} %`} countUp={false} duration={0.5} /> de charge
              </p>
            </div>
            {days.map((day) => (
              <Cell
                key={toISODate(day)}
                technician={technician}
                day={day}
                entries={itemsFor(technician.id, day)}
                load={loadFor(technician.id, day)}
                preview={preview}
                freshIds={freshIds}
                onOpen={onOpen}
                isToday={toISODate(day) === toISODate(today)}
              />
            ))}
          </motion.div>
        );
      })}
    </div>
  );
}
