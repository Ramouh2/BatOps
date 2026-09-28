"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { TrendingDownIcon, TrendingUpIcon, TriangleAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Swap } from "@/components/motion/swap";
import { useFeedback } from "@/components/motion/use-flash";
import { marginLevel, type MarginLevel } from "@/lib/domain/catalog";
import { formatEUR, formatNumber, formatPercent, formatVatRate } from "@/lib/domain/format";
import { round2, type DocumentTotals } from "@/lib/domain/money";
import { depositAmount } from "@/lib/domain/quotes";
import { DURATION, EASE_OUT, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

const money = (duration = 0.5) => ({ format: formatEUR, countUp: false, duration });

function Row({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <motion.div layout="position" className={cn("flex items-baseline justify-between gap-3", className)}>
      <dt>{label}</dt>
      <dd className="tabular">{children}</dd>
    </motion.div>
  );
}

/** Totaux HT / remise / TVA par taux / TTC / acompte — chaque montant glisse vers sa nouvelle valeur. */
export function QuoteTotals({ totals, depositPercent }: { totals: DocumentTotals; depositPercent: number }) {
  const deposit = depositPercent > 0 ? depositAmount(totals.total_ttc, depositPercent) : 0;
  return (
    <dl className="space-y-1.5 text-sm" data-testid="quote-totals">
      <AnimatePresence initial={false}>
        {totals.discount_amount_ht > 0 ? (
          <motion.div key="discount" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-1.5 overflow-hidden">
            <Row label="Sous-total HT" className="text-slate-600">
              <AnimatedNumber value={totals.subtotal_ht} {...money()} />
            </Row>
            <Row label="Remise" className="text-emerald-700">
              − <AnimatedNumber value={totals.discount_amount_ht} {...money()} />
            </Row>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <Row label="Total HT" className="font-medium text-slate-900">
        <span data-testid="total-ht">
          <AnimatedNumber value={totals.total_ht} {...money()} />
        </span>
      </Row>
      <AnimatePresence initial={false}>
        {totals.vat_breakdown.map((row) => (
          <motion.div
            key={row.rate}
            layout="position"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 6 }}
            transition={{ duration: DURATION.base, ease: EASE_OUT }}
            className="flex items-baseline justify-between gap-3 text-slate-600"
          >
            <dt>
              TVA {formatVatRate(row.rate)} <span className="text-xs text-slate-400">sur {formatEUR(row.base_ht)}</span>
            </dt>
            <dd className="tabular">
              <AnimatedNumber value={row.tva} {...money()} />
            </dd>
          </motion.div>
        ))}
      </AnimatePresence>
      <motion.div layout="position" className="mt-2 flex items-baseline justify-between gap-3 border-t pt-2.5">
        <dt className="font-semibold text-slate-900">Total TTC</dt>
        <dd className="text-xl font-semibold text-slate-900 tabular" data-testid="total-ttc">
          <AnimatedNumber value={totals.total_ttc} {...money(0.6)} />
        </dd>
      </motion.div>
      <AnimatePresence initial={false}>
        {deposit > 0 ? (
          <motion.div key="deposit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
            <dt>Acompte à la signature ({formatNumber(depositPercent)} %)</dt>
            <dd className="tabular">
              <AnimatedNumber value={deposit} {...money()} />
            </dd>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </dl>
  );
}

const LEVEL_COLOR: Record<MarginLevel, string> = {
  loss: "#E11D48",
  critical: "#F43F5E",
  low: "#F59E0B",
  correct: "#3B82F6",
  excellent: "#10B981",
};
const LEVEL_FLASH: Record<"up" | "down", string> = {
  up: "rgba(16, 185, 129, 0.14)",
  down: "rgba(245, 158, 11, 0.18)",
};
const LEVEL_RANK: Record<MarginLevel, number> = { loss: 0, critical: 1, low: 2, correct: 3, excellent: 4 };
/** Objectif de marge affiché sur la jauge (seuil « Excellente »). */
const TARGET_PERCENT = 40;

/**
 * Rentabilité en temps réel (dirigeant uniquement) : taux de marge animé, jauge colorée avec objectif,
 * badge de niveau qui bascule et halo quand la marge change de palier.
 */
export function QuoteMargin({ totals, compact = false }: { totals: DocumentTotals; compact?: boolean }) {
  const level = marginLevel(totals.margin_percent, totals.margin_ht);
  const ratio = Math.min(Math.max(totals.margin_percent, 0), 100) / 100;
  const { scope, flash } = useFeedback<HTMLDivElement>();
  const previous = useRef(level.level);
  const [trend, setTrend] = useState<"up" | "down" | null>(null);
  const coefficient = totals.cost_ht > 0 ? round2(totals.total_ht / totals.cost_ht) : 0;
  const empty = totals.total_ht === 0;

  useEffect(() => {
    if (previous.current === level.level) return;
    const direction = LEVEL_RANK[level.level] > LEVEL_RANK[previous.current] ? "up" : "down";
    previous.current = level.level;
    flash(LEVEL_FLASH[direction]);
    setTrend(direction);
    const timer = window.setTimeout(() => setTrend(null), 2200);
    return () => window.clearTimeout(timer);
  }, [level.level, flash]);

  return (
    <div ref={scope} className="-m-2 rounded-lg p-2" data-testid="quote-margin" data-margin={totals.margin_percent} data-level={level.level}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Marge estimée</p>
          <p className={cn("font-semibold text-slate-900 tabular", compact ? "text-xl" : "text-2xl")}>
            {empty ? "—" : <AnimatedNumber value={totals.margin_percent} format={formatPercent} countUp={false} duration={0.5} />}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <AnimatePresence>
            {trend ? (
              <motion.span
                key={trend}
                initial={{ opacity: 0, y: trend === "up" ? 6 : -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={SPRING.pop}
                className={cn("flex items-center gap-1 text-[11px] font-medium", trend === "up" ? "text-emerald-700" : "text-amber-700")}
                role="status"
              >
                {trend === "up" ? <TrendingUpIcon className="size-3.5" /> : <TrendingDownIcon className="size-3.5" />}
                {trend === "up" ? "Palier supérieur" : "Marge en baisse"}
              </motion.span>
            ) : null}
          </AnimatePresence>
          {!empty ? (
            <Badge tone={level.tone} className="min-w-[5.5rem] justify-center">
              <Swap swapKey={level.level}>{level.label}</Swap>
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="relative mt-3 h-2 rounded-full bg-slate-100" aria-hidden="true">
        <motion.div
          className="h-full w-full origin-left rounded-full"
          initial={false}
          animate={{ scaleX: empty ? 0 : ratio, backgroundColor: LEVEL_COLOR[level.level] }}
          transition={{ duration: DURATION.slow, ease: EASE_OUT }}
        />
        <span className="absolute -top-1 h-4 w-px bg-slate-400" style={{ left: `${TARGET_PERCENT}%` }} />
      </div>
      <div className="relative mt-1 h-3.5" aria-hidden="true">
        <span className="absolute -translate-x-1/2 text-[10px] whitespace-nowrap text-slate-400" style={{ left: `${TARGET_PERCENT}%` }}>
          objectif {TARGET_PERCENT} %
        </span>
      </div>

      {!compact ? (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-md bg-slate-50 px-2.5 py-2">
            <dt className="text-muted-foreground">Coût d&apos;achat</dt>
            <dd className="mt-0.5 font-medium text-slate-900 tabular">
              <AnimatedNumber value={totals.cost_ht} {...money()} />
            </dd>
          </div>
          <div className="rounded-md bg-slate-50 px-2.5 py-2">
            <dt className="text-muted-foreground">Marge HT</dt>
            <dd className={cn("mt-0.5 font-medium tabular", totals.margin_ht < 0 ? "text-rose-700" : "text-slate-900")}>
              <AnimatedNumber value={totals.margin_ht} {...money()} />
            </dd>
          </div>
          <div className="rounded-md bg-slate-50 px-2.5 py-2">
            <dt className="text-muted-foreground">Coefficient</dt>
            <dd className="mt-0.5 font-medium text-slate-900 tabular">{coefficient > 0 ? `× ${formatNumber(coefficient)}` : "—"}</dd>
          </div>
        </dl>
      ) : null}

      <AnimatePresence initial={false}>
        {!empty && (level.level === "loss" || level.level === "critical" || level.level === "low") ? (
          <motion.p
            key="warn"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 flex gap-2 overflow-hidden rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900"
          >
            <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
            <span>
              {level.level === "loss" ? "Ce devis est à perte." : `Marge ${level.label.toLowerCase()} : sous l'objectif de ${TARGET_PERCENT} %.`}
              {totals.discount_amount_ht > 0 ? ` La remise retire ${formatEUR(totals.discount_amount_ht)} de marge.` : " Vérifiez les quantités et les prix ajustés."}
            </span>
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
