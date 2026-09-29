"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarCheckIcon, CalendarClockIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import type { User } from "@/types/batops";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/segmented";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Swap } from "@/components/motion/swap";
import { addDays, isSameDay, startOfDay, toISODate } from "@/lib/domain/dates";
import { isWorkingDay, startOfWeek } from "@/lib/domain/planning";
import { itemsOnDay, type PlanningItem, type PlanningKpis } from "@/lib/store/planning-selectors";
import { DURATION, EASE_OUT, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { PlanningCard } from "./planning-cards";

const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
const longDay = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Planning mobile : bande de jours, glisser gauche / droite pour changer de jour, filtre technicien,
 * onglet « À planifier » ; toucher une carte ouvre le tiroir de planification (pouce, grandes cibles).
 */
export function PlanningMobile({
  items,
  unplanned,
  technicians,
  now,
  freshIds,
  kpis,
  canCreate,
  onOpen,
  onCreate,
}: {
  items: PlanningItem[];
  unplanned: PlanningItem[];
  technicians: User[];
  now: Date;
  freshIds: string[];
  kpis: PlanningKpis;
  canCreate: boolean;
  onOpen: (item: PlanningItem) => void;
  onCreate: () => void;
}) {
  const [tab, setTab] = useState<"agenda" | "a_planifier">("agenda");
  const [day, setDay] = useState(() => startOfDay(now));
  const [direction, setDirection] = useState(0);
  const [tech, setTech] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const swiped = useRef(false);

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(startOfWeek(now), i)), [now]);
  const entries = itemsOnDay(items, day, tech ?? undefined);

  const go = (next: Date) => {
    setDirection(next > day ? 1 : -1);
    setDay(next);
    const chip = stripRef.current?.querySelector<HTMLElement>(`[data-day="${toISODate(next)}"]`);
    chip?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };
  const step = (delta: number) => {
    let next = addDays(day, delta);
    while (!isWorkingDay(next)) next = addDays(next, delta);
    go(next);
  };

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100dvh-3.5rem)] bg-slate-50 pb-24" data-testid="planning-mobile">
      <div className="sticky top-14 z-10 border-b bg-white/95 px-4 pt-4 pb-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900">Planning</h1>
          <div className="flex items-center gap-2 text-xs">
            {kpis.conflicts > 0 ? (
              <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 font-medium text-rose-700">
                <TriangleAlertIcon className="size-3.5" />
                <Swap swapKey={kpis.conflicts}>{kpis.conflicts}</Swap>
              </span>
            ) : null}
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
              <Swap swapKey={kpis.today}>{kpis.today}</Swap> aujourd&apos;hui
            </span>
          </div>
        </div>
        <SegmentedTabs
          label="Planning mobile"
          value={tab}
          onValueChange={setTab}
          className="mt-3 w-full [&>button]:flex-1"
          items={[
            { value: "agenda", label: "Agenda" },
            {
              value: "a_planifier",
              label: "À planifier",
              suffix: (
                <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800 tabular">
                  <Swap swapKey={unplanned.length}>{unplanned.length}</Swap>
                </span>
              ),
            },
          ]}
        />
        {tab === "agenda" ? (
          <>
            <div ref={stripRef} className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Jours">
              {days.map((d) => {
                const active = isSameDay(d, day);
                const count = itemsOnDay(items, d, tech ?? undefined).length;
                return (
                  <button
                    key={toISODate(d)}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    data-day={toISODate(d)}
                    onClick={() => go(d)}
                    className={cn(
                      "relative flex w-12 shrink-0 flex-col items-center rounded-xl py-1.5 text-xs transition-colors",
                      active ? "text-white" : isWorkingDay(d) ? "text-slate-700" : "text-slate-400",
                    )}
                  >
                    {active ? <motion.span layoutId="mobile-day" transition={SPRING.snappy} className="absolute inset-0 rounded-xl bg-primary shadow-sm" /> : null}
                    <span className="relative capitalize">{weekday.format(d).replace(".", "")}</span>
                    <span className={cn("relative text-base font-semibold tabular", isSameDay(d, now) && !active && "text-primary")}>{d.getDate()}</span>
                    <span className={cn("relative mt-0.5 size-1.5 rounded-full", count > 0 ? (active ? "bg-white" : "bg-primary/60") : "bg-transparent")} />
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Technicien">
              <button
                type="button"
                onClick={() => setTech(null)}
                aria-pressed={tech === null}
                className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium", tech === null ? "border-slate-900 bg-slate-900 text-white" : "bg-white text-slate-600")}
              >
                Tous
              </button>
              {technicians.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTech(tech === t.id ? null : t.id)}
                  aria-pressed={tech === t.id}
                  className={cn("flex shrink-0 items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-xs font-medium", tech === t.id ? "border-transparent text-white" : "bg-white text-slate-600")}
                  style={tech === t.id ? { backgroundColor: t.color_hex } : undefined}
                >
                  <UserAvatar user={t} className="size-5 text-[8px]" />
                  {t.full_name.split(" ")[0]}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="px-4 pt-4">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          {tab === "agenda" ? (
            <motion.section
              key={`agenda-${toISODate(day)}-${tech ?? "all"}`}
              custom={direction}
              variants={{ enter: (d: number) => ({ opacity: 0, x: d * 40 }), center: { opacity: 1, x: 0 }, exit: (d: number) => ({ opacity: 0, x: d * -40 }) }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: EASE_OUT }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.18}
              onDragStart={() => {
                swiped.current = true;
              }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -70) step(1);
                else if (info.offset.x > 70) step(-1);
              }}
              onPointerDownCapture={() => {
                swiped.current = false;
              }}
              onClickCapture={(event) => {
                // Un glissement qui se termine sur une carte ne doit pas l'ouvrir.
                if (!swiped.current) return;
                event.stopPropagation();
                event.preventDefault();
                swiped.current = false;
              }}
              className="touch-pan-y"
              aria-label={longDay.format(day)}
            >
              <p className="mb-3 text-sm font-medium text-slate-500 first-letter:uppercase">{longDay.format(day)}</p>
              {entries.length === 0 ? (
                <div className="flex flex-col items-center rounded-xl border border-dashed bg-white px-6 py-10 text-center">
                  <CalendarCheckIcon className="size-7 text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-900">Aucune intervention</p>
                  <p className="mt-1 text-xs text-muted-foreground">Glissez vers la gauche ou la droite pour changer de jour.</p>
                </div>
              ) : (
                <ol className="space-y-2.5">
                  {entries.map(({ item, segment }, index) => (
                    <motion.li
                      key={item.intervention.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: DURATION.base, ease: EASE_OUT, delay: index * 0.04 }}
                      className="flex gap-3"
                    >
                      <div className="w-12 shrink-0 pt-2.5 text-right">
                        <p className="text-sm font-semibold text-slate-900 tabular">{segment.continuesBefore ? "…" : hhmm(segment.startMin)}</p>
                        <p className="text-[11px] text-slate-400 tabular">{segment.continuesAfter ? "…" : hhmm(segment.endMin)}</p>
                      </div>
                      <PlanningCard item={item} draggable={false} fresh={freshIds.includes(item.intervention.id)} onOpen={() => onOpen(item)} className="flex-1 bg-white" />
                    </motion.li>
                  ))}
                </ol>
              )}
            </motion.section>
          ) : (
            <motion.section
              key="unplanned"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              aria-label="À planifier"
            >
              {unplanned.length === 0 ? (
                <div className="flex flex-col items-center rounded-xl border border-dashed bg-white px-6 py-10 text-center">
                  <CalendarCheckIcon className="size-7 text-emerald-500" />
                  <p className="mt-3 text-sm font-medium text-slate-900">Tout est planifié</p>
                  <p className="mt-1 text-xs text-muted-foreground">Les devis signés et les urgences arrivent ici.</p>
                </div>
              ) : (
                <ul className="space-y-2.5">
                  <AnimatePresence initial={false} mode="popLayout">
                    {unplanned.map((item, index) => (
                      <motion.li key={item.intervention.id} layout exit={{ opacity: 0, x: 60 }} className="space-y-2 rounded-xl bg-white p-1 shadow-xs">
                        <PlanningCard item={item} index={index} draggable={false} onOpen={() => onOpen(item)} className="border-0 shadow-none" />
                        <Button size="field" className="h-12" onClick={() => onOpen(item)}>
                          <CalendarClockIcon />
                          Planifier
                        </Button>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      {canCreate ? (
        <motion.button
          type="button"
          onClick={onCreate}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileTap={{ scale: 0.92 }}
          transition={{ ...SPRING.pop, delay: 0.2 }}
          className="fixed right-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-blue-600/30"
          aria-label="Nouvelle intervention"
        >
          <PlusIcon className="size-6" />
        </motion.button>
      ) : null}
    </div>
  );
}
