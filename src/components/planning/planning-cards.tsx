"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useDraggable, type DraggableAttributes } from "@dnd-kit/core";
import { motion } from "motion/react";
import { CheckIcon, ClockIcon, FileSignatureIcon, GripVerticalIcon, PhoneIncomingIcon, ShieldCheckIcon, SnowflakeIcon, TriangleAlertIcon, UserRoundXIcon } from "lucide-react";
import type { Intervention } from "@/types/batops";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Swap } from "@/components/motion/swap";
import { formatDuration, formatTime } from "@/lib/domain/format";
import { INTERVENTION_STATUS, INTERVENTION_TYPE_LABEL, PRIORITY } from "@/lib/domain/labels";
import type { PlanningItem } from "@/lib/store/planning-selectors";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { dragId, tint } from "./planning-shared";

const LIVE = new Set<Intervention["status"]>(["en_route", "sur_place", "en_cours"]);
const NEUTRAL = "#94A3B8";

function PriorityDot({ priority }: { priority: Intervention["priority"] }) {
  if (priority === "normale") return null;
  return (
    <span className="relative flex size-2 shrink-0" title={`Priorité ${PRIORITY[priority].label.toLowerCase()}`}>
      {priority === "urgente" ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-500 opacity-60" /> : null}
      <span className={cn("relative inline-flex size-2 rounded-full", priority === "urgente" ? "bg-rose-500" : "bg-amber-500")} />
    </span>
  );
}

/** Halo rouge qui pulse deux fois quand un conflit apparaît, puis reste en anneau. */
function conflictPulse(item: PlanningItem) {
  if (item.conflicts.length === 0) return {};
  const error = item.conflicts.some((c) => c.severity === "error");
  const color = error ? "244, 63, 94" : "245, 158, 11";
  return {
    animate: { boxShadow: [`0 0 0 0 rgba(${color}, 0.55)`, `0 0 0 7px rgba(${color}, 0)`, `0 0 0 0 rgba(${color}, 0.55)`, `0 0 0 7px rgba(${color}, 0)`, `0 0 0 2px rgba(${color}, 0.85)`] },
    transition: { duration: 1.6, ease: "easeOut" as const },
  };
}

/* ------------------------------------------------------------------ */
/* Bloc horaire (grilles Jour / Semaine)                               */
/* ------------------------------------------------------------------ */


type DragListeners = ReturnType<typeof useDraggable>["listeners"];

/**
 * Carte glissable (attributs dnd-kit) ou simple bouton : Entrée ouvre toujours la carte,
 * Espace saisit la carte glissable (clavier), ou l'ouvre si elle ne se déplace pas.
 */
function interactionProps(draggable: boolean, attributes: DraggableAttributes, listeners: DragListeners, onOpen: () => void) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || (!draggable && event.key === " ")) {
      event.preventDefault();
      event.stopPropagation();
      onOpen();
      return;
    }
    (listeners?.onKeyDown as ((e: React.KeyboardEvent<HTMLElement>) => void) | undefined)?.(event);
  };
  return draggable ? { ...attributes, ...listeners, onKeyDown } : { role: "button" as const, tabIndex: 0, onKeyDown };
}

