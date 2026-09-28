"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PenLineIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SignaturePadHandle {
  clear(): void;
  /** Tracé en PNG, ou `null` si le cadre est vide. */
  toDataURL(): string | null;
}

/** Longueur minimale de tracé (px) pour considérer qu'il y a une signature. */
const MIN_INK = 60;

/**
 * Cadre de signature au doigt / à la souris / au stylet (canvas haute densité, tracé lissé).
 */
export function SignaturePad({
  ref,
  onInkChange,
  className,
  label = "Signature",
}: {
  ref?: Ref<SignaturePadHandle>;
  onInkChange?: (hasInk: boolean) => void;
  className?: string;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const ink = useRef(0);
  const [hasInk, setHasInk] = useState(false);

  const setInk = useCallback(
    (value: boolean) => {
      setHasInk(value);
      onInkChange?.(value);
    },
    [onInkChange],
  );

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.4;
  }, []);

  useEffect(() => {
    setup();
  }, [setup]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    ink.current = 0;
    setInk(false);
  }, [setInk]);

  useImperativeHandle(ref, () => ({
    clear,
    toDataURL: () => (ink.current >= MIN_INK && canvasRef.current ? canvasRef.current.toDataURL("image/png") : null),
  }));

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  return (
    <div className={cn("relative", className)}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`${label} : dessinez votre signature dans le cadre`}
        data-testid="signature-pad"
        className="block h-40 w-full cursor-crosshair touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white transition-colors hover:border-slate-400 data-[ink=true]:border-solid data-[ink=true]:border-slate-300"
        data-ink={hasInk}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drawing.current = true;
          last.current = point(event);
          const ctx = event.currentTarget.getContext("2d");
          if (ctx && last.current) {
            ctx.beginPath();
            ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2);
            ctx.fillStyle = "#0f172a";
            ctx.fill();
          }
        }}
        onPointerMove={(event) => {
          if (!drawing.current || !last.current) return;
          const ctx = event.currentTarget.getContext("2d");
          const next = point(event);
          if (!ctx) return;
          const mid = { x: (last.current.x + next.x) / 2, y: (last.current.y + next.y) / 2 };
          ctx.beginPath();
          ctx.moveTo(last.current.x, last.current.y);
          ctx.quadraticCurveTo(last.current.x, last.current.y, mid.x, mid.y);
          ctx.lineTo(next.x, next.y);
          ctx.stroke();
          ink.current += Math.hypot(next.x - last.current.x, next.y - last.current.y);
          last.current = next;
          if (!hasInk && ink.current >= MIN_INK) setInk(true);
        }}
        onPointerUp={() => {
          drawing.current = false;
          last.current = null;
        }}
        onPointerCancel={() => {
          drawing.current = false;
          last.current = null;
        }}
      />
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-slate-200" />
      <AnimatePresence>
        {!hasInk ? (
          <motion.span
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-400"
          >
            <PenLineIcon className="size-4" />
            Signez ici avec le doigt ou la souris
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
