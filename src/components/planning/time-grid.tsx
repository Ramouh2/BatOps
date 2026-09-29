"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { AnimatePresence, motion } from "motion/react";
import { TriangleAlertIcon } from "lucide-react";
import { GRID_END_HOUR, GRID_START_HOUR, SLOT_MINUTES, WORK_END, WORK_START, type Conflict } from "@/lib/domain/planning";
import type { PlanningItem } from "@/lib/store/planning-selectors";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { GridEvent } from "./planning-cards";
import { GRID_HEIGHT, HOUR_PX, minuteToY, PX_PER_MIN } from "./planning-shared";

export interface GridEntry {
  item: PlanningItem;
  segment: { startMin: number; endMin: number; continuesBefore: boolean; continuesAfter: boolean };
  lane: number;
  lanes: number;
}

export interface GridColumn {
  id: string;
  day: Date;
  technicianId?: string;
  header: ReactNode;
  isToday: boolean;
  entries: GridEntry[];
}

export interface DropPreview {
  columnId: string;
  startMin: number;
  endMin: number;
  label: string;
  conflicts: Conflict[];
}

const severityOf = (conflicts: Conflict[]) =>
  conflicts.some((c) => c.severity === "error") ? "error" : conflicts.length > 0 ? "warning" : "ok";

const PREVIEW_STYLE = {
  ok: "border-blue-400 bg-blue-500/10 text-blue-800",
  warning: "border-amber-400 bg-amber-400/15 text-amber-900",
  error: "border-rose-400 bg-rose-500/12 text-rose-800",
} as const;

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;

