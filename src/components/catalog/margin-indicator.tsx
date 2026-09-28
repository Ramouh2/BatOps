"use client";

import { motion } from "motion/react";
import type { CatalogItem } from "@/types/batops";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Swap } from "@/components/motion/swap";
import { marginLevel } from "@/lib/domain/catalog";
import { formatEUR, formatPercent } from "@/lib/domain/format";
import { catalogMargin } from "@/lib/domain/money";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

const BAR_COLOR = {
  danger: "#F43F5E",
  warning: "#F59E0B",
  info: "#3B82F6",
  success: "#10B981",
} as const;

/**
 * Marge d'un article : % animé, barre qui s'allonge et change de teinte, badge de niveau qui bascule.
 * Recalculé à chaque changement de prix (source : le store).
 */
export function MarginIndicator({
  item,
  compact = false,
  className,
}: {
  item: Pick<CatalogItem, "buying_price_ht" | "selling_price_ht">;
  compact?: boolean;
  className?: string;
}) {
  const margin = catalogMargin(item);
  const level = marginLevel(margin.margin_percent, margin.margin_ht);
  const ratio = Math.min(Math.max(margin.margin_percent, 0), 100) / 100;

  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)} data-testid="margin-indicator" data-margin={margin.margin_percent}>
      <div className="w-16 shrink-0 text-right">
        <p className="text-sm font-semibold text-slate-900 tabular">
          <AnimatedNumber value={margin.margin_percent} format={(v) => formatPercent(v)} countUp={false} duration={0.6} />
        </p>
        {!compact ? (
          <p className="text-[11px] text-muted-foreground tabular">
            <AnimatedNumber value={margin.margin_ht} format={formatEUR} countUp={false} duration={0.6} />
          </p>
        ) : null}
      </div>
      <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 sm:block" aria-hidden="true">
        <motion.div
          className="h-full w-full origin-left rounded-full"
          initial={false}
          animate={{ scaleX: ratio, backgroundColor: BAR_COLOR[level.tone] }}
          transition={{ duration: DURATION.slow, ease: EASE_OUT }}
        />
      </div>
      <Badge tone={level.tone} className="min-w-[4.75rem] justify-center">
        <Swap swapKey={level.level}>{level.label}</Swap>
      </Badge>
    </div>
  );
}
