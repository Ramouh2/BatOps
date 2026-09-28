"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PencilIcon } from "lucide-react";
import { useFeedback } from "@/components/motion/use-flash";
import { formatEUR } from "@/lib/domain/format";
import { parseDecimal } from "@/lib/domain/validation";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Prix éditable en place : clic → saisie ; Entrée ou perte de focus valide, Échap annule.
 * Une saisie invalide fait trembler le champ ; une valeur enregistrée fait briller la cellule.
 */
export function PriceCell({
  value,
  label,
  editable,
  onCommit,
  className,
}: {
  value: number;
  label: string;
  editable: boolean;
  /** Retourne `false` si la valeur est refusée. */
  onCommit: (value: number) => boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  /** Empêche le `blur` provoqué par la fermeture du champ de valider une seconde fois (ou après Échap). */
  const closedRef = useRef(true);
  const { scope, flash, shake } = useFeedback<HTMLDivElement>();

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (!editable) {
    return <span className={cn("text-sm text-slate-900 tabular", className)}>{formatEUR(value)}</span>;
  }

  const start = () => {
    closedRef.current = false;
    setDraft(String(value).replace(".", ","));
    setEditing(true);
  };

  const close = () => {
    closedRef.current = true;
    setEditing(false);
  };

  const commit = () => {
    if (closedRef.current) return;
    const parsed = parseDecimal(draft);
    if (parsed === null || parsed < 0) {
      shake();
      inputRef.current?.focus();
      return;
    }
    if (Math.round(parsed * 100) / 100 === value) {
      close();
      return;
    }
    if (onCommit(parsed)) {
      close();
      requestAnimationFrame(() => flash("rgba(16, 185, 129, 0.18)"));
    } else {
      shake();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    <div ref={scope} className={cn("relative -mx-1.5 rounded-md", className)}>
      <AnimatePresence mode="wait" initial={false}>
        {editing ? (
          <motion.div key="edit" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: DURATION.fast, ease: EASE_OUT }}>
            <input
              ref={inputRef}
              aria-label={label}
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={commit}
              className="h-8 w-28 rounded-md border border-primary bg-white px-2 text-right text-sm tabular shadow-sm ring-[3px] ring-primary/15 outline-none"
            />
          </motion.div>
        ) : (
          <motion.button
            key="view"
            type="button"
            onClick={start}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.fast }}
            aria-label={`${label} : ${formatEUR(value)}. Modifier`}
            className="group/price flex h-8 items-center gap-1.5 rounded-md px-1.5 text-sm text-slate-900 tabular transition-colors hover:bg-slate-100 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
          >
            {formatEUR(value)}
            <PencilIcon className="size-3 text-slate-300 opacity-0 transition-opacity group-hover/price:opacity-100 group-focus-visible/price:opacity-100" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
