import { describe, expect, it } from "vitest";
import { DEMO_USERS } from "@/lib/demo-data";
import { catalogMargin } from "@/lib/domain/money";
import { marginLevel } from "@/lib/domain/catalog";
import type { ClientInput, EquipmentInput } from "@/lib/domain/validation";
import { MockAIProvider } from "@/providers/ai/mock-ai.provider";
import { MockNotificationProvider } from "@/providers/notifications/notification.provider";
import { createBatopsStore } from "./store";
import { createMemoryStorage } from "./safe-storage";
import { countByTab, filterClientRows, selectClient360, selectClientRows } from "./crm-selectors";
import {
  selectCashSeries,
  selectDashboardKpis,
  selectInboundRequests,
  selectQuotesToRemind,
  selectRecentActivities,
} from "./dashboard";
import { selectNavCounters } from "./selectors";
import { catalogItemUsage } from "./actions/catalog";

const NOW = new Date(2026, 8, 28, 7, 45);

async function boot(storage = createMemoryStorage()) {
  const session = { value: DEMO_USERS.marc as string | null, load: () => session.value, save: (id: string | null) => void (session.value = id) };
  const store = createBatopsStore({
    storage,
    session,
    notifications: () => new MockNotificationProvider(),
    origin: () => "https://demo.batops.fr",
  });
  await store.persist.rehydrate();
  store.getState().actions.ensureData(NOW);
  return store;
}

const prospect: ClientInput = {
  status: "prospect",
  type: "particulier",
  civility: "M.",
  first_name: "Julien",
  last_name: "Weber",
  phone: "+33 6 39 98 20 15",
  address: "12 rue de la Hache",
  postal_code: "54000",
  city: "Nancy",
  source: "telephone",
  notes: "Clim qui fuit dans le salon",
};

const split: EquipmentInput = {
  category: "climatisation",
  brand: "Mitsubishi Electric",
  model: "MSZ-AP25VG",
  serial_number: "8XK01552",
  refrigerant_type: "R32",
  installation_date: "2021-06-01",
  warranty_end_date: "2024-06-01",
  location_in_property: "Salon",
};

