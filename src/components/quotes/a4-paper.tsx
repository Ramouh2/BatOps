"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { A4_HEIGHT_PX, A4_WIDTH_PX } from "./quote-document";

/**
 * Feuille A4 (794 px) mise à l'échelle de son conteneur : l'aperçu reste fidèle à l'impression
 * quelle que soit la largeur disponible.
 */
export function A4Paper({ children, className, maxScale = 1 }: { children: ReactNode; className?: string; maxScale?: number }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [height, setHeight] = useState(A4_HEIGHT_PX);

  useEffect(() => {
    const outerNode = outer.current;
    const innerNode = inner.current;
    if (!outerNode || !innerNode) return;
    const measure = () => {
      setScale(Math.min(maxScale, (outerNode.clientWidth || A4_WIDTH_PX) / A4_WIDTH_PX));
      setHeight(innerNode.offsetHeight || A4_HEIGHT_PX);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outerNode);
    observer.observe(innerNode);
    return () => observer.disconnect();
  }, [maxScale]);

  return (
    <div ref={outer} className={cn("w-full", className)}>
      <div className="relative mx-auto" style={{ width: A4_WIDTH_PX * scale, height: height * scale }}>
        <div
          ref={inner}
          className="absolute top-0 left-0 origin-top-left rounded-[3px] bg-white p-[56px] shadow-[0_1px_2px_rgb(15_23_42/0.06),0_12px_32px_-12px_rgb(15_23_42/0.22)] ring-1 ring-slate-900/5"
          style={{ width: A4_WIDTH_PX, minHeight: A4_HEIGHT_PX, transform: `scale(${scale})` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Copie imprimable du document, montée directement sous `<body>` : `window.print()` n'imprime qu'elle
 * (voir `.print-root` dans globals.css). « Enregistrer au format PDF » du navigateur produit le PDF, à 0 €.
 */
export function PrintRoot({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => setContainer(document.body), []);
  if (!container) return null;
  return createPortal(
    <div className="print-root" aria-hidden="true">
      {children}
    </div>,
    container,
  );
}

export function printDocument() {
  window.print();
}
