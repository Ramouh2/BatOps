"use client";

import { useEffect, type ReactNode } from "react";
import { batopsStore, DATA_STORAGE_KEY, useBatops } from "@/lib/store";
import { NowProvider } from "@/lib/store/now";
import { AppSplash } from "@/components/layout/app-splash";

/**
 * Relit le localStorage (ou génère la démo ClimAir Pro) puis rend l'application.
 * Les données vivant dans le navigateur, rien n'est rendu côté serveur avant l'hydratation :
 * aucun écart serveur/client possible.
 */
export function BatopsProvider({ children }: { children: ReactNode }) {
  const ready = useBatops((state) => state.hydrated && state.data !== null);

  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      batopsStore.getState().actions.ensureData();
      batopsStore.setState({ hydrated: true });
    };
    Promise.resolve(batopsStore.persist.rehydrate()).then(finish, finish);

    // Synchronisation multi-onglets : une signature sur le portail met à jour le planning ouvert à côté.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== DATA_STORAGE_KEY) return;
      Promise.resolve(batopsStore.persist.rehydrate()).then(finish, finish);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  if (!ready) return <AppSplash />;
  return <NowProvider>{children}</NowProvider>;
}
