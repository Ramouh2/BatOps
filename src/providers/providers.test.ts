import { describe, expect, it } from "vitest";
import { createDemoData } from "@/lib/demo-data";
import { MockAIProvider } from "./ai/mock-ai.provider";
import { MockVoiceProvider } from "./voice/mock-voice.provider";
import { NORA_SCENARIOS } from "./voice/scenarios";
import { MockNotificationProvider } from "./notifications/notification.provider";
import { getProvidersInfo } from "./index";

const data = createDemoData(new Date(2026, 8, 28, 7, 45));
const catalog = data.catalog;
const ai = new MockAIProvider();
const refOf = (id?: string) => catalog.find((c) => c.id === id)?.reference;

describe("MockAIProvider — devis IA", () => {
  it("« Pose PAC Air/Eau Atlantic 8kW avec désembouage » → brouillon structuré au prix catalogue", async () => {
    const draft = await ai.generateQuoteDraft("Pose PAC Air/Eau Atlantic 8kW avec désembouage", {
      catalog,
      clientType: "particulier",
      housingOver2Years: true,
    });
    const refs = draft.lines.map((l) => refOf(l.catalog_item_id));
    expect(refs).toEqual(expect.arrayContaining(["PAC-ATL-8", "FOR-DESEMB", "ACC-KIT-HYD", "FOR-MES-PAC", "MO-FRIG"]));
    expect(draft.vat_rate).toBe(5.5);
    expect(draft.title).toContain("PAC Air/Eau");
    for (const line of draft.lines) {
      const item = catalog.find((c) => c.id === line.catalog_item_id)!;
      expect(line.unit_price_ht).toBe(item.selling_price_ht);
      expect(line.buying_price_ht).toBe(item.buying_price_ht);
      expect(line.ai_suggested).toBe(true);
    }
    const suggestionRefs = draft.suggestions.map((s) => s.reference);
    expect(suggestionRefs).toEqual(expect.arrayContaining(["ACC-POT-BOUE", "ACC-DISJ", "ACC-SUPP-AV", "MAINT-PAC"]));
    expect(suggestionRefs).not.toContain("FOR-DESEMB");
  });

  it("tri-split du cadrage : unités, 22 m de liaisons sous goulotte, pompe, mise en service R32", async () => {
    const draft = await ai.generateQuoteDraft(
      "Pose tri-split Daikin Perfera (1 unité salon 3.5kW + 2 unités chambres 2.0kW), groupe extérieur façade jardin, 22m liaisons frigorifiques sous goulotte, pompe de relevage condensats, mise en service R32.",
      { catalog, clientType: "particulier", housingOver2Years: true },
    );
    const qty = (ref: string) => draft.lines.find((l) => refOf(l.catalog_item_id) === ref)?.qty;
    expect(qty("CLIM-DAI-UE3")).toBe(1);
    expect(qty("CLIM-DAI-UI35")).toBe(1);
    expect(qty("CLIM-DAI-UI20")).toBe(2);
    expect(qty("ACC-LIAIS-38")).toBe(22);
    expect(qty("ACC-GOUL")).toBe(22);
    expect(qty("ACC-POMPE-SI27")).toBe(1);
    expect(qty("FOR-MES-R32")).toBe(1);
    expect(draft.vat_rate).toBe(10);
    const supports = draft.suggestions.find((s) => s.reference === "ACC-SUPP-AV");
    expect(supports?.unit_price_ht).toBe(45);
    expect(draft.suggestions.map((s) => s.reference)).not.toContain("ACC-POMPE-SI27");
    expect(draft.warnings.some((w) => w.includes("Longueur"))).toBe(false);
  });

  it("applique la TVA à 20 % pour un client professionnel", async () => {
    const draft = await ai.generateQuoteDraft("Installation climatisation mono-split 5 kW", { catalog, clientType: "professionnel" });
    expect(draft.vat_rate).toBe(20);
    expect(draft.lines.map((l) => refOf(l.catalog_item_id))).toContain("CLIM-DAI-M50");
  });

  it("n'invente jamais de ligne ni de prix quand l'article manque au catalogue", async () => {
    const withoutPac = catalog.filter((c) => c.reference !== "PAC-ATL-8");
    const draft = await ai.generateQuoteDraft("Pose PAC air/eau 8kW", { catalog: withoutPac });
    expect(draft.lines.map((l) => refOf(l.catalog_item_id))).not.toContain("PAC-ATL-8");
    expect(draft.warnings.some((w) => w.includes("introuvable"))).toBe(true);
    const nothing = await ai.generateQuoteDraft("Bonjour", { catalog });
    expect(nothing.lines).toHaveLength(0);
    expect(nothing.warnings.length).toBeGreaterThan(0);
  });

  it("détecte les oublis sur des lignes existantes", async () => {
    const quote = data.quotes.find((q) => q.id === "quo_pharmacie")!;
    const suggestions = await ai.detectMissingItems(quote.items, { catalog });
    expect(suggestions.map((s) => s.reference)).toContain("MAINT-CLIM");
    expect(suggestions.map((s) => s.reference)).not.toContain("ACC-SUPP-AV");
  });
});