export function GridEvent({
  item,
  style,
  height,
  startMin,
  endMin,
  continuesBefore,
  continuesAfter,
  fresh,
  draggable,
  onOpen,
  onResizeStart,
  index = 0,
}: {
  item: PlanningItem;
  style: CSSProperties;
  height: number;
  startMin: number;
  endMin: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  fresh: boolean;
  draggable: boolean;
  onOpen: () => void;
  onResizeStart?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  index?: number;
}) {
  const { intervention } = item;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId(intervention.id),
    data: { interventionId: intervention.id },
    disabled: !draggable,
  });
  const color = item.technician?.color_hex ?? NEUTRAL;
  const done = intervention.status === "terminee";
  const live = LIVE.has(intervention.status);
  const compact = height < 44;
  const time = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const pulse = conflictPulse(item);
  const conflictKey = item.conflicts.map((c) => c.kind + (c.with_id ?? "")).join("|");

  return (
    <motion.div
      ref={setNodeRef}
      layout="position"
      initial={fresh ? { opacity: 0, scale: 0.92 } : { opacity: 0, y: 6 }}
      animate={{ opacity: isDragging ? 0.35 : 1, scale: 1, y: 0, ...("animate" in pulse ? pulse.animate : {}) }}
      transition={fresh ? SPRING.pop : { duration: 0.25, delay: Math.min(index * 0.025, 0.3), ...("transition" in pulse ? { boxShadow: pulse.transition } : {}) }}
      key={conflictKey || "ok"}
      style={{
        ...style,
        height,
        backgroundColor: done ? "#F8FAFC" : tint(color, 0.12),
        borderColor: done ? "#E2E8F0" : tint(color, 0.35),
        borderLeftColor: done ? "#CBD5E1" : color,
      }}
      className={cn(
        "group absolute overflow-hidden rounded-md border border-l-[3px] text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        isDragging && "border-dashed",
        continuesBefore && "rounded-t-none",
        continuesAfter && "rounded-b-none",
      )}
      data-testid="planning-event"
      data-intervention={intervention.id}
      data-reference={intervention.reference}
      data-conflict={item.conflicts.length > 0 ? "true" : undefined}
      {...interactionProps(draggable, attributes, listeners, onOpen)}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      aria-label={`${intervention.reference} — ${intervention.title}, ${item.clientName}, ${time(startMin)} à ${time(endMin)}${item.technician ? `, ${item.technician.full_name}` : ""}${item.conflicts.length ? ", conflit" : ""}`}
    >
      {fresh ? (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-white"
          initial={{ opacity: 0.85 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />
      ) : null}
      <div className={cn("relative flex h-full flex-col px-1.5", compact ? "justify-center py-0" : "py-1")}>
        <p className="flex items-center gap-1 overflow-hidden text-[11px] leading-tight font-semibold whitespace-nowrap tabular" style={{ color: done ? "#64748B" : color }}>
          <PriorityDot priority={intervention.priority} />
          {continuesBefore && continuesAfter ? "Journée (suite)" : `${continuesBefore ? "Suite" : time(startMin)} – ${continuesAfter ? "suite" : time(endMin)}`}
          {live ? (
            <span className="ml-auto flex items-center gap-1 rounded bg-white/80 px-1 text-[10px] font-medium text-blue-700">
              <span className="size-1.5 animate-pulse rounded-full bg-blue-600" />
              <Swap swapKey={intervention.status}>{INTERVENTION_STATUS[intervention.status].label}</Swap>
            </span>
          ) : done ? (
            <CheckIcon className="ml-auto size-3 text-emerald-600" strokeWidth={3} />
          ) : item.conflicts.length ? (
            <TriangleAlertIcon className={cn("ml-auto size-3", item.conflicts.some((c) => c.severity === "error") ? "text-rose-600" : "text-amber-600")} />
          ) : null}
        </p>
        <p className={cn("truncate text-xs font-medium", done ? "text-slate-500" : "text-slate-900")}>{intervention.title}</p>
        {height >= 64 ? <p className="truncate text-[11px] text-slate-600">{item.clientName}</p> : null}
        {height >= 84 && item.technician ? (
          <p className="mt-auto flex items-center gap-1 truncate text-[10px] text-slate-500">
            <UserAvatar user={item.technician} className="size-4 text-[7px]" />
            {item.technician.full_name.split(" ")[0]} · {intervention.city}
          </p>
        ) : null}
      </div>
      {onResizeStart && !continuesAfter ? (
        <div
          role="presentation"
          onPointerDown={(e) => {
            e.stopPropagation();
            onResizeStart(e);
          }}
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize opacity-0 transition-opacity group-hover:opacity-100"
          data-testid="resize-handle"
        >
          <span className="mx-auto mt-0.5 block h-1 w-6 rounded-full" style={{ backgroundColor: color }} />
        </div>
      ) : null}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Carte compacte (À planifier, matrice, mobile, aperçu glissé)         */
/* ------------------------------------------------------------------ */

const SOURCE_ICON = { quote: FileSignatureIcon, call: PhoneIncomingIcon, contract: ShieldCheckIcon, manual: ClockIcon } as const;

export function PlanningCardBody({ item, showTime = false, trailing }: { item: PlanningItem; showTime?: boolean; trailing?: ReactNode }) {
  const { intervention } = item;
  const SourceIcon = SOURCE_ICON[item.source.kind];
  return (
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <PriorityDot priority={intervention.priority} />
        <span className="font-mono">{intervention.reference}</span>
        <span>· {INTERVENTION_TYPE_LABEL[intervention.type]}</span>
        {item.needsRefrigerant ? <SnowflakeIcon className="size-3 text-sky-500" aria-label="Frigoriste requis" /> : null}
        {showTime && intervention.scheduled_start ? (
          <span className="ml-auto font-semibold text-slate-800 tabular">{formatTime(intervention.scheduled_start)}</span>
        ) : null}
      </p>
      <p className="mt-0.5 line-clamp-2 text-sm font-medium text-slate-900">{intervention.title}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {item.clientName} · {intervention.city}
      </p>
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500">
        <span className="flex items-center gap-1 tabular">
          <ClockIcon className="size-3" />
          {formatDuration(intervention.duration_minutes)}
        </span>
        <span className="flex min-w-0 items-center gap-1 truncate">
          <SourceIcon className="size-3 shrink-0" />
          <span className="truncate">{item.source.label}</span>
        </span>
        {trailing}
      </div>
    </div>
  );
}

export function PlanningCard({
  item,
  draggable = true,
  fresh = false,
  showTime = false,
  onOpen,
  index = 0,
  className,
}: {
  item: PlanningItem;
  draggable?: boolean;
  fresh?: boolean;
  showTime?: boolean;
  onOpen: () => void;
  index?: number;
  className?: string;
}) {
  const { intervention } = item;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId(intervention.id),
    data: { interventionId: intervention.id },
    disabled: !draggable,
  });
  const color = item.technician?.color_hex;
  const pulse = conflictPulse(item);

  return (
    <motion.div
      ref={setNodeRef}
      layout
      initial={fresh ? { opacity: 0, x: -16, scale: 0.97 } : { opacity: 0, y: 8 }}
      animate={{ opacity: isDragging ? 0.4 : 1, x: 0, y: 0, scale: 1, ...("animate" in pulse ? pulse.animate : {}) }}
      exit={{ opacity: 0, x: 40, scale: 0.96, transition: { duration: 0.2 } }}
      transition={fresh ? SPRING.pop : { ...SPRING.layout, delay: Math.min(index * 0.04, 0.3) }}
      className={cn(
        "group relative flex cursor-pointer gap-2 rounded-lg border bg-card p-2.5 shadow-xs transition-[border-color,box-shadow] hover:border-slate-300 hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
        isDragging && "border-dashed shadow-none",
        className,
      )}
      style={color ? { borderLeftColor: color, borderLeftWidth: 3 } : undefined}
      data-testid="planning-card"
      data-intervention={intervention.id}
      data-reference={intervention.reference}
      {...interactionProps(draggable, attributes, listeners, onOpen)}
      onClick={onOpen}
      aria-label={`${intervention.reference} — ${intervention.title}, ${item.clientName}. ${draggable ? "Glisser pour planifier, ou Entrée pour ouvrir." : "Appuyer pour planifier."}`}
    >
      {draggable ? <GripVerticalIcon className="mt-0.5 size-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" aria-hidden="true" /> : null}
      <PlanningCardBody
        item={item}
        showTime={showTime}
        trailing={
          item.technician ? (
            <UserAvatar user={item.technician} className="ml-auto size-5 text-[8px]" />
          ) : intervention.status === "nouvelle" ? null : (
            <UserRoundXIcon className="ml-auto size-3.5 text-slate-400" />
          )
        }
      />
    </motion.div>
  );
}

/** Carte soulevée qui suit le curseur pendant le glisser-déposer. */
export function DragPreview({ item, variant }: { item: PlanningItem; variant: "card" | "event" }) {
  const color = item.technician?.color_hex ?? "#2563EB";
  return (
    <motion.div
      initial={{ scale: 1, rotate: 0, boxShadow: "0 1px 2px rgb(15 23 42 / 0.08)" }}
      animate={{ scale: 1.035, rotate: -1.2, boxShadow: "0 18px 38px -12px rgb(15 23 42 / 0.35)" }}
      transition={SPRING.snappy}
      className={cn("pointer-events-none h-full rounded-lg border bg-card", variant === "event" ? "border-l-[3px] p-1.5" : "flex gap-2 p-2.5")}
      style={variant === "event" ? { borderLeftColor: color, backgroundColor: "white" } : { borderLeftColor: item.technician?.color_hex, borderLeftWidth: item.technician ? 3 : 1 }}
    >
      {variant === "event" ? (
        <>
          <p className="truncate text-[11px] font-semibold tabular" style={{ color }}>
            {item.intervention.reference}
          </p>
          <p className="truncate text-xs font-medium text-slate-900">{item.intervention.title}</p>
          <p className="truncate text-[11px] text-slate-600">{item.clientName}</p>
        </>
      ) : (
        <>
          <GripVerticalIcon className="mt-0.5 size-4 shrink-0 text-slate-400" />
          <PlanningCardBody item={item} />
        </>
      )}
    </motion.div>
  );
}
