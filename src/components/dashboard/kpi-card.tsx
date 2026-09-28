"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { StaggerItem } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

const ACCENTS = {
  primary: "from-blue-500/70",
  success: "from-emerald-500/70",
  warning: "from-amber-500/70",
  danger: "from-rose-500/70",
} as const;

/** Indicateur clé : libellé, valeur animée (compte depuis 0, glisse aux mises à jour), contexte. */
export function KpiCard({
  label,
  icon: Icon,
  value,
  format,
  suffix,
  detail,
  footer,
  accent = "primary",
  testId,
}: {
  label: string;
  icon: LucideIcon;
  value: number;
  format?: (value: number) => string;
  suffix?: ReactNode;
  detail?: ReactNode;
  footer?: ReactNode;
  accent?: keyof typeof ACCENTS;
  testId?: string;
}) {
  return (
    <StaggerItem className="h-full">
      <div className="relative flex h-full flex-col overflow-hidden rounded-lg border bg-card p-4 shadow-xs" data-testid={testId}>
        <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r to-transparent", ACCENTS[accent])} />
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4 text-slate-400" strokeWidth={1.75} />
          {label}
        </p>
        <p className="mt-2 flex items-baseline gap-1.5 text-2xl font-semibold tracking-tight text-slate-900">
          <AnimatedNumber value={value} format={format} />
          {suffix}
        </p>
        {detail ? <div className="mt-1 text-sm text-muted-foreground">{detail}</div> : null}
        {footer ? <div className="mt-auto pt-3">{footer}</div> : null}
      </div>
    </StaggerItem>
  );
}