describe("MockAIProvider — rapport & appels", () => {
  it("reformule « pompe hs changée sauermann test ok »", async () => {
    const text = await ai.rewriteReport("pompe hs changée sauermann test ok");
    expect(text).toBe(
      "Remplacement de la pompe de relevage des condensats défectueuse par un modèle neuf Sauermann. Essais de fonctionnement réalisés : installation conforme.",
    );
  });

  it("reformule la note du cadrage sans inventer de modèle", async () => {
    const text = await ai.rewriteReport("pompe relevage hs changée par sauermann neuve test ecoulement ok filtre nettoyé");
    expect(text).toContain("Remplacement de la pompe de relevage des condensats défectueuse par un modèle neuf Sauermann.");
    expect(text).toContain("Test d'écoulement des condensats validé.");
    expect(text).toContain("Nettoyage des filtres de l'unité intérieure.");
    expect(text).not.toContain("Si-27");
  });

  it("extrait les informations de l'appel de Mme Mansouri", async () => {
    const call = data.calls.find((c) => c.id === "call_mansouri")!;
    const callerText = call.transcript.filter((t) => t.speaker === "caller").map((t) => t.text).join("\n");
    const result = await ai.analyzeCall(callerText);
    expect(result.caller_name).toBe("Nadia Mansouri");
    expect(result.caller_phone).toBe("06 42 18 99 10");
    expect(result.caller_address).toBe("14 rue des Jardins");
    expect(result.caller_city).toBe("Vandœuvre-lès-Nancy");
    expect(result.intent).toBe("devis_installation");
    expect(result.urgency).toBe("normale");
    expect(result.equipment_mentioned).toContain("Climatisation");
  });
});

describe("MockVoiceProvider — Nora V0", () => {
  const voice = new MockVoiceProvider();
  const context = { orgName: "ClimAir Pro", availableSlots: ["demain à 9 h"] };

  for (const scenario of NORA_SCENARIOS) {
    it(`mène le scénario « ${scenario.label} » jusqu'à une fiche complète`, async () => {
      let state = voice.startCall(context);
      for (const line of scenario.callerLines) state = await voice.processTurn(state, line, context);
      expect(state.done).toBe(true);
      expect(state.extraction.caller_name).toBeTruthy();
      expect(state.extraction.caller_phone).toMatch(/^\d{2}( \d{2}){4}$/);
      expect(state.extraction.caller_address).toBeTruthy();
      expect(state.extraction.preferred_slot).toBeTruthy();
      expect(state.transcript.at(-1)?.speaker).toBe("nora");
    });
  }

  it("qualifie correctement l'urgence et l'intention", async () => {
    const run = async (id: string) => {
      const scenario = NORA_SCENARIOS.find((s) => s.id === id)!;
      let state = voice.startCall(context);
      for (const line of scenario.callerLines) state = await voice.processTurn(state, line, context);
      return state.extraction;
    };
    const leak = await run("fuite-clim");
    expect(leak.intent).toBe("depannage");
    expect(leak.urgency).toBe("urgente");
    expect(leak.caller_name).toBe("Julien Weber");
    expect(leak.caller_city).toBe("Nancy");
    expect(leak.preferred_slot).toBe("demain à 9 h");
    const pac = await run("devis-pac");
    expect(pac.intent).toBe("devis_installation");
    expect(pac.caller_city).toBe("Ludres");
    expect(pac.caller_postal_code).toBe("54710");
    const maintenance = await run("entretien");
    expect(maintenance.intent).toBe("entretien");
    expect(maintenance.caller_name).toBe("Olivier Schmitt (Restaurant Le Bellevue)");
  });
});

describe("Providers — mode démo gratuit", () => {
  it("simule les envois sans service externe", async () => {
    const result = await new MockNotificationProvider().send({ channel: "sms", to: "06 39 98 20 15", body: "Test" });
    expect(result.status).toBe("simule");
    expect(result.provider_mode).toBe("mock");
  });

  it("utilise uniquement des mocks par défaut", () => {
    expect(getProvidersInfo().every((p) => p.mode === "mock")).toBe(true);
  });
});
