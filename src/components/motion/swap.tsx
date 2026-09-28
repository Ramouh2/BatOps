"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Remplace un contenu par un autre avec un glissé vertical (statut qui change, compteur, libellé).
 * `swapKey` doit changer quand le contenu change.
 */
export function Swap({ swapKey, children, className }: { swapKey: string | number; children: ReactNode; className?: string }) {
  return (
    <span className={cn("relative inline-flex overflow-hidden align-middle", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={swapKey}
          className="inline-flex"
          initial={{ y: "70%", opacity: 0, filter: "blur(2px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ y: "-70%", opacity: 0, filter: "blur(2px)" }}
          transition={{ duration: DURATION.base, ease: EASE_OUT }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
