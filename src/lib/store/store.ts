/**
 * Store central BATOPS — source unique de vérité de l'application.
 *
 * - Données métier (`data`) persistées dans le localStorage : toutes les vues lisent ce même état,
 *   donc une mutation se propage instantanément partout (et aux autres onglets via l'événement `storage`).
 * - Session (utilisateur de démo courant) conservée **par onglet** (sessionStorage) avec repli sur le
 *   dernier profil utilisé : on peut montrer la vue Patron et la vue Technicien côte à côte.
 * - Le jeu de démo est (re)généré dans le navigateur, relatif à l'instant courant.
 */
import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { BatopsData } from "@/types/batops";
import { createDemoData, DEMO_SCHEMA_VERSION } from "@/lib/demo-data";
import { localStateStorage, safeGet, safeSet } from "./safe-storage";

export const DATA_STORAGE_KEY = "batops:data";
export const SESSION_STORAGE_KEY = "batops:session";
export const LAST_USER_STORAGE_KEY = "batops:last-user";

export interface Session {
  userId: string | null;
}

export interface SessionPersistence {
  load(): string | null;
  /** `null` = déconnexion explicite (efface aussi le dernier profil). */
  save(userId: string | null): void;
}

export interface BatopsActions {
  /** Génère le jeu de démo s'il est absent ou d'un schéma obsolète. */
  ensureData(now?: Date): void;
  /** Remet la démo ClimAir Pro à neuf, recalée sur l'instant présent. */
  resetDemo(now?: Date): void;
  /** Change d'utilisateur de démo (sélecteur de rôle). */
  signIn(userId: string): void;
  signOut(): void;
}

export interface BatopsState {
  data: BatopsData | null;
  session: Session;
  /** `true` une fois le localStorage relu et la démo garantie. */
  hydrated: boolean;
  actions: BatopsActions;
}

/** Session par onglet (sessionStorage) + dernier profil utilisé (localStorage). */
export const browserSessionPersistence: SessionPersistence = {
  load: () => safeGet("sessionStorage", SESSION_STORAGE_KEY) ?? safeGet("localStorage", LAST_USER_STORAGE_KEY),
  save: (userId) => {
    safeSet("sessionStorage", SESSION_STORAGE_KEY, userId);
    safeSet("localStorage", LAST_USER_STORAGE_KEY, userId);
  },
};

export interface CreateBatopsStoreOptions {
  storage?: StateStorage;
  session?: SessionPersistence;
}

export function createBatopsStore(options: CreateBatopsStoreOptions = {}) {
  const storage = options.storage ?? localStateStorage;
  const sessionPersistence = options.session ?? browserSessionPersistence;

  return createStore<BatopsState>()(
    persist(
      immer((set, get) => ({
        data: null,
        session: { userId: null },
        hydrated: false,
        actions: {
          ensureData: (now = new Date()) => {
            const { data, session } = get();
            const nextData = data && data.schema_version === DEMO_SCHEMA_VERSION ? data : createDemoData(now);
            const storedUser = session.userId ?? sessionPersistence.load();
            const userId = storedUser && nextData.users.some((u) => u.id === storedUser) ? storedUser : null;
            set((state) => {
              if (nextData !== data) state.data = nextData;
              state.session.userId = userId;
            });
          },
          resetDemo: (now = new Date()) => {
            const data = createDemoData(now);
            set((state) => {
              state.data = data;
              if (state.session.userId && !data.users.some((u) => u.id === state.session.userId)) {
                state.session.userId = null;
              }
            });
          },
          signIn: (userId) => {
            const { data } = get();
            if (!data?.users.some((u) => u.id === userId && u.is_active)) return;
            sessionPersistence.save(userId);
            set((state) => {
              state.session.userId = userId;
            });
          },
          signOut: () => {
            sessionPersistence.save(null);
            set((state) => {
              state.session.userId = null;
            });
          },
        },
      })),
      {
        name: DATA_STORAGE_KEY,
        version: DEMO_SCHEMA_VERSION,
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({ data: state.data }),
        // Schéma incompatible : on repart d'une démo neuve (ensureData la régénère).
        migrate: () => ({ data: null }),
        skipHydration: true,
      },
    ),
  );
}

/** Store typé avec l'API `persist` et le `setState` immer (mutations par brouillon). */
export type BatopsStore = ReturnType<typeof createBatopsStore>;
