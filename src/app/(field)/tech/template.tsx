"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { EASE_OUT } from "@/lib/motion";

/** Transition d'entrée des écrans terrain. */
export default function FieldTemplate({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.28, ease: EASE_OUT }}>
      {children}
    </motion.div>
  );
}
