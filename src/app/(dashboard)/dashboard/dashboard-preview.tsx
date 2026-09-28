"use client";

import { useMemo } from "react";
import { ModuleRoadmap } from "@/components/modules/module-roadmap";
import { useCurrentUser, useData, useNow } from "@/lib/store";
import { selectInterventionsOfDay } from "@/lib/store/selectors";
import { formatDateLong } from "@/lib/domain/format";

export function DashboardPreview() {
  const user = useCurrentUser();
  const data = useData((d) => d);
  const now = useNow();
  const todayCount = useMemo(() => selectInterventionsOfDay(data, now).length, [data, now]);
  const firstName = user?.full_name.split(" ")[0] ?? "";
  const date = formatDateLong(now);

  return (
    <ModuleRoadmap
      module="dashboard"
      title={`Bonjour ${firstName}`}
      description={`${date.charAt(0).toUpperCase()}${date.slice(1)} — ${todayCount} intervention${todayCount > 1 ? "s" : ""} prévue${todayCount > 1 ? "s" : ""} aujourd'hui.`}
    />
  );
}
