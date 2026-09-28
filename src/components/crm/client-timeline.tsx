"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HistoryIcon, SendHorizontalIcon } from "lucide-react";
import type { ClientActivity } from "@/types/batops";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ActivityIcon } from "@/components/shared/activity-meta";
import { EmptyState } from "@/components/shared/empty-state";
import { SuccessCheck } from "@/components/motion/success-check";
import { useFeedback } from "@/components/motion/use-flash";
import { useActions, useNow } from "@/lib/store";
import { diffInCalendarDays, toDate, toISODate } from "@/lib/domain/dates";
import { formatDateLong, formatTime } from "@/lib/domain/format";
import { insertedItem, listItem, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

function dayLabel(iso: string, now: Date): string {
  const date = toDate(iso);
  const days = diffInCalendarDays(date, now);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  const label = formatDateLong(date);
  const withYear = date.getFullYear() === now.getFullYear() ? label : `${label} ${date.getFullYear()}`;
  return withYear.charAt(0).toUpperCase() + withYear.slice(1);
}

/** Composer de note + timeline chronologique unifiée (appels, devis, interventions, photos, factures, notes). */
export function ClientTimeline({ clientId, activities }: { clientId: string; activities: ClientActivity[] }) {
  const now = useNow();
  const { addClientNote } = useActions();
  const [note, setNote] = useState("");
  const [justAdded, setJustAdded] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const mountedAt = useRef(new Date().toISOString());
  const { scope, shake } = useFeedback<HTMLFormElement>();

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!addClientNote(clientId, note)) {
      shake();
      return;
    }
    setNote("");
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1600);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
  };

  const shown = activities.slice(0, limit);
  const groups: { key: string; label: string; items: ClientActivity[] }[] = [];
  for (const activity of shown) {
    const key = toISODate(toDate(activity.created_at));
    const group = groups.at(-1);
    if (group?.key === key) group.items.push(activity);
    else groups.push({ key, label: dayLabel(activity.created_at, now), items: [activity] });
  }

  return (
    <div>
      <form ref={scope} onSubmit={submit} className="mb-6 rounded-lg border bg-slate-50/50 p-3 transition-shadow focus-within:shadow-sm focus-within:ring-1 focus-within:ring-slate-200">
        <label htmlFor="client-note" className="sr-only">
          Ajouter une note
        </label>
        <Textarea
          id="client-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Ajouter une note (appel, accès, préférence du client…)"
          className="min-h-14 resize-none border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            <kbd className="rounded border bg-white px-1 font-mono text-[10px]">Ctrl</kbd> +{" "}
            <kbd className="rounded border bg-white px-1 font-mono text-[10px]">Entrée</kbd> pour ajouter
          </p>
          <div className="flex items-center gap-2">
            <AnimatePresence>
              {justAdded ? (
                <motion.span
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1 text-xs font-medium text-emerald-700"
                >
                  <SuccessCheck /> Note ajoutée
                </motion.span>
              ) : null}
            </AnimatePresence>
            <Button type="submit" size="sm" disabled={!note.trim()}>
              <SendHorizontalIcon />
              Ajouter la note
            </Button>
          </div>
        </div>
      </form>

      {activities.length === 0 ? (
        <EmptyState icon={HistoryIcon} title="Aucun événement" description="Les appels, devis, interventions et notes apparaîtront ici." />
      ) : (
        <motion.div layout className="space-y-6">
          <AnimatePresence initial={false} mode="popLayout">
            {groups.map((group) => (
              <motion.section key={group.key} layout variants={listItem} initial="initial" animate="animate" exit="exit" transition={SPRING.layout}>
                <h3 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">{group.label}</h3>
                <ol className="relative space-y-1 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-slate-200">
                  <AnimatePresence initial={false} mode="popLayout">
                    {group.items.map((activity) => {
                      const fresh = activity.created_at > mountedAt.current;
                      return (
                        <motion.li
                          key={activity.id}
                          layout
                          variants={fresh ? insertedItem : listItem}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          transition={SPRING.layout}
                          className="relative flex gap-3 rounded-md py-1.5 pr-2"
                          data-testid="timeline-item"
                        >
                          {fresh ? (
                            <motion.span
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-0 -left-1 rounded-md bg-blue-50"
                              initial={{ opacity: 1 }}
                              animate={{ opacity: 0 }}
                              transition={{ duration: 1.8, delay: 0.3, ease: "easeOut" }}
                            />
                          ) : null}
                          <ActivityIcon type={activity.type} className="relative bg-white" />
                          <div className="relative min-w-0 flex-1 pt-0.5">
                            <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                              <span className="font-medium text-slate-900">{activity.title}</span>
                              <time dateTime={activity.created_at} className="text-xs text-slate-400 tabular">
                                {formatTime(activity.created_at)}
                              </time>
                            </p>
                            {activity.description ? (
                              <p className={cn("mt-0.5 text-sm text-slate-600", activity.type === "note" && "whitespace-pre-line")}>{activity.description}</p>
                            ) : null}
                            {activity.actor_name ? <p className="mt-0.5 text-xs text-muted-foreground">{activity.actor_name}</p> : null}
                          </div>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ol>
              </motion.section>
            ))}
          </AnimatePresence>
          {activities.length > limit ? (
            <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
              Afficher les événements plus anciens ({activities.length - limit})
            </Button>
          ) : null}
        </motion.div>
      )}
    </div>
  );
}
