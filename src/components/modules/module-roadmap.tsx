"use client";

import { useMemo, type ReactNode } from "react";
import { CheckIcon, DatabaseIcon, HammerIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { useCurrentUser, useData, useNow } from "@/lib/store";
import { selectModuleStats } from "@/lib/store/module-stats";
import { MODULES } from "@/lib/modules";
import type { ModuleKey } from "@/lib/navigation";
import type { Tone } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";

const TONE_DOT: Record<Tone, string> = {
  success: "bg-emerald-500",
  info: "bg-blue-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  neutral: "bg-slate-300",
  ai: "bg-amber-400",
};

/** Indicateurs live d'un module, calculés depuis le store central. */
export function ModuleLiveStats({ module }: { module: ModuleKey }) {
  const data = useData((d) => d);
  const now = useNow();
  const user = useCurrentUser();
  const stats = useMemo(
    () => (user ? selectModuleStats(module, data, now, user.role) : []),
    [module, data, now, user],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseIcon className="size-4 text-slate-400" />
          Déjà dans vos données
        </CardTitle>
        <CardDescription>Calculé en direct depuis le store ClimAir Pro.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="divide-y">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
              <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className={cn("size-1.5 rounded-full", TONE_DOT[stat.tone ?? "neutral"])} />
                {stat.label}
              </dt>
              <dd className="text-sm font-semibold text-slate-900 tabular">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/** Périmètre P0 du module et sprint de livraison (état honnête d'un module pas encore construit). */
export function ModuleScopeCard({ module }: { module: ModuleKey }) {
  const info = MODULES[module];
  return (
    <Card>
      <CardHeader>
        <Badge tone="info" className="mb-1">
          <HammerIcon />
          Livraison prévue au Sprint {info.sprint}
        </Badge>
        <CardTitle>Ce que ce module va faire</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5">
          {info.features.map((feature) => (
            <li key={feature} className="flex gap-2.5 text-sm text-slate-700">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-slate-400" />
              {feature}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function ModuleRoadmap({ module, title, description }: { module: ModuleKey; title?: ReactNode; description?: ReactNode }) {
  const info = MODULES[module];
  return (
    <>
      <PageHeader title={title ?? info.title} description={description ?? info.description} />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ModuleScopeCard module={module} />
        </div>
        <div className="lg:col-span-2">
          <ModuleLiveStats module={module} />
        </div>
      </div>
    </>
  );
}