describe("Sprint 1 — parcours CRM relié au store", () => {
  it("prospect → CRM → client → équipement → timeline → dashboard", async () => {
    const store = await boot();
    const { actions } = store.getState();

    // 1. Création du prospect
    const created = actions.createClient(prospect);
    expect(created.ok).toBe(true);
    const clientId = created.ok ? created.value : "";
    let data = store.getState().data!;
    const client = data.clients.find((c) => c.id === clientId)!;
    expect(client.phone).toBe("06 39 98 20 15");
    expect(client.portal_token).toMatch(/^ptk_/);

    // 2. Visible dans le CRM (onglet Prospects) et dans les compteurs
    const rows = selectClientRows(data, NOW);
    expect(filterClientRows(rows, "prospects", "weber").map((r) => r.client.id)).toEqual([clientId]);
    expect(countByTab(rows).prospects).toBe(3);
    expect(selectNavCounters(data, NOW).prospects).toBe(3);
    expect(selectInboundRequests(data).some((r) => r.kind === "prospect" && r.id === clientId)).toBe(true);
    expect(selectRecentActivities(data, 1)[0]).toMatchObject({ client_id: clientId, type: "client_created", actor_name: "Marc Ouhadda" });

    // 3. Conversion en client
    expect(actions.convertProspect(clientId)).toBe(true);
    expect(actions.convertProspect(clientId)).toBe(false);
    data = store.getState().data!;
    expect(data.clients.find((c) => c.id === clientId)!.status).toBe("client");
    expect(selectNavCounters(data, NOW).prospects).toBe(2);
    expect(selectInboundRequests(data).some((r) => r.id === clientId)).toBe(false);

    // 4. Équipement
    const eq = actions.addEquipment(clientId, split);
    expect(eq.ok).toBe(true);
    data = store.getState().data!;
    const view = selectClient360(data, clientId, NOW)!;
    expect(view.equipment).toHaveLength(1);
    expect(view.equipment[0].refrigerant_type).toBe("R32");

    // 5. Note + timeline chronologique
    expect(actions.addClientNote(clientId, "Digicode 4512B, 2e étage")).toBe(true);
    data = store.getState().data!;
    const timeline = selectClient360(data, clientId, NOW)!.activities.map((a) => a.type);
    expect(timeline).toEqual(expect.arrayContaining(["client_created", "client_converted", "equipment_added", "note"]));
    expect(timeline).toHaveLength(4);

    // 6. Visible dans le dashboard (activité récente)
    expect(selectRecentActivities(data, 4).every((a) => a.client_id === clientId)).toBe(true);
  });

  it("persiste les mutations dans le stockage", async () => {
    const storage = createMemoryStorage();
    const store = await boot(storage);
    const created = store.getState().actions.createClient(prospect);
    const again = await boot(storage);
    expect(again.getState().data!.clients.some((c) => created.ok && c.id === created.value)).toBe(true);
  });

  it("refuse une saisie invalide sans rien écrire", async () => {
    const store = await boot();
    const before = store.getState().data!.clients.length;
    const result = store.getState().actions.createClient({ ...prospect, phone: "123", postal_code: "540" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.phone).toBeTruthy();
      expect(result.errors.postal_code).toBeTruthy();
    }
    expect(store.getState().data!.clients.length).toBe(before);
  });

  it("journalise les champs modifiés d'une fiche", async () => {
    const store = await boot();
    const martin = store.getState().data!.clients.find((c) => c.id === "cli_martin")!;
    const result = store.getState().actions.updateClient("cli_martin", {
      status: martin.status,
      type: martin.type,
      civility: martin.civility,
      first_name: martin.first_name,
      last_name: martin.last_name,
      email: martin.email,
      phone: "0639981248",
      address: martin.address,
      postal_code: martin.postal_code,
      city: martin.city,
      access_notes: martin.access_notes,
      source: martin.source,
      housing_over_2_years: martin.housing_over_2_years,
    });
    expect(result).toEqual({ ok: true, value: ["téléphone"] });
    const last = selectRecentActivities(store.getState().data!, 1)[0];
    expect(last).toMatchObject({ client_id: "cli_martin", type: "client_updated", description: "Téléphone modifié." });
  });

  it("protège les équipements liés à l'historique", async () => {
    const store = await boot();
    const { actions } = store.getState();
    expect(actions.removeEquipment("eq_martin_split")).toBe(false);
    const eq = actions.addEquipment("cli_martin", { ...split, category: "vmc" });
    expect(eq.ok && actions.removeEquipment(eq.value)).toBe(true);
    const data = store.getState().data!;
    expect(data.equipment.some((e) => e.id === "eq_martin_split")).toBe(true);
    expect(selectRecentActivities(data, 1)[0].type).toBe("equipment_removed");
    // Le fluide n'est conservé que pour les équipements frigorifiques.
    const vmc = actions.addEquipment("cli_martin", { ...split, category: "vmc" });
    expect(store.getState().data!.equipment.find((e) => vmc.ok && e.id === vmc.value)!.refrigerant_type).toBeUndefined();
  });
});

