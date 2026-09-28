"use client";

import { useState } from "react";
import { motion } from "motion/react";
import type { Quote } from "@/types/batops";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useFeedback } from "@/components/motion/use-flash";
import { useActions } from "@/lib/store";
import { REFUSAL_REASONS } from "@/lib/domain/portal";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Refus du devis : motif (une touche) + précision facultative, sans formulaire intimidant. */
export function RefuseQuoteDialog({
  open,
  onOpenChange,
  quote,
  onRefused,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: Quote;
  onRefused: () => void;
}) {
  const { refuseQuote } = useActions();
  const [reason, setReason] = useState<string>("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | undefined>();
  const { scope, shake } = useFeedback<HTMLDivElement>();

  const submit = () => {
    const result = refuseQuote({ quote_id: quote.id, reason, comment });
    if (!result.ok) {
      setError(Object.values(result.errors)[0]);
      shake();
      return;
    }
    onOpenChange(false);
    onRefused();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div ref={scope}>
          <DialogHeader>
            <DialogTitle>Refuser le devis {quote.reference}</DialogTitle>
            <DialogDescription>Votre réponse aide l&apos;entreprise à vous faire une meilleure proposition. Merci !</DialogDescription>
          </DialogHeader>
          <div role="radiogroup" aria-label="Motif du refus" className="mt-4 grid gap-2">
            {REFUSAL_REASONS.map((label) => {
              const active = reason === label;
              return (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setReason(label);
                    setError(undefined);
                  }}
                  className={cn(
                    "relative flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
                    active ? "border-slate-900 bg-slate-50 text-slate-900" : "text-slate-700 hover:border-slate-300",
                  )}
                >
                  <span className={cn("flex size-4 items-center justify-center rounded-full border", active ? "border-slate-900" : "border-slate-300")}>
                    {active ? <motion.span layoutId="refusal-dot" transition={SPRING.snappy} className="size-2 rounded-full bg-slate-900" /> : null}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
          <label htmlFor="refusal-comment" className="mt-4 mb-1.5 block text-sm font-medium text-slate-900">
            Précision (facultatif)
          </label>
          <Textarea id="refusal-comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ex. Nous préférons attendre le printemps." />
          {error ? (
            <p role="alert" className="mt-2 text-xs font-medium text-rose-600">
              {error}
            </p>
          ) : null}
          <DialogFooter className="mt-5">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button variant="secondary" onClick={submit} disabled={!reason} data-testid="confirm-refuse" className="border border-slate-300">
              Confirmer le refus
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
