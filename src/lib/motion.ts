/**
 * Système de motion BATOPS — une seule grammaire de mouvement pour toute l'application.
 *
 * Principes : rapide (≤ 400 ms hors graphiques), sorties plus courtes que les entrées, uniquement
 * transform / opacity (GPU), ressorts « snappy » pour les éléments manipulés, easing expo-out pour les apparitions.
 * `prefers-reduced-motion` est respecté globalement (MotionConfig reducedMotion="user" + CSS).
 */
import type { Transition, Variants } from "motion/react";

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

export const DURATION = {
  fast: 0.15,
  base: 0.24,
  slow: 0.4,
  number: 0.9,
  chart: 1.1,
} as const;

export const SPRING = {
  /** Indicateurs d'onglets, pastilles actives, éléments déplacés. */
  snappy: { type: "spring", stiffness: 520, damping: 40, mass: 0.8 },
  /** Réorganisation de listes (layout). */
  layout: { type: "spring", stiffness: 420, damping: 38 },
  /** Petits rebonds de confirmation (check, badge qui change). */
  pop: { type: "spring", stiffness: 480, damping: 22 },
} satisfies Record<string, Transition>;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE_OUT } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION.base, ease: EASE_OUT } },
};

export function stagger(staggerChildren = 0.06, delayChildren = 0): Variants {
  return { hidden: {}, show: { transition: { staggerChildren, delayChildren } } };
}

/** Élément de liste qui entre, se réordonne et sort (à utiliser avec AnimatePresence + layout). */
export const listItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: DURATION.fast, ease: EASE_OUT } },
};

/** Élément inséré par l'utilisateur (création, ajout de note) : entrée marquée. */
export const insertedItem: Variants = {
  initial: { opacity: 0, y: -12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: SPRING.pop },
  exit: { opacity: 0, x: -12, transition: { duration: DURATION.fast } },
};
