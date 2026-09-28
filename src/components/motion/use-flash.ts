"use client";

import { useCallback } from "react";
import { useAnimate, useReducedMotion } from "motion/react";

/**
 * Retours visuels ponctuels sur un élément :
 * - `flash()` : halo bleu qui s'estompe (donnée modifiée / créée) ;
 * - `shake()` : secousse horizontale courte (saisie refusée).
 */
export function useFeedback<T extends HTMLElement = HTMLDivElement>() {
  const [scope, animate] = useAnimate<T>();
  const reduceMotion = useReducedMotion();

  const flash = useCallback(
    (color = "rgba(37, 99, 235, 0.14)") => {
      if (!scope.current) return;
      void animate(scope.current, { backgroundColor: [color, "rgba(37, 99, 235, 0)"] }, { duration: 1.2, ease: "easeOut" });
    },
    [animate, scope],
  );

  const shake = useCallback(() => {
    if (!scope.current || reduceMotion) return;
    void animate(scope.current, { x: [0, -7, 7, -4, 4, 0] }, { duration: 0.36, ease: "easeInOut" });
  }, [animate, scope, reduceMotion]);

  return { scope, flash, shake };
}
