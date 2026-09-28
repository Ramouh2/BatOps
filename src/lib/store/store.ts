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
import {
  hasErrors,
  validateCatalogItemInput,
  validateClientInput,
  validateEquipmentInput,
  type CatalogItemInput,
  type ClientInput,
  type EquipmentInput,
} from "@/lib/domain/validation";
import type { NotificationProvider } from "@/providers/notifications/notification.provider";
import { localStateStorage, safeGet, safeSet } from "./safe-storage";
import { fail, ok, type MutationContext, type MutationResult } from "./actions/context";
import {
  addClientNote,
  addEquipment,
  convertProspect,
  createClient,
  removeEquipment,
  updateClient,
  updateEquipment,
} from "./actions/crm";
import {
  createCatalogItem,
  deleteCatalogItem,
  setCatalogItemActive,
  updateCatalogItem,
  type PriceChange,
} from "./actions/catalog";
import { applyQuoteReminder, buildQuoteReminder } from "./actions/quotes";

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

  /* ---- CRM ---- */
  createClient(input: ClientInput): MutationResult<string>;
  updateClient(clientId: string, input: ClientInput): MutationResult<string[]>;
  convertProspect(clientId: string): boolean;
  addClientNote(clientId: string, text: string): boolean;
  addEquipment(clientId: string, input: EquipmentInput): MutationResult<string>;
  updateEquipment(equipmentId: string, input: EquipmentInput): MutationResult<boolean>;
  removeEquipment(equipmentId: string): boolean;

  /* ---- Catalogue ---- */
  createCatalogItem(input: CatalogItemInput): MutationResult<string>;
  updateCatalogItem(itemId: string, input: CatalogItemInput): MutationResult<PriceChange>;
  setCatalogItemActive(itemId: string, active: boolean): boolean;
  deleteCatalogItem(itemId: string): boolean;

  /* ---- Devis ---- */
  /** Relance en 1 clic (e-mail, sinon SMS) via le NotificationProvider. */
  sendQuoteReminder(quoteId: string): Promise<{ ok: boolean; channel?: "email" | "sms"; to?: string }>;
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
  /** Provider d'envoi (par défaut celui de la factory — Mock gratuit en démo). */
  notifications?: () => NotificationProvider;
}

async function defaultNotifications(): Promise<NotificationProvider> {
  const { getNotificationProvider } = await import("@/providers");
  return getNotificationProvider();
}

export function createBatopsStore(options: CreateBatopsStoreOptions = {}) {
  const storage = options.storage ?? localStateStorage;
  const sessionPersistence = options.session ?? browserSessionPersistence;

  return createStore<BatopsState>()(
    persist(
      immer((set, get) => {
        /** Instant + auteur (profil de démo courant) de chaque mutation. */
        const context = (): MutationContext => {
          const { data, session } = get();
          return { now: new Date(), actor: data?.users.find((u) => u.id === session.userId)?.full_name };
        };
        /** Applique une mutation sur le brouillon et renvoie sa valeur (jamais un proxy immer). */
        const mutate = <T>(recipe: (draft: BatopsData, ctx: MutationContext) => T): T => {
          const ctx = context();
          let result!: T;
          set((state) => {
            if (state.data) result = recipe(state.data, ctx);
          });
          return result;
        };
        const data = () => {
          const current = get().data;
          if (!current) throw new Error("Store BATOPS non initialisé.");
          return current;
        };

        return {
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

          createClient: (input) => {
            const errors = validateClientInput(input);
            if (hasErrors(errors)) return fail(errors);
            return ok(mutate((draft, ctx) => createClient(draft, input, ctx)));
          },
          updateClient: (clientId, input) => {
            const errors = validateClientInput(input);
            if (hasErrors(errors)) return fail(errors);
            if (!data().clients.some((c) => c.id === clientId)) return fail({ client: "Client introuvable." });
            return ok(mutate((draft, ctx) => updateClient(draft, clientId, input, ctx)));
          },
          convertProspect: (clientId) => mutate((draft, ctx) => convertProspect(draft, clientId, ctx)),
          addClientNote: (clientId, text) => mutate((draft, ctx) => addClientNote(draft, clientId, text, ctx)),
          addEquipment: (clientId, input) => {
            const errors = validateEquipmentInput(input);
            if (hasErrors(errors)) return fail(errors);
            const id = mutate((draft, ctx) => addEquipment(draft, clientId, input, ctx));
            return id ? ok(id) : fail({ client: "Client introuvable." });
          },
          updateEquipment: (equipmentId, input) => {
            const errors = validateEquipmentInput(input);
            if (hasErrors(errors)) return fail(errors);
            const done = mutate((draft, ctx) => updateEquipment(draft, equipmentId, input, ctx));
            return done ? ok(true) : fail({ equipment: "Équipement introuvable." });
          },
          removeEquipment: (equipmentId) => mutate((draft, ctx) => removeEquipment(draft, equipmentId, ctx)),

          createCatalogItem: (input) => {
            const errors = validateCatalogItemInput(input, data().catalog);
            if (hasErrors(errors)) return fail(errors);
            return ok(mutate((draft, ctx) => createCatalogItem(draft, input, ctx)));
          },
          updateCatalogItem: (itemId, input) => {
            const errors = validateCatalogItemInput(input, data().catalog, itemId);
            if (hasErrors(errors)) return fail(errors);
            const change = mutate((draft, ctx) => updateCatalogItem(draft, itemId, input, ctx));
            return change ? ok(change) : fail({ item: "Article introuvable." });
          },
          setCatalogItemActive: (itemId, active) => mutate((draft, ctx) => setCatalogItemActive(draft, itemId, active, ctx)),
          deleteCatalogItem: (itemId) => mutate((draft) => deleteCatalogItem(draft, itemId)),

          sendQuoteReminder: async (quoteId) => {
            const message = buildQuoteReminder(data(), quoteId, new Date());
            if (!message) return { ok: false };
            const provider = options.notifications ? options.notifications() : await defaultNotifications();
            const result = await provider.send(message);
            mutate((draft, ctx) => applyQuoteReminder(draft, quoteId, message, result, ctx));
            return { ok: result.status !== "echec", channel: message.channel, to: message.to };
          },
        },
        };
      }),
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