describe("Sprint 1 — catalogue & marges", () => {
  it("prix → marge recalculée → moteur de devis au nouveau prix, documents émis inchangés", async () => {
    const store = await boot();
    const { actions } = store.getState();
    const pump = store.getState().data!.catalog.find((c) => c.reference === "ACC-POMPE-SI27")!;
    expect(marginLevel(catalogMargin(pump).margin_percent, catalogMargin(pump).margin_ht).level).toBe("excellent");

    const result = actions.updateCatalogItem(pump.id, {
      reference: pump.reference,
      name: pump.name,
      category: pump.category,
      unit: pump.unit,
      vat_rate: pump.vat_rate,
      supplier_name: pump.supplier_name,
      buying_price_ht: 92,
      selling_price_ht: 149,
    });
    expect(result).toEqual({ ok: true, value: { buying_before: 78, selling_before: 136, buying_after: 92, selling_after: 149 } });

    const data = store.getState().data!;
    const updated = data.catalog.find((c) => c.id === pump.id)!;
    expect(updated.updated_at).toBe(new Date(updated.updated_at!).toISOString());
    expect(catalogMargin(updated).margin_percent).toBe(38.26);
    expect(marginLevel(38.26, 57).level).toBe("correct");

    const draft = await new MockAIProvider().generateQuoteDraft("Dépannage clim : pompe de relevage à changer", { catalog: data.catalog });
    expect(draft.lines.find((l) => l.catalog_item_id === pump.id)?.unit_price_ht).toBe(149);

    // Les documents existants gardent leur prix figé
    expect(data.quotes.find((q) => q.id === "quo_pharmacie")!.items.find((l) => l.catalog_item_id === pump.id)!.unit_price_ht).toBe(136);
    expect(data.quotes.find((q) => q.id === "quo_bernard")!.total_ttc).toBe(11480);
  });

  it("crée, archive et supprime un article selon son utilisation", async () => {
    const store = await boot();
    const { actions } = store.getState();
    const input = {
      reference: "acc-thermo-01",
      name: "Thermostat connecté",
      category: "fourniture" as const,
      unit: "u" as const,
      buying_price_ht: 80,
      selling_price_ht: 169,
      vat_rate: 10 as const,
    };
    const created = actions.createCatalogItem(input);
    expect(created.ok).toBe(true);
    expect(actions.createCatalogItem(input)).toMatchObject({ ok: false, errors: { reference: "Cette référence existe déjà." } });
    const id = created.ok ? created.value : "";
    expect(store.getState().data!.catalog.find((c) => c.id === id)!.reference).toBe("ACC-THERMO-01");

    const pac = store.getState().data!.catalog.find((c) => c.reference === "PAC-ATL-8")!;
    expect(catalogItemUsage(store.getState().data!, pac.id).total).toBeGreaterThan(0);
    expect(actions.deleteCatalogItem(pac.id)).toBe(false);
    expect(actions.setCatalogItemActive(pac.id, false)).toBe(true);
    const draft = await new MockAIProvider().generateQuoteDraft("Pose PAC air/eau 8kW", { catalog: store.getState().data!.catalog });
    expect(draft.lines.some((l) => l.catalog_item_id === pac.id)).toBe(false);

    expect(actions.deleteCatalogItem(id)).toBe(true);
    expect(store.getState().data!.catalog.some((c) => c.id === id)).toBe(false);
  });
});

describe("Sprint 1 — dashboard", () => {
  it("calcule les 4 KPI depuis les données", async () => {
    const store = await boot();
    const kpis = selectDashboardKpis(store.getState().data!, NOW);
    expect(kpis).toMatchObject({
      cashThisMonth: 16725.23,
      cashPreviousMonth: 10294.53,
      pendingQuotesCount: 4,
      pendingQuotesTotal: 21950.7,
      quotesToRemindCount: 4,
      todayTotal: 3,
      todayDone: 0,
      overdueCount: 1,
      overdueTotal: 2890,
    });
    expect(kpis.cashTrendPercent).toBe(62.47);
  });

  it("construit la courbe d'encaissements cumulés", async () => {
    const store = await boot();
    const series = selectCashSeries(store.getState().data!, NOW);
    expect(series.current).toHaveLength(29);
    expect(series.current.at(-1)!.cumulative).toBe(16725.23);
    expect(series.previous.at(-1)!.cumulative).toBe(10294.53);
    expect(series.currentLabel).toBe("septembre");
    expect(series.previousLabel).toBe("août");
  });

  it("relance un devis en 1 clic : message journalisé, timeline, liste à relancer mise à jour", async () => {
    const store = await boot();
    const before = store.getState().data!.outbox.length;
    const result = await store.getState().actions.sendQuoteReminder("quo_bernard");
    const bernard = store.getState().data!.clients.find((c) => c.id === "cli_bernard")!;
    const link = `https://demo.batops.fr/portal/${bernard.portal_token}?devis=DEV-2026-0041`;
    expect(result).toEqual({ ok: true, channel: "email", to: "jp.bernard@example.com", link });
    const data = store.getState().data!;
    expect(data.outbox).toHaveLength(before + 1);
    expect(data.outbox.at(-1)!.body).toContain(link);
    expect(data.outbox.at(-1)).toMatchObject({ status: "simule", provider_mode: "mock", client_id: "cli_bernard" });
    expect(data.quotes.find((q) => q.id === "quo_bernard")!.last_reminder_at).toBeTruthy();
    expect(selectQuotesToRemind(data, NOW).some((q) => q.id === "quo_bernard")).toBe(false);
    expect(selectRecentActivities(data, 1)[0]).toMatchObject({ type: "quote_reminder", client_id: "cli_bernard" });
  });

  it("liste les demandes entrantes à traiter", async () => {
    const store = await boot();
    const requests = selectInboundRequests(store.getState().data!);
    expect(requests.map((r) => r.id)).toEqual(["call_mansouri", "call_bernard"]);
  });
});
