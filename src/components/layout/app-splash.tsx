import { BatopsMark } from "@/components/brand/logo";

/** Écran d'attente le temps de relire les données locales (quelques millisecondes). */
export function AppSplash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <BatopsMark className="size-10 animate-pulse" />
        <p className="text-sm text-muted-foreground">Chargement de l&apos;espace ClimAir Pro…</p>
      </div>
    </div>
  );
}
