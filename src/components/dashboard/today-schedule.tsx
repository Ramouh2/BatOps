"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { CalendarCheckIcon, MapPinIcon } from "lucide-react";
import type { Client, Intervention, User } from "@/types/batops";
import { EmptyState } from "@/components/shared/empty-state";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Swap } from "@/components/motion/swap";
import { clientDisplayName } from "@/lib/domain/clients";
import { formatTime } from "@/lib/domain/format";
import { scheduleOf, segmentOnDay } from "@/lib/domain/planning";
import { useNow } from "@/lib/store";
import { INTERVENTION_STATUS, INTERVENTION_TYPE_LABEL, PRIORITY } from "@/lib/domain/labels";
import { listItem, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

const LIVE_STATUSES = new Set(["en_route", "sur_place", "en_cours"]);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Programme de la journée : chronologique, statut des techniciens en direct. */
export function TodaySchedule({
  interventions,
  clients,
  users,
}: {
  interventions: Intervention[];
  clients: Client[];
  users: User[];
}) {
  const now = useNow();
  if (interventions.length === 0) {
    return <EmptyState icon={CalendarCheckIcon} title="Aucune intervention aujourd'hui" description="Les interventions planifiées pour la journée apparaîtront ici." />;
  }

  return (
    <motion.ol layout className="divide-y">
      <AnimatePresence initial={false}>
        {interventions.map((job, index) => {
          const client = clients.find((c) => c.id === job.client_id);
          const tech = users.find((u) => u.id === job.assigned_technician_id);
          const status = INTERVENTION_STATUS[job.status];
          const live = LIVE_STATUSES.has(job.status);
          const range = scheduleOf(job);
          const segment = range ? segmentOnDay(range, now) : null;
          return (
            <motion.li
              key={job.id}
              layout
              variants={listItem}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ ...SPRING.layout, delay: index * 0.04 }}
            >
              <Link
                href={`/interventions/${job.id}`}
                className="group -mx-2 flex items-start gap-3 rounded-md px-2 py-3 transition-colors hover:bg-slate-50 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
              >
                <div className="w-24 shrink-0 pt-0.5">
                  <p className="text-sm font-semibold text-slate-900 tabular">
                    {segment ? (segment.continuesBefore ? "Suite" : hhmm(segment.startMin)) : job.scheduled_start ? formatTime(job.scheduled_start) : "—"}
                    <span className="font-normal text-slate-400">
                      {" "}
                      – {segment ? `${hhmm(segment.endMin)}${segment.continuesAfter ? " →" : ""}` : job.scheduled_end ? formatTime(job.scheduled_end) : ""}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{INTERVENTION_TYPE_LABEL[job.type]}</p>
                </div>
                {tech ? <UserAvatar user={tech} className="mt-0.5" /> : <span className="size-7 shrink-0 rounded-full border border-dashed" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 group-hover:text-primary">{job.title}</p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <MapPinIcon className="size-3 shrink-0" />
                    {client ? clientDisplayName(client) : "Client"} · {job.city}
                    {tech ? ` · ${tech.full_name.split(" ")[0]}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={status.tone} className="gap-1.5">
                    {live ? (
                      <span className="relative flex size-1.5">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
                        <span className="relative inline-flex size-1.5 rounded-full bg-current" />
                      </span>
                    ) : null}
                    <Swap swapKey={job.status}>{status.label}</Swap>
                  </Badge>
                  {job.priority !== "normale" ? (
                    <span className={cn("text-[11px] font-medium", job.priority === "urgente" ? "text-rose-600" : "text-amber-700")}>
                      {PRIORITY[job.priority].label}
                    </span>
                  ) : null}
                </div>
              </Link>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </motion.ol>
  );
}
