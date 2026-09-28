"use client";

import { useEffect, useRef, useState } from "react";

/** Largeur d'un élément, mise à jour au redimensionnement (graphiques responsives). */
export function useElementWidth<T extends HTMLElement>(fallback = 600) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(node.clientWidth || fallback);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width) || fallback));
    observer.observe(node);
    return () => observer.disconnect();
  }, [fallback]);
  return { ref, width };
}
