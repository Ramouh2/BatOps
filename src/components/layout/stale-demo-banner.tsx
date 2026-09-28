"use client";

import { CalendarClockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useData, useNow } from "@/lib/store";
import { useUi } from "@/lib/store/ui";
import { isSameDay, toDate } from "@/lib/domain/dates";
import { formatDate } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

/**
 * Les données de démo sont relatives au jour de leur génération.
 * Si on revient un autre jour, on propose de les recaler (sinon « aujourd'hui 14 h » serait daté).
 */
export function StaleDemoBanner({ className }: { className?: string }) {
  const seededAt = useData((d) => d.seeded_at);
  const now = useNow();
  const openReset = useUi((s) => s.setResetDialogOpen);

  if (isSameDay(toDate(seededAt), now)) return null;

  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:flex-row sm:items-center sm:px-6 lg:px-8",
        className,
      )}
    >
      <CalendarClockIcon className="hidden size-4 shrink-0 sm:block" />
      <p className="min-w-0 flex-1">
        Données de démo générées le <strong className="font-semibold">{formatDate(seededAt)}</strong> : le planning
        « du jour » est décalé.
      </p>
      <Button size="sm" variant="outline" className="border-amber-300 bg-white" onClick={() => openReset(true)}>
        Recaler la démo sur aujourd&apos;hui
      </Button>
    </div>
  );
}
