"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LightbulbIcon, PlusIcon, XIcon } from "lucide-react";
import type { CatalogItem, DocumentLine } from "@/types/batops";
import { Button } from "@/components/ui/button";
import { formatEUR, formatNumber } from "@/lib/domain/format";
import { getAIProvider } from "@/providers";
import type { MissingItemSuggestion } from "@/providers/ai/ai.provider";
import { DURATION, EASE_OUT, SPRING } from "@/lib/motion";

/**
 * Détection d'oublis en continu (MockAIProvider.detectMissingItems) : à chaque changement de lignes,
 * l'IA signale les accessoires / prestations souvent oubliés, au prix du catalogue.
 */
export function QuoteMissingItems({
  lines,
  catalog,
  onAdd,
}: {
  lines: DocumentLine[];
  catalog: CatalogItem[];
  onAdd: (suggestion: MissingItemSuggestion) => void;
}) {
  const [suggestions, setSuggestions] = useState<MissingItemSuggestion[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const signature = lines.map((l) => `${l.catalog_item_id}:${l.qty}`).join("|");

  useEffect(() => {
    let cancelled = false;
    const refs = signature
      .split("|")
      .filter(Boolean)
      .map((part) => ({ catalog_item_id: part.split(":")[0], qty: Number(part.split(":")[1]) }));
    void getAIProvider()
      .detectMissingItems(refs, { catalog })
      .then((result) => {
        if (!cancelled) setSuggestions(result);
      });
    return () => {
      cancelled = true;
    };
  }, [signature, catalog]);

  const visible = suggestions.filter((s) => !dismissed.includes(s.rule_id));

  return (
    <AnimatePresence initial={false}>
      {visible.length > 0 ? (
        <motion.div
          key="missing"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: DURATION.slow, ease: EASE_OUT }}
          className="overflow-hidden"
          data-testid="missing-items"
        >
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-900">
              <LightbulbIcon className="size-3.5" />
              L&apos;IA a repéré {visible.length} oubli{visible.length > 1 ? "s" : ""} possible{visible.length > 1 ? "s" : ""}
            </p>
            <ul className="space-y-1.5">
              <AnimatePresence initial={false} mode="popLayout">
                {visible.map((suggestion) => (
                  <motion.li
                    key={suggestion.rule_id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97, transition: { duration: DURATION.fast } }}
                    transition={SPRING.layout}
                    className="flex items-center gap-3 rounded-md bg-white px-3 py-2 shadow-xs ring-1 ring-amber-100"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">{suggestion.name}</p>
                      <p className="text-xs text-slate-600">{suggestion.reason}</p>
                    </div>
                    <span className="hidden shrink-0 text-xs text-muted-foreground tabular sm:inline">
                      {formatNumber(suggestion.qty)} × {formatEUR(suggestion.unit_price_ht)}
                    </span>
                    <Button type="button" size="sm" variant="outline" onClick={() => onAdd(suggestion)} aria-label={`Ajouter ${suggestion.name}`}>
                      <PlusIcon />
                      Ajouter
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setDismissed((list) => [...list, suggestion.rule_id])}
                      aria-label={`Ignorer ${suggestion.name}`}
                      className="text-slate-400"
                    >
                      <XIcon />
                    </Button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
