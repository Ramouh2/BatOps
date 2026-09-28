"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleAlertIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Champ de formulaire : libellé, contrôle, aide, erreur animée (apparition / disparition en hauteur). */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="text-rose-500" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      {children}
      <AnimatePresence initial={false} mode="popLayout">
        {error ? (
          <motion.p
            key="error"
            id={`${htmlFor}-error`}
            role="alert"
            className="flex items-center gap-1 text-xs font-medium text-rose-600"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: DURATION.fast, ease: EASE_OUT }}
          >
            <CircleAlertIcon className="size-3.5 shrink-0" />
            {error}
          </motion.p>
        ) : hint ? (
          <motion.p key="hint" className="text-xs text-muted-foreground" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {hint}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
