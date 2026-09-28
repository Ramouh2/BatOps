"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EraserIcon, FileSignatureIcon, Loader2Icon, TypeIcon } from "lucide-react";
import type { Quote } from "@/types/batops";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useFeedback } from "@/components/motion/use-flash";
import { SignaturePad, type SignaturePadHandle } from "@/components/quotes/signature-pad";
import { useActions } from "@/lib/store";
import { demoSignature } from "@/lib/demo/signature";
import { formatEUR, formatNumber } from "@/lib/domain/format";
import { depositAmount } from "@/lib/domain/quotes";
import { DURATION, EASE_OUT, SPRING } from "@/lib/motion";

/** Sceau de validation : anneaux qui se propagent, cercle qui se remplit, coche qui se dessine. */
function SignedSeal() {
  return (
    <div className="relative flex size-24 items-center justify-center" aria-hidden="true">
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          className="absolute inset-0 rounded-full border-2 border-emerald-400"
          initial={{ scale: 0.6, opacity: 0.8 }}
          animate={{ scale: 1.6, opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.25 + i * 0.35 }}
        />
      ))}
      <motion.span
        className="flex size-20 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ ...SPRING.pop, delay: 0.05 }}
      >
        <motion.svg viewBox="0 0 24 24" className="size-10 text-white">
          <motion.path
            d="M6 12.5l4 4 8-9"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.3 }}
          />
        </motion.svg>
      </motion.span>
    </div>
  );
}

/**
 * Signature électronique du devis sur le portail : nom, « Bon pour accord », tracé au doigt
 * (ou signature générée depuis le nom, sans souris ni écran tactile).
 */
export function SignQuoteDialog({
  open,
  onOpenChange,
  quote,
  defaultSigner,
  companyName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: Quote;
  defaultSigner: string;
  companyName: string;
}) {
  const { signQuote } = useActions();
  const pad = useRef<SignaturePadHandle>(null);
  const [name, setName] = useState(defaultSigner);
  const [accepted, setAccepted] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [phase, setPhase] = useState<"form" | "signing" | "done">("form");
  const [intervention, setIntervention] = useState("");
  const { scope, shake } = useFeedback<HTMLDivElement>();
  const deposit = quote.deposit_percent > 0 ? depositAmount(quote.total_ttc, quote.deposit_percent) : 0;
  const ready = name.trim().length >= 2 && accepted && (hasInk || !!generated);

  const submit = () => {
    const signature = generated ?? pad.current?.toDataURL() ?? "";
    setPhase("signing");
    // Court temps de « scellement » : l'animation accompagne l'action, sans la retarder réellement.
    window.setTimeout(() => {
      const result = signQuote({ quote_id: quote.id, signer_name: name, signature_data_url: signature, accepted_terms: accepted });
      if (!result.ok) {
        setErrors(result.errors);
        setPhase("form");
        shake();
        return;
      }
      setIntervention(result.value.intervention_reference);
      setPhase("done");
    }, 350);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => phase !== "signing" && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl" showCloseButton={phase !== "signing"}>
        <AnimatePresence mode="wait" initial={false}>
          {phase === "done" ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: DURATION.slow, ease: EASE_OUT }}
              className="flex flex-col items-center py-4 text-center"
              role="status"
              data-testid="sign-success"
            >
              <SignedSeal />
              <DialogTitle className="mt-6 text-lg">Devis signé, merci !</DialogTitle>
              <DialogDescription className="mt-1 max-w-sm">
                Votre accord pour le devis {quote.reference} ({formatEUR(quote.total_ttc)} TTC) est enregistré. {companyName} vous contacte pour planifier l&apos;intervention.
              </DialogDescription>
              <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Intervention préparée : <span className="font-mono">{intervention}</span>
              </motion.p>
              <Button className="mt-6" onClick={() => onOpenChange(false)}>
                Voir mon devis signé
              </Button>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98 }} ref={scope}>
              <DialogHeader>
                <DialogTitle>Signer le devis {quote.reference}</DialogTitle>
                <DialogDescription>Signature électronique : elle a la même valeur que votre signature sur papier.</DialogDescription>
              </DialogHeader>

              <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm">
                <p className="font-medium text-slate-900">{quote.title}</p>
                <p className="mt-1 flex flex-wrap justify-between gap-2 text-slate-600">
                  <span>Montant total</span>
                  <span className="font-semibold text-slate-900 tabular">{formatEUR(quote.total_ttc)} TTC</span>
                </p>
                {deposit > 0 ? (
                  <p className="flex flex-wrap justify-between gap-2 text-slate-600">
                    <span>Acompte à la signature ({formatNumber(quote.deposit_percent)} %)</span>
                    <span className="tabular">{formatEUR(deposit)}</span>
                  </p>
                ) : null}
              </div>

              <div className="mt-4 space-y-4">
                <Field label="Nom et prénom du signataire" htmlFor="sign-name" error={errors.signer_name} required>
                  <Input id="sign-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </Field>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-900">Signature</span>
                    <div className="flex gap-1">
                      {generated ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setGenerated(null)}>
                          Dessiner à la place
                        </Button>
                      ) : (
                        <>
                          <Button type="button" variant="ghost" size="sm" onClick={() => pad.current?.clear()} disabled={!hasInk}>
                            <EraserIcon />
                            Effacer
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => name.trim().length >= 2 && setGenerated(demoSignature(name.trim()))} disabled={name.trim().length < 2}>
                            <TypeIcon />
                            Générer depuis mon nom
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <AnimatePresence mode="wait" initial={false}>
                    {generated ? (
                      <motion.div key="generated" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-40 items-center justify-center rounded-lg border-2 border-slate-300 bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element -- signature générée en data-URL */}
                        <img src={generated} alt={`Signature générée pour ${name}`} className="h-24 max-w-[80%] object-contain" />
                      </motion.div>
                    ) : (
                      <motion.div key="pad" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <SignaturePad ref={pad} onInkChange={setHasInk} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {errors.signature ? (
                    <p role="alert" className="mt-1.5 text-xs font-medium text-rose-600">
                      {errors.signature}
                    </p>
                  ) : null}
                </div>

                <label htmlFor="sign-terms" className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-slate-50">
                  <Checkbox id="sign-terms" checked={accepted} onCheckedChange={setAccepted} tone="success" className="mt-0.5" />
                  <span>
                    <span className="font-medium text-slate-900">Bon pour accord.</span> J&apos;ai lu le devis et ses conditions et je les accepte
                    {deposit > 0 ? `, y compris l'acompte de ${formatEUR(deposit)}` : ""}.
                  </span>
                </label>
                {errors.accepted_terms || errors.quote ? (
                  <p role="alert" className="text-xs font-medium text-rose-600">
                    {errors.quote ?? errors.accepted_terms}
                  </p>
                ) : null}
              </div>

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={phase === "signing"}>
                  Annuler
                </Button>
                <Button type="button" onClick={submit} disabled={!ready || phase === "signing"} className="min-w-[10.5rem] bg-emerald-600 hover:bg-emerald-700" data-testid="confirm-sign">
                  {phase === "signing" ? <Loader2Icon className="animate-spin" /> : <FileSignatureIcon />}
                  {phase === "signing" ? "Signature…" : "Signer le devis"}
                </Button>
              </div>
              {!ready ? <p className="mt-2 text-right text-xs text-muted-foreground">Nom, signature et « Bon pour accord » sont nécessaires.</p> : null}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
