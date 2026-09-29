"use client";

import { useSyncExternalStore } from "react";

/** Vrai si la requête média correspond (rendu client uniquement : l'application n'est jamais rendue avant hydratation). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
