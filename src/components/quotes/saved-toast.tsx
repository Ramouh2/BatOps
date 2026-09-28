"use client";

import { motion } from "motion/react";
import { toast } from "sonner";
import { SuccessCheck } from "@/components/motion/success-check";
import { formatEUR, formatPercent } from "@/lib/domain/format";

/**
 * Toast d'enregistrement « premium » : coche qui se dessine, référence, montant, marge (dirigeant)
 * et une barre de temps qui se vide.
 */
export function showQuoteSavedToast({
  reference,
  created,
  totalTtc,
  marginPercent,
}: {
  reference: string;
  created: boolean;
  totalTtc: number;
  marginPercent?: number;
}) {
  const duration = 3200;
  toast.custom(
    () => (
      <div
        className="relative flex w-[356px] max-w-[calc(100vw-2rem)] items-center gap-3 overflow-hidden rounded-lg border bg-white px-4 py-3 shadow-lg"
        role="status"
        data-testid="quote-saved-toast"
      >
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-50"
        >
          <SuccessCheck className="size-6" />
        </motion.span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            {created ? "Devis créé" : "Devis enregistré"} · <span className="font-mono text-[13px]">{reference}</span>
          </p>
          <p className="text-xs text-muted-foreground tabular">
            {formatEUR(totalTtc)} TTC{marginPercent !== undefined ? ` · marge ${formatPercent(marginPercent)}` : ""}
          </p>
        </div>
        <motion.span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-emerald-500/70"
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: duration / 1000, ease: "linear" }}
        />
      </div>
    ),
    { duration },
  );
}
