"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { EASE_OUT } from "@/lib/motion";

/** Transition d'entrée de chaque page du bureau (le template est remonté à chaque navigation). */
export default function OfficeTemplate({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }}>
      {children}
    </motion.div>
  );
}
