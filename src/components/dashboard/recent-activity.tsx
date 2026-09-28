"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ActivityIcon as ActivityGlyph } from "lucide-react";
import type { Client, ClientActivity } from "@/types/batops";
import { ActivityIcon } from "@/components/shared/activity-meta";
import { EmptyState } from "@/components/shared/empty-state";
import { useNow } from "@/lib/store";
import { clientDisplayName } from "@/lib/domain/clients";
import { formatRelativeTime } from "@/lib/domain/format";
import { insertedItem, SPRING } from "@/lib/motion";

/** Fil d'activité de toute l'entreprise : chaque mutation du store y apparaît en direct. */
export function RecentActivity({ activities, clients }: { activities: ClientActivity[]; clients: Client[] }) {
  const now = useNow();
  if (activities.length === 0) {
    return <EmptyState icon={ActivityGlyph} title="Pas encore d'activité" />;
  }
  return (
    <motion.ol layout className="relative space-y-1">
      <AnimatePresence initial={false} mode="popLayout">
        {activities.map((activity) => {
          const client = clients.find((c) => c.id === activity.client_id);
          return (
            <motion.li key={activity.id} layout variants={insertedItem} initial="initial" animate="animate" exit="exit" transition={SPRING.layout}>
              <Link
                href={`/clients/${activity.client_id}`}
                className="group -mx-2 flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-slate-50 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
              >
                <ActivityIcon type={activity.type} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-slate-900">{activity.title}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="truncate text-slate-600 group-hover:text-primary">{client ? clientDisplayName(client) : "Client"}</span>
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <time dateTime={activity.created_at} className="shrink-0 tabular">
                      {formatRelativeTime(activity.created_at, now)}
                    </time>
                  </p>
                </div>
              </Link>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </motion.ol>
  );
}
