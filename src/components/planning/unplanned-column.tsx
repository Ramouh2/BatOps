"use client";

import { useDroppable } from "@dnd-kit/core";
import { AnimatePresence, motion } from "motion/react";
import { CalendarCheck2Icon, InboxIcon, PlusIcon, UndoDotIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Swap } from "@/components/motion/swap";
import type { PlanningItem } from "@/lib/store/planning-selectors";
import { cn } from "@/lib/utils";
import { PlanningCard } from "./planning-cards";

/**
 * Colonne « À planifier » : devis signés et urgences. On glisse une carte vers la grille pour la planifier,
 * ou on y redépose une intervention planifiée pour la retirer du planning.
 */
export function UnplannedColumn({
  items,
  freshIds,
  draggingPlanned,
  canCreate,
  onOpen,
  onCreate,
  className,
}: {
  items: PlanningItem[];
  freshIds: string[];
  /** Une intervention déjà planifiée est en cours de glisser : la colonne devient zone de retrait. */
  draggingPlanned: boolean;
  canCreate: boolean;
  onOpen: (item: PlanningItem) => void;
  onCreate: () => void;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "unplanned" });
  const urgent = items.filter((i) => i.intervention.priority === "urgente").length;

  return (
    <motion.section
      ref={setNodeRef}
      className={cn("relative flex flex-col rounded-lg border bg-slate-50/80 shadow-xs", className)}
      animate={{ backgroundColor: isOver ? "rgba(254, 243, 199, 0.8)" : draggingPlanned ? "rgba(255, 251, 235, 0.9)" : "rgba(248, 250, 252, 0.8)" }}
      transition={{ duration: 0.15 }}
      aria-label="Interventions à planifier"
      data-testid="unplanned-column"
    >
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <InboxIcon className="size-4 text-slate-400" />
          À planifier
          <span className="rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-800 tabular" data-testid="unplanned-count">
            <Swap swapKey={items.length}>{items.length}</Swap>
          </span>
          {urgent > 0 ? <span className="text-[11px] font-medium text-rose-600">{urgent} urgente{urgent > 1 ? "s" : ""}</span> : null}
        </h2>
        {canCreate ? (
          <Button type="button" size="icon-sm" variant="ghost" onClick={onCreate} aria-label="Nouvelle intervention">
            <PlusIcon />
          </Button>
        ) : null}
      </header>

      <AnimatePresence>
        {draggingPlanned ? (
          <motion.p
            key="drop-hint"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className={cn("mx-2 mt-2 flex items-center gap-2 overflow-hidden rounded-md border-2 border-dashed px-3 py-3 text-xs font-medium", isOver ? "border-amber-500 text-amber-900" : "border-amber-300 text-amber-800")}
          >
            <UndoDotIcon className="size-4" />
            Déposer ici pour retirer du planning
          </motion.p>
        ) : null}
      </AnimatePresence>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((item, index) => (
            <PlanningCard key={item.intervention.id} item={item} index={index} fresh={freshIds.includes(item.intervention.id)} onOpen={() => onOpen(item)} />
          ))}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {items.length === 0 && !draggingPlanned ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center px-3 py-8 text-center"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/50">
                <CalendarCheck2Icon className="size-5 text-emerald-600" />
              </span>
              <p className="mt-3 text-sm font-medium text-slate-900">Tout est planifié</p>
              <p className="mt-1 text-xs text-muted-foreground">Les devis signés et les urgences arrivent ici automatiquement.</p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">Glissez une carte sur le planning, ou touchez-la pour choisir un créneau.</p>
    </motion.section>
  );
}
