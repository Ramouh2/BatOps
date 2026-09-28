"use client";

import { useEffect, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import { FileTextIcon, PrinterIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { A4Paper, printDocument } from "./a4-paper";

/**
 * Aperçu A4 plein écran : courte « mise en page » (squelette), puis la feuille monte et son contenu
 * apparaît bloc par bloc. Impression / PDF via le navigateur.
 */
export function QuotePreviewDialog({
  open,
  onOpenChange,
  reference,
  actions,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reference: string;
  /** Actions supplémentaires de la barre (ex. « Envoyer »). */
  actions?: ReactNode;
  /** Le document (rendu avec `reveal`). */
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }
    const timer = window.setTimeout(() => setReady(true), 220);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
          data-testid="quote-preview"
        >
          <motion.header
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: DURATION.slow, ease: EASE_OUT }}
            className="flex items-center gap-3 border-b border-white/10 bg-slate-900/80 px-4 py-2.5 text-white backdrop-blur"
          >
            <FileTextIcon className="size-4 text-slate-300" />
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-sm font-medium">
              Aperçu A4 — <span className="font-mono">{reference}</span>
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Aperçu du devis tel que le client le recevra, imprimable en PDF.</DialogPrimitive.Description>
            <Button size="sm" variant="secondary" onClick={printDocument} data-testid="print-quote">
              <PrinterIcon />
              Imprimer / PDF
            </Button>
            {actions}
            <DialogPrimitive.Close asChild>
              <Button size="icon-sm" variant="ghost" className="text-slate-200 hover:bg-white/10 hover:text-white" aria-label="Fermer l'aperçu">
                <XIcon />
              </Button>
            </DialogPrimitive.Close>
          </motion.header>
          <div className="flex-1 overflow-y-auto px-3 py-6 sm:px-8 sm:py-10">
            <div className="mx-auto max-w-[794px]">
              <AnimatePresence mode="wait" initial={false}>
                {ready ? (
                  <motion.div
                    key="paper"
                    initial={{ opacity: 0, y: 28, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.45, ease: EASE_OUT }}
                  >
                    <A4Paper>{children}</A4Paper>
                  </motion.div>
                ) : (
                  <motion.div
                    key="skeleton"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    className="relative mx-auto aspect-[210/297] w-full overflow-hidden rounded-[3px] bg-white/90 p-[7%]"
                    aria-label="Mise en page du devis…"
                  >
                    <div className="skeleton-shimmer absolute inset-0" />
                    <div className="h-6 w-1/3 rounded bg-slate-100" />
                    <div className="mt-8 grid grid-cols-2 gap-4">
                      <div className="h-20 rounded bg-slate-100" />
                      <div className="h-20 rounded bg-slate-100" />
                    </div>
                    <div className="mt-8 space-y-2">
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-4 rounded bg-slate-100" />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
