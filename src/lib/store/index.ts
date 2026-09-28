/**
 * Liaison React du store central. Toute lecture de données métier passe par ces hooks :
 * une mutation du store re-rend instantanément chaque vue abonnée.
 */
import { useMemo } from "react";
import { useStore } from "zustand";
import type { BatopsData, User } from "@/types/batops";
import { createBatopsStore, type BatopsState } from "./store";
import { selectNavCounters, selectUser, type NavCounters } from "./selectors";
import { useNow } from "./now";

export { DATA_STORAGE_KEY } from "./store";
export type { BatopsState } from "./store";

/** Instance unique côté navigateur. */
export const batopsStore = createBatopsStore();

export function useBatops<T>(selector: (state: BatopsState) => T): T {
  return useStore(batopsStore, selector);
}

/** Lecture des données métier — uniquement sous `<BatopsProvider>` (données garanties). */
export function useData<T>(selector: (data: BatopsData) => T): T {
  return useStore(batopsStore, (state) => {
    if (!state.data) throw new Error("useData() appelé avant l'hydratation du store BATOPS.");
    return selector(state.data);
  });
}

export function useActions() {
  return useStore(batopsStore, (state) => state.actions);
}

export function useCurrentUser(): User | null {
  const userId = useBatops((state) => state.session.userId);
  const data = useData((d) => d);
  return useMemo(() => selectUser(data, userId), [data, userId]);
}

export function useNavCounters(): NavCounters {
  const data = useData((d) => d);
  const now = useNow();
  return useMemo(() => selectNavCounters(data, now), [data, now]);
}

export { useNow };
