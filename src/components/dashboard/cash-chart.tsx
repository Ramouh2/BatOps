"use client";

import { useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChartLineIcon, TableIcon } from "lucide-react";
import { useElementWidth } from "@/components/shared/use-element-width";
import { formatEUR, formatEURAxis } from "@/lib/domain/format";
import type { CashPoint, CashSeries } from "@/lib/store/dashboard";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Encaissements cumulés du mois en cours (accent) vs mois précédent (gris d'atténuation).
 * Forme « emphase » : une seule série en couleur, la référence en gris ; libellés de fin + légende + tableau.
 */
const HEIGHT = 208;
const MARGIN = { top: 14, right: 72, bottom: 26, left: 48 };
const ACCENT = "#2563EB";
const MUTED = "#94A3B8";
const GRID = "#EEF2F6";

function niceStep(max: number): number {
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rough, 1)));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * magnitude);
  return candidates.find((c) => c >= rough) ?? 10 * magnitude;
}

export function CashChart({ series }: { series: CashSeries }) {
  const { ref, width } = useElementWidth<HTMLDivElement>(640);
  const reduceMotion = useReducedMotion();
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const geometry = useMemo(() => {
    const plotW = Math.max(width - MARGIN.left - MARGIN.right, 120);
    const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
    const maxValue = Math.max(series.current.at(-1)?.cumulative ?? 0, series.previous.at(-1)?.cumulative ?? 0, 1);
    const step = niceStep(maxValue);
    const yMax = Math.ceil(maxValue / step) * step;
    const x = (day: number) => MARGIN.left + (day / series.daysInMonth) * plotW;
    const y = (value: number) => MARGIN.top + plotH - (value / yMax) * plotH;
    const line = (points: CashPoint[]) =>
      points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.day).toFixed(1)} ${y(p.cumulative).toFixed(1)}`).join(" ");
    const area = (points: CashPoint[]) =>
      `${line(points)} L${x(points.at(-1)!.day).toFixed(1)} ${y(0)} L${x(0)} ${y(0)} Z`;
    const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);
    const dayTicks = [1, 8, 15, 22, 29].filter((d) => d <= series.daysInMonth);
    return { plotW, plotH, x, y, line, area, ticks, dayTicks };
  }, [width, series]);

  const currentEnd = series.current.at(-1)!;
  const previousEnd = series.previous.at(-1)!;
  const endLabels = (() => {
    const yCurrent = geometry.y(currentEnd.cumulative);
    let yPrevious = geometry.y(previousEnd.cumulative);
    if (Math.abs(yCurrent - yPrevious) < 16) yPrevious = yCurrent + (yPrevious >= yCurrent ? 16 : -16);
    return { yCurrent, yPrevious };
  })();

  const valueAt = (points: CashPoint[], day: number) => points.find((p) => p.day === day)?.cumulative;

  const onPointerMove = (event: PointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    setHoverDay(Math.min(series.daysInMonth, Math.max(1, Math.round(ratio * series.daysInMonth))));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      setHoverDay((day) => Math.min(series.daysInMonth, Math.max(1, (day ?? series.today) + delta)));
    }
    if (event.key === "Escape") setHoverDay(null);
  };

  const draw = reduceMotion ? { pathLength: 1 } : { pathLength: 0 };
  const tooltipLeft = hoverDay ? Math.min(Math.max(geometry.x(hoverDay) - 80, 0), width - 168) : 0;
  const tableDays = [7, 14, 21, 28, series.daysInMonth].filter((d, i, all) => all.indexOf(d) === i);

  return (
    <div ref={ref}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex items-center gap-4 text-xs text-slate-600" aria-label="Légende">
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: ACCENT }} />
            <span className="first-letter:uppercase">{series.currentLabel}</span> (en cours)
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: MUTED }} />
            <span className="first-letter:uppercase">{series.previousLabel}</span>
          </li>
        </ul>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          {showTable ? <ChartLineIcon className="size-3.5" /> : <TableIcon className="size-3.5" />}
          {showTable ? "Graphique" : "Tableau"}
        </button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {showTable ? (
          <motion.table
            key="table"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.base, ease: EASE_OUT }}
            className="w-full text-sm"
          >
            <caption className="sr-only">Encaissements cumulés TTC par jour du mois</caption>
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="py-2 text-left font-medium">
                  Au jour
                </th>
                <th scope="col" className="py-2 text-right font-medium first-letter:uppercase">
                  {series.currentLabel}
                </th>
                <th scope="col" className="py-2 text-right font-medium first-letter:uppercase">
                  {series.previousLabel}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y tabular">
              {tableDays.map((day) => {
                const current = day <= series.today ? valueAt(series.current, day) : undefined;
                const previous = valueAt(series.previous, Math.min(day, previousEnd.day));
                return (
                  <tr key={day}>
                    <td className="py-2 text-slate-600">{day}</td>
                    <td className="py-2 text-right font-medium text-slate-900">{current !== undefined ? formatEUR(current) : "—"}</td>
                    <td className="py-2 text-right text-slate-600">{previous !== undefined ? formatEUR(previous) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </motion.table>
        ) : (
          <motion.div
            key="chart"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
            tabIndex={0}
            role="img"
            aria-label={`Encaissements cumulés : ${formatEUR(currentEnd.cumulative)} en ${series.currentLabel} au ${series.today}, contre ${formatEUR(previousEnd.cumulative)} sur tout ${series.previousLabel}. Flèches gauche et droite pour parcourir les jours.`}
            onKeyDown={onKeyDown}
            onBlur={() => setHoverDay(null)}
          >
            <svg width={width} height={HEIGHT} className="block overflow-visible" aria-hidden="true">
              {geometry.ticks.map((tick) => (
                <g key={tick}>
                  <line x1={MARGIN.left} x2={MARGIN.left + geometry.plotW} y1={geometry.y(tick)} y2={geometry.y(tick)} stroke={GRID} strokeWidth={1} />
                  <text x={MARGIN.left - 8} y={geometry.y(tick)} textAnchor="end" dominantBaseline="middle" className="fill-slate-400 text-[11px] tabular">
                    {formatEURAxis(tick)}
                  </text>
                </g>
              ))}
              {geometry.dayTicks.map((day) => (
                <text key={day} x={geometry.x(day)} y={HEIGHT - 6} textAnchor="middle" className="fill-slate-400 text-[11px] tabular">
                  {day}
                </text>
              ))}

              <motion.path
                d={geometry.line(series.previous)}
                fill="none"
                stroke={MUTED}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={draw}
                animate={{ pathLength: 1, d: geometry.line(series.previous) }}
                transition={{ duration: DURATION.chart, ease: EASE_OUT }}
              />
              <motion.path
                d={geometry.area(series.current)}
                fill={ACCENT}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.1, d: geometry.area(series.current) }}
                transition={{ duration: DURATION.slow, delay: reduceMotion ? 0 : 0.5, ease: EASE_OUT }}
              />
              <motion.path
                d={geometry.line(series.current)}
                fill="none"
                stroke={ACCENT}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={draw}
                animate={{ pathLength: 1, d: geometry.line(series.current) }}
                transition={{ duration: DURATION.chart, ease: EASE_OUT, delay: 0.15 }}
              />
              <motion.circle
                cx={geometry.x(currentEnd.day)}
                cy={geometry.y(currentEnd.cumulative)}
                r={4.5}
                fill={ACCENT}
                stroke="#fff"
                strokeWidth={2}
                initial={{ scale: reduceMotion ? 1 : 0 }}
                animate={{ scale: 1, cx: geometry.x(currentEnd.day), cy: geometry.y(currentEnd.cumulative) }}
                transition={{ type: "spring", stiffness: 420, damping: 18, delay: reduceMotion ? 0 : 1.05 }}
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
              />
              <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduceMotion ? 0 : 1.1, duration: DURATION.base }}>
                <text x={geometry.x(currentEnd.day) + 10} y={endLabels.yCurrent} dominantBaseline="middle" className="fill-slate-900 text-[11px] font-semibold tabular">
                  {formatEURAxis(currentEnd.cumulative)}
                </text>
                <text x={geometry.x(previousEnd.day) + 8} y={endLabels.yPrevious} dominantBaseline="middle" className="fill-slate-500 text-[11px] tabular">
                  {formatEURAxis(previousEnd.cumulative)}
                </text>
              </motion.g>

              {hoverDay ? (
                <g>
                  <line
                    x1={geometry.x(hoverDay)}
                    x2={geometry.x(hoverDay)}
                    y1={MARGIN.top}
                    y2={MARGIN.top + geometry.plotH}
                    stroke="#CBD5E1"
                    strokeWidth={1}
                  />
                  {hoverDay <= series.today ? (
                    <circle cx={geometry.x(hoverDay)} cy={geometry.y(valueAt(series.current, hoverDay) ?? 0)} r={4} fill={ACCENT} stroke="#fff" strokeWidth={2} />
                  ) : null}
                  {hoverDay <= previousEnd.day ? (
                    <circle cx={geometry.x(hoverDay)} cy={geometry.y(valueAt(series.previous, hoverDay) ?? 0)} r={4} fill={MUTED} stroke="#fff" strokeWidth={2} />
                  ) : null}
                </g>
              ) : null}

              <rect
                x={MARGIN.left}
                y={MARGIN.top}
                width={geometry.plotW}
                height={geometry.plotH}
                fill="transparent"
                onPointerMove={onPointerMove}
                onPointerLeave={() => setHoverDay(null)}
              />
            </svg>

            <AnimatePresence>
              {hoverDay ? (
                <motion.div
                  key="tooltip"
                  data-testid="chart-tooltip"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0, left: tooltipLeft }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: DURATION.fast, ease: EASE_OUT }}
                  className="pointer-events-none absolute top-0 w-42 rounded-lg border bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
                  style={{ left: tooltipLeft }}
                >
                  <p className="mb-1.5 font-medium text-slate-500">Au {hoverDay}</p>
                  <p className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <span className="h-0.5 w-2.5 rounded-full" style={{ backgroundColor: ACCENT }} />
                      <span className="first-letter:uppercase">{series.currentLabel}</span>
                    </span>
                    <span className={cn("font-semibold tabular", hoverDay > series.today ? "text-slate-400" : "text-slate-900")}>
                      {hoverDay <= series.today ? formatEUR(valueAt(series.current, hoverDay) ?? 0) : "—"}
                    </span>
                  </p>
                  <p className="mt-0.5 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <span className="h-0.5 w-2.5 rounded-full" style={{ backgroundColor: MUTED }} />
                      <span className="first-letter:uppercase">{series.previousLabel}</span>
                    </span>
                    <span className="font-semibold text-slate-900 tabular">
                      {hoverDay <= previousEnd.day ? formatEUR(valueAt(series.previous, hoverDay) ?? 0) : "—"}
                    </span>
                  </p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