function NowLine({ nowMin }: { nowMin: number }) {
  if (nowMin < GRID_START_HOUR * 60 || nowMin > GRID_END_HOUR * 60) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: minuteToY(nowMin) }} aria-hidden="true">
      <div className="relative h-px bg-rose-500">
        <motion.span
          className="absolute -top-[4px] -left-[5px] size-[9px] rounded-full bg-rose-500"
          animate={{ scale: [1, 1.35, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}

interface ResizeState {
  id: string;
  startMin: number;
  endMin: number;
  originalEnd: number;
  originY: number;
}

function Column({
  column,
  preview,
  dragging,
  freshIds,
  nowMin,
  onOpen,
  onResize,
  evaluate,
}: {
  column: GridColumn;
  preview: DropPreview | null;
  dragging: boolean;
  freshIds: string[];
  nowMin: number;
  onOpen: (item: PlanningItem) => void;
  onResize: (item: PlanningItem, durationMinutes: number) => void;
  evaluate: (item: PlanningItem, column: GridColumn, startMin: number, endMin: number) => Conflict[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [resize, setResize] = useState<ResizeState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);

  useEffect(() => {
    if (!resize) return;
    const onMove = (event: PointerEvent) => {
      const current = resizeRef.current;
      if (!current) return;
      const raw = current.originalEnd + (event.clientY - current.originY) / PX_PER_MIN;
      const endMin = Math.max(current.startMin + SLOT_MINUTES, Math.min(GRID_END_HOUR * 60, Math.round(raw / SLOT_MINUTES) * SLOT_MINUTES));
      if (endMin !== current.endMin) {
        const next = { ...current, endMin };
        resizeRef.current = next;
        setResize(next);
      }
    };
    const onUp = () => {
      const current = resizeRef.current;
      resizeRef.current = null;
      setResize(null);
      if (!current || current.endMin === current.originalEnd) return;
      const entry = column.entries.find((e) => e.item.intervention.id === current.id);
      if (entry) onResize(entry.item, current.endMin - current.startMin);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // Écouteurs posés une fois par redimensionnement (l'état courant est lu dans la ref).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resize?.id]);

  const showPreview = preview && preview.columnId === column.id;
  const resizing = resize ? column.entries.find((e) => e.item.intervention.id === resize.id) : undefined;
  const resizeConflicts = resize && resizing ? evaluate(resizing.item, column, resize.startMin, resize.endMin) : [];

  return (
    <motion.div
      ref={setNodeRef}
      className={cn("relative border-l first:border-l-0", column.isToday && "bg-blue-50/30")}
      style={{ height: GRID_HEIGHT }}
      animate={{ backgroundColor: isOver ? "rgba(37, 99, 235, 0.07)" : dragging ? "rgba(248, 250, 252, 0.6)" : "rgba(255, 255, 255, 0)" }}
      transition={{ duration: 0.15 }}
      data-testid="planning-column"
      data-drop={column.id}
    >
      {/* Heures hors journée de travail */}
      <div className="pointer-events-none absolute inset-x-0 top-0 bg-slate-100/60" style={{ height: minuteToY(WORK_START) }} aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-slate-100/60" style={{ top: minuteToY(WORK_END) }} aria-hidden="true" />
      {/* Lignes horaires */}
      {Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => (
        <div key={i} className="pointer-events-none absolute inset-x-0 border-t border-slate-100" style={{ top: i * HOUR_PX }} aria-hidden="true" />
      ))}
      <AnimatePresence>
        {isOver ? (
          <motion.div
            key="over"
            className="pointer-events-none absolute inset-0 ring-2 ring-blue-400/60 ring-inset"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          />
        ) : null}
      </AnimatePresence>
      {column.isToday ? <NowLine nowMin={nowMin} /> : null}

      {column.entries.map((entry, index) => {
        const isResizing = resize?.id === entry.item.intervention.id;
        const startMin = entry.segment.startMin;
        const endMin = isResizing ? resize!.endMin : entry.segment.endMin;
        const top = minuteToY(startMin);
        const height = Math.max(minuteToY(endMin) - top - 2, 18);
        const width = 100 / entry.lanes;
        const plannable = entry.item.intervention.status === "planifiee";
        const singleDay = !entry.segment.continuesBefore && !entry.segment.continuesAfter;
        return (
          <GridEvent
            key={entry.item.intervention.id}
            item={entry.item}
            index={index}
            style={{ top: top + 1, left: `calc(${entry.lane * width}% + 3px)`, width: `calc(${width}% - 6px)`, zIndex: isResizing ? 15 : 5 }}
            height={height}
            startMin={startMin}
            endMin={endMin}
            continuesBefore={entry.segment.continuesBefore}
            continuesAfter={entry.segment.continuesAfter}
            fresh={freshIds.includes(entry.item.intervention.id)}
            draggable={plannable}
            onOpen={() => onOpen(entry.item)}
            onResizeStart={
              plannable && singleDay
                ? (event) => {
                    const state = { id: entry.item.intervention.id, startMin, endMin: entry.segment.endMin, originalEnd: entry.segment.endMin, originY: event.clientY };
                    resizeRef.current = state;
                    setResize(state);
                  }
                : undefined
            }
          />
        );
      })}

      {/* Libellé du redimensionnement en cours */}
      {resize && resizing ? (
        <div
          className={cn(
            "pointer-events-none absolute right-1 z-30 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-white shadow-md tabular",
            severityOf(resizeConflicts) === "error" ? "bg-rose-600" : severityOf(resizeConflicts) === "warning" ? "bg-amber-600" : "bg-slate-900",
          )}
          style={{ top: minuteToY(resize.endMin) + 2 }}
        >
          {hhmm(resize.startMin)} – {hhmm(resize.endMin)}
        </div>
      ) : null}

      {/* Aperçu de la zone de dépôt, aimanté au quart d'heure */}
      <AnimatePresence>
        {showPreview ? (
          <motion.div
            key="preview"
            className={cn("pointer-events-none absolute inset-x-1 z-10 rounded-md border-2 border-dashed px-1.5 py-1", PREVIEW_STYLE[severityOf(preview!.conflicts)])}
            initial={{ opacity: 0, top: minuteToY(preview!.startMin), height: Math.max(minuteToY(preview!.endMin) - minuteToY(preview!.startMin), 18) }}
            animate={{ opacity: 1, top: minuteToY(preview!.startMin), height: Math.max(minuteToY(preview!.endMin) - minuteToY(preview!.startMin), 18) }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={SPRING.snappy}
            data-testid="drop-preview"
            data-severity={severityOf(preview!.conflicts)}
          >
            <p className="text-[11px] font-semibold tabular">{preview!.label}</p>
            {preview!.conflicts[0] ? (
              <p className="mt-0.5 flex items-start gap-1 text-[10.5px] leading-tight">
                <TriangleAlertIcon className="mt-px size-3 shrink-0" />
                {preview!.conflicts[0].message}
              </p>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

/** Grille horaire (7 h – 20 h) : colonnes-jours (Semaine) ou colonnes-techniciens (Jour). */
export function TimeGrid({
  columns,
  preview,
  dragging,
  freshIds,
  nowMin,
  onOpen,
  onResize,
  evaluate,
  className,
}: {
  columns: GridColumn[];
  preview: DropPreview | null;
  dragging: boolean;
  freshIds: string[];
  nowMin: number;
  onOpen: (item: PlanningItem) => void;
  onResize: (item: PlanningItem, durationMinutes: number) => void;
  evaluate: (item: PlanningItem, column: GridColumn, startMin: number, endMin: number) => Conflict[];
  className?: string;
}) {
  const template = { gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` };
  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card shadow-xs", className)} data-testid="time-grid">
      <div className="flex border-b bg-slate-50/70">
        <div className="w-12 shrink-0" />
        <div className="grid flex-1" style={template}>
          {columns.map((column) => (
            <div key={column.id} className="min-w-0 border-l px-2 py-2 first:border-l-0">
              {column.header}
            </div>
          ))}
        </div>
      </div>
      <div className="flex">
        <div className="relative w-12 shrink-0" style={{ height: GRID_HEIGHT }} aria-hidden="true">
          {Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }, (_, i) => (
            <span key={i} className="absolute right-2 -translate-y-1/2 text-[10px] text-slate-400 tabular" style={{ top: i * HOUR_PX }}>
              {i === 0 ? "" : `${GRID_START_HOUR + i} h`}
            </span>
          ))}
        </div>
        <div className="grid flex-1" style={template}>
          {columns.map((column) => (
            <Column
              key={column.id}
              column={column}
              preview={preview}
              dragging={dragging}
              freshIds={freshIds}
              nowMin={nowMin}
              onOpen={onOpen}
              onResize={onResize}
              evaluate={evaluate}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
