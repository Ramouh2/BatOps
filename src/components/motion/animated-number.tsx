"use client";

import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Nombre animé : compte depuis 0 au montage, puis glisse vers chaque nouvelle valeur.
 * Le texte est mis à jour directement dans le DOM (aucun re-render React par image).
 */
export function AnimatedNumber({
  value,
  format = (v) => String(Math.round(v)),
  countUp = true,
  duration = DURATION.number,
  className,
}: {
  value: number;
  format?: (value: number) => string;
  /** Compter depuis 0 au premier affichage. */
  countUp?: boolean;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const displayed = useRef(countUp ? 0 : value);
  const formatRef = useRef(format);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    formatRef.current = format;
  });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduceMotion || displayed.current === value) {
      displayed.current = value;
      node.textContent = formatRef.current(value);
      return;
    }
    const controls = animate(displayed.current, value, {
      duration,
      ease: EASE_OUT,
      onUpdate: (latest) => {
        displayed.current = latest;
        node.textContent = formatRef.current(latest);
      },
      onComplete: () => {
        displayed.current = value;
        node.textContent = formatRef.current(value);
      },
    });
    return () => controls.stop();
  }, [value, duration, reduceMotion]);

  return (
    <span ref={ref} className={cn("tabular", className)} data-value={value}>
      {format(countUp && !reduceMotion ? 0 : value)}
    </span>
  );
}
