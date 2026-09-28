"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PackageSearchIcon, PlusIcon, SearchIcon } from "lucide-react";
import type { CatalogItem } from "@/types/batops";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { marginLevel } from "@/lib/domain/catalog";
import { formatEUR, formatPercent } from "@/lib/domain/format";
import { CATALOG_CATEGORY_LABEL, UNIT_LABEL } from "@/lib/domain/labels";
import { catalogMargin } from "@/lib/domain/money";
import { normalize } from "@/providers/text";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

const MAX_RESULTS = 8;
const TONE_TEXT = { danger: "text-rose-600", warning: "text-amber-600", info: "text-blue-600", success: "text-emerald-600" } as const;

/**
 * Recherche dans le catalogue (référence, désignation, fournisseur) : la seule façon d'ajouter une ligne.
 * Sans saisie, propose les articles les plus utilisés dans vos devis. Navigation clavier ↑ ↓ Entrée.
 */
export function CatalogPicker({
  catalog,
  usage,
  showMargins,
  onPick,
  onCreate,
}: {
  catalog: CatalogItem[];
  /** Nombre d'utilisations de chaque article dans les devis (tri des suggestions). */
  usage: Map<string, number>;
  showMargins: boolean;
  onPick: (item: CatalogItem) => void;
  /** Dirigeant : créer l'article manquant dans le catalogue. */
  onCreate?: (query: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = useMemo(() => {
    const items = catalog.filter((c) => c.is_active);
    const tokens = normalize(query.trim()).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return [...items].sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.reference.localeCompare(b.reference)).slice(0, MAX_RESULTS);
    }
    return items
      .map((item) => {
        const haystack = normalize([item.reference, item.name, item.description, item.supplier_name, CATALOG_CATEGORY_LABEL[item.category]].filter(Boolean).join(" "));
        const matches = tokens.every((t) => haystack.includes(t));
        const score = (normalize(item.reference).startsWith(tokens[0]) ? 2 : 0) + (normalize(item.name).includes(tokens[0]) ? 1 : 0);
        return { item, matches, score };
      })
      .filter((r) => r.matches)
      .sort((a, b) => b.score - a.score || (usage.get(b.item.id) ?? 0) - (usage.get(a.item.id) ?? 0))
      .slice(0, MAX_RESULTS)
      .map((r) => r.item);
  }, [catalog, query, usage]);

  const pick = (item: CatalogItem) => {
    onPick(item);
    setQuery("");
    setActive(0);
    setOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = results[active];
      if (open && item) pick(item);
      else setOpen(true);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const activeId = open && results[active] ? `${listId}-${results[active].id}` : undefined;

  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
      <Input
        ref={inputRef}
        id="catalog-search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-autocomplete="list"
        aria-label="Ajouter une ligne depuis le catalogue"
        placeholder="Ajouter depuis le catalogue : référence, désignation…"
        className="h-10 pl-9"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      <AnimatePresence>
        {open ? (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: -4, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, transition: { duration: DURATION.fast } }}
            transition={{ duration: DURATION.base, ease: EASE_OUT }}
            className="absolute inset-x-0 top-full z-30 mt-1.5 origin-top overflow-hidden rounded-lg border bg-popover shadow-lg"
          >
            <p className="border-b bg-slate-50/70 px-3 py-1.5 text-[11px] font-medium text-slate-500">
              {query.trim() ? `${results.length} article${results.length > 1 ? "s" : ""} du catalogue` : "Les plus utilisés dans vos devis"}
            </p>
            {results.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-5 text-center text-sm">
                <PackageSearchIcon className="size-5 text-slate-400" />
                <p className="text-slate-700">Aucun article « {query.trim()} » dans le catalogue.</p>
                <p className="text-xs text-muted-foreground">Les devis n&apos;utilisent que les prix de votre catalogue.</p>
                {onCreate ? (
                  <Button size="sm" variant="outline" onMouseDown={(e) => e.preventDefault()} onClick={() => onCreate(query.trim())}>
                    <PlusIcon />
                    Créer l&apos;article
                  </Button>
                ) : null}
              </div>
            ) : (
              <ul id={listId} role="listbox" aria-label="Articles du catalogue" className="max-h-80 overflow-y-auto p-1">
                {results.map((item, index) => {
                  const margin = catalogMargin(item);
                  const level = marginLevel(margin.margin_percent, margin.margin_ht);
                  return (
                    <motion.li
                      key={item.id}
                      id={`${listId}-${item.id}`}
                      role="option"
                      aria-selected={index === active}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: DURATION.base, ease: EASE_OUT, delay: index * 0.02 }}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => pick(item)}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors",
                        index === active ? "bg-blue-50/80" : "hover:bg-slate-50",
                      )}
                      data-testid={`catalog-option-${item.reference}`}
                    >
                      <span className="w-28 shrink-0 font-mono text-[11px] text-slate-500">{item.reference}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-900">{item.name}</span>
                        <span className="text-xs text-muted-foreground">{CATALOG_CATEGORY_LABEL[item.category]}</span>
                      </span>
                      <span className="shrink-0 text-right tabular">
                        <span className="block font-medium text-slate-900">
                          {formatEUR(item.selling_price_ht)}
                          <span className="text-xs font-normal text-muted-foreground"> /{UNIT_LABEL[item.unit]}</span>
                        </span>
                        {showMargins ? <span className={cn("text-[11px]", TONE_TEXT[level.tone])}>marge {formatPercent(margin.margin_percent)}</span> : null}
                      </span>
                      <PlusIcon className={cn("size-4 shrink-0 transition-all", index === active ? "text-primary opacity-100" : "opacity-0")} />
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
