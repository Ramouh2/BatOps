"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { DURATION, EASE_OUT } from "@/lib/motion";

/**
 * Réglages de mouvement globaux. `reducedMotion="user"` : si le système demande moins d'animations,
 * les déplacements (transform, layout) sont supprimés et seules les transitions d'opacité subsistent.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: DURATION.base, ease: EASE_OUT }}>
      {children}
    </MotionConfig>
  );
}
