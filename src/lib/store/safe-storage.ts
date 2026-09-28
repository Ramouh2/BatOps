import type { StateStorage } from "zustand/middleware";

type WebStorageKind = "localStorage" | "sessionStorage";

/** Accès au Web Storage tolérant aux navigations privées, quotas pleins et rendu serveur. */
export function webStorage(kind: WebStorageKind): Storage | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    const storage = window[kind];
    const probe = "__batops_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return undefined;
  }
}

export function safeGet(kind: WebStorageKind, key: string): string | null {
  try {
    return webStorage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeSet(kind: WebStorageKind, key: string, value: string | null): void {
  try {
    const storage = webStorage(kind);
    if (!storage) return;
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // Quota plein ou stockage bloqué : la démo continue en mémoire.
  }
}

/** StateStorage zustand adossé au localStorage, avec repli silencieux. */
export const localStateStorage: StateStorage = {
  getItem: (name) => safeGet("localStorage", name),
  setItem: (name, value) => safeSet("localStorage", name, value),
  removeItem: (name) => safeSet("localStorage", name, null),
};

/** StateStorage en mémoire (tests, environnements sans Web Storage). */
export function createMemoryStorage(): StateStorage & { dump(): Record<string, string> } {
  const store = new Map<string, string>();
  return {
    getItem: (name) => store.get(name) ?? null,
    setItem: (name, value) => void store.set(name, value),
    removeItem: (name) => void store.delete(name),
    dump: () => Object.fromEntries(store),
  };
}
