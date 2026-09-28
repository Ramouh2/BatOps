"use client";

import { motion } from "motion/react";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

const TONES = {
  primary: "bg-primary",
  success: "bg-emerald-500",
  info: "bg-blue-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
} as const;

/** Barre de progression animée (scaleX, GPU) qui glisse vers chaque nouvelle valeur. */
export function ProgressBar({
  value,
  max = 100,
  tone = "primary",
  className,
  label,
}: {
  value: number;
  max?: number;
  tone?: keyof typeof TONES;
  className?: string;
  label: string;
}) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value * 100) / 100}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-100", className)}
    >
      <motion.div
        className={cn("h-full w-full origin-left rounded-full transition-colors duration-500", TONES[tone])}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: ratio }}
        transition={{ duration: DURATION.number, ease: EASE_OUT }}
      />
    </div>
  );
}
