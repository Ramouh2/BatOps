"use client";

import { motion } from "motion/react";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Coche de confirmation qui se dessine (succès d'une action). */
export function SuccessCheck({ className }: { className?: string }) {
  return (
    <motion.svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("size-4 text-emerald-600", className)}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={SPRING.pop}
    >
      <motion.circle cx="12" cy="12" r="10" fill="currentColor" opacity={0.14} />
      <motion.path
        d="M7.5 12.5l3 3 6-6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.32, ease: "easeOut", delay: 0.08 }}
      />
    </motion.svg>
  );
}
