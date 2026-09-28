import { describe, expect, it } from "vitest";
import { DEMO_SCHEMA_VERSION, DEMO_USERS } from "@/lib/demo-data";
import { createBatopsStore, DATA_STORAGE_KEY, type SessionPersistence } from "./store";
import { createMemoryStorage } from "./safe-storage";
import { logActivity, takeReference } from "./mutations";
import { selectNavCounters } from "./selectors";
import { selectModuleStats } from "./module-stats";

const NOW = new Date(2026, 8, 28, 7, 45);

function memorySession(initial: string | null = null): SessionPersistence & { value: string | null } {
  const session = {
    value: initial,
    load: () => session.value,
    save: (userId: string | null) => {
      session.value = userId;
    },
  };
  return session;
}

async function bootedStore(storage = createMemoryStorage(), session = memorySession()) {
  const store = createBatopsStore({ storage, session });
  await store.persist.rehydrate();
  store.getState().actions.ensureData(NOW);
  store.setState({ hydrated: true });
  return store;
}

describe("store central", () => {
  it("génère la démo au premier lancement et la persiste", async () => {
    const storage = createMemoryStorage();
    const store = await bootedStore(storage);
    const data = store.getState().data!;
    expect(data.clients.length).toBeGreaterThan(0);
    const persisted = JSON.parse(storage.dump()[DATA_STORAGE_KEY]);
    expect(persisted.version).toBe(DEMO_SCHEMA_VERSION);
    expect(persisted.state.data.seeded_at).toBe(data.seeded_at);
    expect(persisted.state.session).toBeUndefined();
  });

  it("relit les données persistées (même état après rechargement)", async () => {
    const storage = createMemoryStorage();
    const first = await bootedStore(storage);
    first.setState((state) => {
      state.data!.organization.name = "ClimAir Pro (modifié)";
    });
    const second = await bootedStore(storage);
    expect(second.getState().data!.organization.name).toBe("ClimAir Pro (modifié)");
  });

  it("réinitialise la démo en effaçant les modifications", async () => {
    const store = await bootedStore();
    store.setState((state) => {
      state.data!.clients = [];
    });
    store.getState().actions.resetDemo(NOW);
    expect(store.getState().data!.clients.length).toBe(11);
  });

  it("régénère une démo d'un schéma obsolète", async () => {
    const storage = createMemoryStorage();
    storage.setItem(DATA_STORAGE_KEY, JSON.stringify({ state: { data: { schema_version: 0 } }, version: 0 }));
    const store = await bootedStore(storage);
    expect(store.getState().data!.schema_version).toBe(DEMO_SCHEMA_VERSION);
  });

  it("gère la session de démo (connexion, profil inconnu, déconnexion)", async () => {
    const session = memorySession();
    const store = await bootedStore(createMemoryStorage(), session);
    const { actions } = store.getState();
    actions.signIn(DEMO_USERS.lucas);
    expect(store.getState().session.userId).toBe(DEMO_USERS.lucas);
    expect(session.value).toBe(DEMO_USERS.lucas);
    actions.signIn("usr_inconnu");
    expect(store.getState().session.userId).toBe(DEMO_USERS.lucas);
    actions.signOut();
    expect(store.getState().session.userId).toBeNull();
    expect(session.value).toBeNull();
  });

  it("restaure le dernier profil utilisé au démarrage", async () => {
    const store = await bootedStore(createMemoryStorage(), memorySession(DEMO_USERS.sophie));
    expect(store.getState().session.userId).toBe(DEMO_USERS.sophie);
  });
});

describe("mutations partagées", () => {
  it("attribue des références continues", async () => {
    const store = await bootedStore();
    let reference = "";
    store.setState((state) => {
      reference = takeReference(state.data!, "quote", NOW);
    });
    expect(reference).toBe("DEV-2026-0042");
    expect(store.getState().data!.sequences.quote).toBe(43);
  });

  it("alimente la timeline client", async () => {
    const store = await bootedStore();
    const before = store.getState().data!.activities.length;
    store.setState((state) => {
      logActivity(state.data!, { client_id: "cli_martin", type: "note", title: "Note" }, NOW);
    });
    const activities = store.getState().data!.activities;
    expect(activities).toHaveLength(before + 1);
    expect(activities.at(-1)?.created_at).toBe(NOW.toISOString());
  });
});

describe("sélecteurs", () => {
  it("calcule les compteurs de la barre latérale depuis les données", async () => {
    const store = await bootedStore();
    expect(selectNavCounters(store.getState().data!, NOW)).toEqual({
      calls: 2,
      prospects: 2,
      quotes: 4,
      invoices: 1,
      planning: 0,
      interventions: 1,
      sav: 1,
    });
  });

  it("masque les montants aux profils sans accès financier", async () => {
    const store = await bootedStore();
    const data = store.getState().data!;
    const ownerLabels = selectModuleStats("catalog", data, NOW, "owner").map((s) => s.label);
    const dispatcherLabels = selectModuleStats("catalog", data, NOW, "dispatcher").map((s) => s.label);
    expect(ownerLabels).toContain("Marge moyenne");
    expect(dispatcherLabels).not.toContain("Marge moyenne");
  });
});
