import { cn } from "@/lib/utils";

/** Monogramme BATOPS : un « B » en deux flux (chaud / froid) + le point ambre de l'énergie et de l'IA. */
export function BatopsMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="8" fill="#2563EB" />
      <path d="M9.5 7.5h7.25a4.75 4.75 0 0 1 0 9.5H9.5z" fill="#fff" />
      <path d="M9.5 17h8.75a4.75 4.75 0 0 1 0 9.5H9.5z" fill="#fff" fillOpacity=".72" />
      <circle cx="24" cy="9" r="2.25" fill="#F59E0B" />
    </svg>
  );
}

export function BatopsWordmark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BatopsMark />
      <span className={cn("text-lg font-bold tracking-[-0.02em]", inverted ? "text-white" : "text-slate-900")}>BATOPS</span>
    </span>
  );
}
