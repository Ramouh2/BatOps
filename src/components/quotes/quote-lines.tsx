"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { RotateCcwIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import type { CatalogItem, DocumentLine, VatRate } from "@/types/batops";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { marginLevel } from "@/lib/domain/catalog";
import { formatEUR, formatPercent, formatVatRate } from "@/lib/domain/format";
import { UNIT_LABEL } from "@/lib/domain/labels";
import { catalogMargin } from "@/lib/domain/money";
import { groupLinesBySection } from "@/lib/domain/quotes";
import { VAT_RATES } from "@/lib/domain/vat";
import { DURATION, EASE_OUT, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { DecimalInput } from "./decimal-input";

const TONE_TEXT = { danger: "text-rose-600", warning: "text-amber-600", info: "text-blue-600", success: "text-emerald-600" } as const;

/**
 * Lignes du devis regroupées par section. Quantité, prix (dirigeant) et TVA modifiables : totaux et marge
 * se recalculent en direct. Ajout = entrée marquée + surbrillance ; retrait = sortie glissée.
 */
export function QuoteLines({
  lines,
  catalog,
  reasons,
  freshIds,
  errors,
  canEditPrice,
  showMargins,
  onUpdate,
  onRemove,
}: {
  lines: DocumentLine[];
  catalog: CatalogItem[];
  reasons: Record<string, string>;
  freshIds: string[];
  errors: Record<string, string | undefined>;
  canEditPrice: boolean;
  showMargins: boolean;
  onUpdate: (lineId: string, patch: Partial<Pick<DocumentLine, "qty" | "unit_price_ht" | "vat_rate">>) => void;
  onRemove: (line: DocumentLine) => void;
}) {
  const sections = groupLinesBySection(lines);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  let rowIndex = 0;

  return (
    <div data-testid="quote-lines">
      <motion.div layout className="divide-y divide-slate-100">
        <AnimatePresence initial={false} mode="popLayout">
          {sections.map((section) => (
            <motion.section
              key={section.title}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: DURATION.fast } }}
              transition={SPRING.layout}
              className="py-2"
            >
              <h3 className="flex items-baseline justify-between px-2 pt-1 pb-1.5 text-xs font-semibold text-slate-500">
                {section.title}
                <span className="font-medium tabular">
                  <AnimatedNumber value={section.total_ht} format={formatEUR} countUp={false} duration={0.45} /> HT
                </span>
              </h3>
              <ul>
                <AnimatePresence initial={false} mode="popLayout">
                  {section.lines.map((line) => {
                    const index = rowIndex++;
                    const item = catalog.find((c) => c.id === line.catalog_item_id);
                    const fresh = freshIds.includes(line.id);
                    const adjusted = item !== undefined && item.selling_price_ht !== line.unit_price_ht;
                    const margin = catalogMargin({ buying_price_ht: line.buying_price_ht, selling_price_ht: line.unit_price_ht });
                    const level = marginLevel(margin.margin_percent, margin.margin_ht);
                    const reason = reasons[line.id];
                    const error = errors[`line:${line.id}`];
                    return (
                      <motion.li
                        key={line.id}
                        layout
                        initial={fresh ? { opacity: 0, y: -10, scale: 0.98 } : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -28, transition: { duration: DURATION.base, ease: EASE_OUT } }}
                        transition={fresh ? SPRING.pop : { duration: DURATION.base, ease: EASE_OUT, delay: mounted.current ? 0 : Math.min(index * 0.035, 0.4) }}
                        className="group relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 rounded-md px-2 py-2.5"
                        data-testid="quote-line"
                        data-reference={item?.reference}
                      >
                        {fresh ? (
                          <motion.span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 rounded-md bg-blue-50"
                            initial={{ opacity: 1 }}
                            animate={{ opacity: 0 }}
                            transition={{ duration: 1.6, delay: 0.25, ease: "easeOut" }}
                          />
                        ) : null}
                        <div className="relative min-w-0">
                          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate-900">
                            <span className="min-w-0">{line.name}</span>
                            {line.ai_suggested ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span tabIndex={0} className="rounded outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                                    <Badge tone="ai" className="gap-0.5 px-1.5 py-0 text-[10px]">
                                      <SparklesIcon /> IA
                                    </Badge>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-64">{reason || "Proposée par l'assistant IA, au prix de votre catalogue."}</TooltipContent>
                              </Tooltip>
                            ) : null}
                            {adjusted ? (
                              <Badge tone="warning" className="px-1.5 py-0 text-[10px]">
                                Prix ajusté
                              </Badge>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            <span className="font-mono">{item?.reference ?? "—"}</span>
                            {line.description ? ` · ${line.description}` : ""}
                          </p>
                          {error ? (
                            <p role="alert" className="mt-0.5 text-xs font-medium text-rose-600">
                              {error}
                            </p>
                          ) : null}
                        </div>

                        <p className="relative pt-0.5 text-right text-sm font-semibold text-slate-900 tabular">
                          <AnimatedNumber value={line.total_ht} format={formatEUR} countUp={false} duration={0.4} />
                        </p>

                        <div className="relative col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                          <label className="flex items-center gap-1.5">
                            <span>
                              Qté<span className="sr-only"> — {line.name}</span>
                            </span>
                            <DecimalInput
                              value={line.qty}
                              onValueChange={(qty) => onUpdate(line.id, { qty })}
                              max={10_000}
                              className="h-8 w-16 px-2 text-right text-sm"
                              data-testid="line-qty"
                            />
                            <span>{UNIT_LABEL[line.unit]}</span>
                          </label>

                          {canEditPrice ? (
                            <label className="flex items-center gap-1.5">
                              <span>
                                PU HT<span className="sr-only"> — {line.name}</span>
                              </span>
                              <DecimalInput
                                value={line.unit_price_ht}
                                onValueChange={(unit_price_ht) => onUpdate(line.id, { unit_price_ht })}
                                allowZero
                                max={1_000_000}
                                className="h-8 w-24 px-2 text-right text-sm"
                                data-testid="line-price"
                              />
                              <span>€</span>
                            </label>
                          ) : (
                            <span className="flex items-center gap-1.5">
                              PU HT <span className="text-sm text-slate-700 tabular">{formatEUR(line.unit_price_ht)}</span>
                            </span>
                          )}
                          {adjusted && item && canEditPrice ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => onUpdate(line.id, { unit_price_ht: item.selling_price_ht })}
                                  className="-ml-2 flex items-center gap-1 rounded px-1 py-0.5 text-amber-700 transition-colors hover:bg-amber-50"
                                  aria-label={`Revenir au prix catalogue (${formatEUR(item.selling_price_ht)})`}
                                >
                                  <RotateCcwIcon className="size-3.5" />
                                  catalogue
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Prix catalogue : {formatEUR(item.selling_price_ht)}</TooltipContent>
                            </Tooltip>
                          ) : null}

                          <label className="flex items-center gap-1.5">
                            <span>
                              TVA<span className="sr-only"> — {line.name}</span>
                            </span>
                            <select
                              value={line.vat_rate}
                              onChange={(e) => onUpdate(line.id, { vat_rate: Number(e.target.value) as VatRate })}
                              className="h-8 rounded-md border border-input bg-card px-1.5 text-sm text-slate-900 tabular shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
                            >
                              {VAT_RATES.map((rate) => (
                                <option key={rate} value={rate}>
                                  {formatVatRate(rate)}
                                </option>
                              ))}
                            </select>
                          </label>

                          {showMargins ? (
                            <span className={cn("tabular", TONE_TEXT[level.tone])}>marge {formatPercent(margin.margin_percent)}</span>
                          ) : null}

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onRemove(line)}
                            aria-label={`Retirer ${line.name}`}
                            className="ml-auto text-slate-400 hover:bg-rose-50 hover:text-rose-600 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                          >
                            <Trash2Icon />
                          </Button>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </motion.section>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
