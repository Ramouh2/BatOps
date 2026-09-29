import { describe, expect, it } from "vitest";
import type { DocumentLine } from "@/types/batops";
import { DEMO_USERS } from "@/lib/demo-data";
import { addDays, toISODate } from "@/lib/domain/dates";
import { createId } from "@/lib/domain/ids";
import { lineTotal } from "@/lib/domain/money";
import { computeQuoteTotals, defaultQuoteConditions, depositAmount, interventionPlanFromQuote } from "@/lib/domain/quotes";
import { recommendVat } from "@/lib/domain/vat";
import type { QuoteInput } from "@/lib/domain/validation";
import { MockAIProvider } from "@/providers/ai/mock-ai.provider";
import { MockNotificationProvider } from "@/providers/notifications/notification.provider";
import { createBatopsStore } from "./store";
import { createMemoryStorage } from "./safe-storage";
import { selectDashboardKpis, selectInboundRequests } from "./dashboard";
import { newestFirst, selectNavCounters } from "./selectors";
import { selectClient360 } from "./crm-selectors";
import { validateSignature } from "./actions/quotes";
import { selectPortal, selectPortalFocus, selectQuoteDetail, selectQuoteKpis, selectQuoteRows } from "./quote-selectors";

const NOW = new Date(2026, 8, 28, 7, 45);
const ORIGIN = "https://demo.batops.fr";
const SIGNATURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PROMPT = "Installation PAC air/eau 8kW avec désembouage et mise en service";

async function boot() {
  const session = { value: DEMO_USERS.marc as string | null, load: () => session.value, save: (id: string | null) => void (session.value = id) };
  const store = createBatopsStore({
    storage: createMemoryStorage(),
    session,
    notifications: () => new MockNotificationProvider(),
    origin: () => ORIGIN,
  });
  await store.persist.rehydrate();
  store.getState().actions.ensureData(NOW);
  return store;
}

type Store = Awaited<ReturnType<typeof boot>>;

const ai = new MockAIProvider();

function lineFor(store: Store, reference: string, qty: number, vat: DocumentLine["vat_rate"] = 10): DocumentLine {
  const item = store.getState().data!.catalog.find((c) => c.reference === reference)!;
  return {
    id: createId("line"),
    catalog_item_id: item.id,
    section: "Travaux complémentaires",
    item_category: item.category,
    name: item.name,
    qty,
    unit: item.unit,
    buying_price_ht: item.buying_price_ht,
    unit_price_ht: item.selling_price_ht,
    vat_rate: vat,
    total_ht: lineTotal(qty, item.selling_price_ht),
  };
}

async function mansouriDraft(store: Store): Promise<QuoteInput> {
  const data = store.getState().data!;
  const client = data.clients.find((c) => c.id === "cli_mansouri")!;
  const draft = await ai.generateQuoteDraft(PROMPT, { catalog: data.catalog, clientType: client.type, housingOver2Years: client.housing_over_2_years });
  return {
    client_id: client.id,
    title: draft.title,
    site_address: client.address,
    site_postal_code: client.postal_code,
    site_city: client.city,
    items: draft.lines,
    discount_amount_ht: 0,
    discount_percent: 5,
    deposit_percent: 30,
    validity_days: 30,
    ai_generated: true,
    call_log_id: "call_mansouri",
  };
}

describe("Sprint 2 — IA devis (MockAIProvider, prix du catalogue uniquement)", () => {
  it("« Installation PAC air/eau 8kW avec désembouage et mise en service » → lignes du catalogue expliquées", async () => {
    const store = await boot();
    const catalog = store.getState().data!.catalog;
    const draft = await ai.generateQuoteDraft(PROMPT, { catalog, clientType: "particulier", housingOver2Years: true });
    const refs = draft.lines.map((l) => catalog.find((c) => c.id === l.catalog_item_id)!.reference);
    expect(refs).toEqual(["FOR-DESEMB", "PAC-ATL-8", "ACC-KIT-HYD", "FOR-MES-PAC", "MO-FRIG"]);
    expect(draft.vat_rate).toBe(5.5);
    expect(draft.detected).toEqual(["pompe à chaleur", "air/eau", "8 kW", "désembouage", "mise en service"]);
    for (const line of draft.lines) {
      const item = catalog.find((c) => c.id === line.catalog_item_id)!;
      expect(line.unit_price_ht).toBe(item.selling_price_ht);
      expect(draft.reasons[line.id]).toBeTruthy();
    }
    expect(draft.reasons[draft.lines.find((l) => l.name.includes("service"))!.id]).toContain("Mise en service demandée");
    expect(draft.suggestions.map((s) => s.reference)).toEqual(expect.arrayContaining(["ACC-POT-BOUE", "ACC-DISJ", "MAINT-PAC"]));
  });

  it("TVA recommandée partagée entre l'IA et l'éditeur", () => {
    expect(recommendVat({ clientType: "particulier", housingOver2Years: true, energyRenovation: true }).rate).toBe(5.5);
    expect(recommendVat({ clientType: "particulier", housingOver2Years: true, energyRenovation: false }).rate).toBe(10);
    expect(recommendVat({ clientType: "syndic", energyRenovation: false }).rate).toBe(10);
    expect(recommendVat({ clientType: "professionnel", energyRenovation: true }).rate).toBe(20);
  });
});

describe("Sprint 2 — parcours devis complet relié au store", () => {
  it("créer → modifier → envoyer (lien portail) → consulter → remarque → signer → intervention préparée", async () => {
    const store = await boot();
    const { actions } = store.getState();
    const before = store.getState().data!;
    const countersBefore = selectNavCounters(before, NOW);
    const kpisBefore = selectDashboardKpis(before, NOW);
    expect(selectInboundRequests(before).map((r) => r.id)).toContain("call_mansouri");

    // 1. Création (numérotation continue, totaux, timeline, appel converti)
    const input = await mansouriDraft(store);
    const created = actions.createQuote(input);
    expect(created.ok).toBe(true);
    const quoteId = created.ok ? created.value : "";
    let data = store.getState().data!;
    let quote = data.quotes.find((q) => q.id === quoteId)!;
    expect(quote.reference).toBe("DEV-2026-0042");
    expect(quote.status).toBe("brouillon");
    expect(quote.created_by_user_id).toBe(DEMO_USERS.marc);
    const totals = computeQuoteTotals(input.items, { discount_amount_ht: 0, discount_percent: 5 });
    expect(quote.total_ttc).toBe(totals.total_ttc);
    expect(quote.discount_amount_ht).toBe(totals.discount_amount_ht);
    expect(quote.estimated_margin_ht).toBe(totals.margin_ht);
    // Dates calculées sur l'horloge réelle des actions (le seed, lui, est figé au 28/09).
    expect(quote.valid_until).toBe(toISODate(addDays(new Date(), 30)));
    expect(data.calls.find((c) => c.id === "call_mansouri")).toMatchObject({ status: "converti", quote_id: quoteId });
    expect(selectInboundRequests(data).map((r) => r.id)).not.toContain("call_mansouri");
    expect(selectClient360(data, "cli_mansouri", NOW)!.activities[0]).toMatchObject({ type: "quote_created", title: "Devis DEV-2026-0042 créé" });
    expect(selectNavCounters(data, NOW).quotes).toBe(countersBefore.quotes);

    // 2. Brouillon modifié : ajout d'un oubli détecté par l'IA + remise en % suivie
    const potABoue = lineFor(store, "ACC-POT-BOUE", 1, 5.5);
    const updated = actions.updateQuote(quoteId, { ...input, items: [...input.items, potABoue] });
    expect(updated.ok).toBe(true);
    quote = store.getState().data!.quotes.find((q) => q.id === quoteId)!;
    const totals2 = computeQuoteTotals(quote.items, { discount_amount_ht: 0, discount_percent: 5 });
    expect(quote.items).toHaveLength(input.items.length + 1);
    expect(quote.total_ht).toBe(totals2.total_ht);
    expect(quote.discount_amount_ht).toBeGreaterThan(totals.discount_amount_ht);

    // 3. Envoi : SMS (pas d'e-mail) avec le vrai lien du portail
    const client = store.getState().data!.clients.find((c) => c.id === "cli_mansouri")!;
    const sent = await actions.sendQuote(quoteId);
    const link = `${ORIGIN}/portal/${client.portal_token}?devis=DEV-2026-0042`;
    expect(sent).toEqual({ ok: true, channel: "sms", to: "06 42 18 99 10", link });
    data = store.getState().data!;
    quote = data.quotes.find((q) => q.id === quoteId)!;
    expect(quote.status).toBe("envoye");
    expect(quote.sent_at).toBeTruthy();
    expect(data.outbox.at(-1)).toMatchObject({ channel: "sms", status: "simule", client_id: "cli_mansouri" });
    expect(data.outbox.at(-1)!.body).toContain(link);
    expect(selectNavCounters(data, NOW).quotes).toBe(countersBefore.quotes + 1);
    expect(selectDashboardKpis(data, NOW).pendingQuotesCount).toBe(kpisBefore.pendingQuotesCount + 1);
    expect(actions.updateQuote(quoteId, input).ok).toBe(false);

    // 4. Portail : consultation (une seule fois) et remarque du client
    expect(actions.markQuoteViewed(quoteId)).toBe(true);
    expect(actions.markQuoteViewed(quoteId)).toBe(false);
    expect(actions.addQuoteComment(quoteId, "Possible de passer un mardi ?")).toBe(true);
    expect(actions.addQuoteComment(quoteId, "   ")).toBe(false);
    const detail = selectQuoteDetail(store.getState().data!, quoteId)!;
    expect(detail.comments.map((c) => c.description)).toEqual(["Possible de passer un mardi ?"]);
    expect(detail.comments[0].actor_name).toBe("Mme Nadia Mansouri");
    expect(detail.activities.map((a) => a.type)).toEqual(expect.arrayContaining(["quote_viewed", "quote_sent", "quote_created"]));

    // 5. Signature incomplète refusée, puis signature réelle
    const incomplete = actions.signQuote({ quote_id: quoteId, signer_name: "N", signature_data_url: "", accepted_terms: false });
    expect(incomplete.ok).toBe(false);
    if (!incomplete.ok) expect(Object.keys(incomplete.errors).sort()).toEqual(["accepted_terms", "signature", "signer_name"]);
    const signed = actions.signQuote({ quote_id: quoteId, signer_name: "Nadia Mansouri", signature_data_url: SIGNATURE, accepted_terms: true });
    expect(signed.ok).toBe(true);
    data = store.getState().data!;
    quote = data.quotes.find((q) => q.id === quoteId)!;
    expect(quote).toMatchObject({ status: "accepte", signed_by_name: "Nadia Mansouri", signature_data_url: SIGNATURE });

    // 6. Intervention préparée, prospect converti, compteurs à jour
    const intervention = data.interventions.find((i) => i.quote_id === quoteId)!;
    expect(signed.ok && signed.value.intervention_reference).toBe(intervention.reference);
    expect(intervention).toMatchObject({ status: "nouvelle", type: "installation", client_id: "cli_mansouri", call_log_id: "call_mansouri", is_billable: true });
    expect(intervention.duration_minutes).toBe(16 * 60);
    expect(intervention.checklist.map((c) => c.label)).toContain("Paramétrage de la loi d'eau");
    expect(intervention.parts_used.every((p) => p.source === "devis")).toBe(true);
    expect(intervention.parts_used.map((p) => p.name)).toEqual(quote.items.filter((l) => l.item_category === "fourniture").map((l) => l.name));
    expect(data.clients.find((c) => c.id === "cli_mansouri")!.status).toBe("client");
    const counters = selectNavCounters(data, NOW);
    expect(counters.planning).toBe(countersBefore.planning + 1);
    expect(counters.quotes).toBe(countersBefore.quotes);
    expect(counters.prospects).toBe(countersBefore.prospects - 1);
    const timeline = selectClient360(data, "cli_mansouri", NOW)!.activities.map((a) => a.type);
    // Même milliseconde : le dernier événement journalisé s'affiche en premier.
    expect(timeline.slice(0, 3)).toEqual(["intervention_created", "client_converted", "quote_signed"]);
    expect(actions.signQuote({ quote_id: quoteId, signer_name: "Nadia Mansouri", signature_data_url: SIGNATURE, accepted_terms: true }).ok).toBe(false);

    // 7. Le devis signé n'est plus « en attente » sur le dashboard ; le module Devis le compte comme signé
    expect(selectDashboardKpis(data, NOW).pendingQuotesCount).toBe(kpisBefore.pendingQuotesCount);
    expect(selectQuoteKpis(data, NOW).signedThisMonthCount).toBe(selectQuoteKpis(before, NOW).signedThisMonthCount + 1);
  });

  it("refus depuis le portail : motif enregistré, plus signable", async () => {
    const store = await boot();
    const { actions } = store.getState();
    expect(actions.refuseQuote({ quote_id: "quo_bellevue_rideau", reason: "" }).ok).toBe(false);
    const refused = actions.refuseQuote({ quote_id: "quo_bellevue_rideau", reason: "Le projet est reporté", comment: "On en reparle au printemps." });
    expect(refused.ok).toBe(true);
    const data = store.getState().data!;
    expect(data.quotes.find((q) => q.id === "quo_bellevue_rideau")).toMatchObject({
      status: "refuse",
      refusal_reason: "Le projet est reporté — On en reparle au printemps.",
    });
    expect(data.activities.at(-1)).toMatchObject({ type: "quote_refused", client_id: "cli_bellevue" });
    expect(actions.signQuote({ quote_id: "quo_bellevue_rideau", signer_name: "Paul", signature_data_url: SIGNATURE, accepted_terms: true }).ok).toBe(false);
  });

  it("un devis expiré ne peut pas être signé", async () => {
    const store = await boot();
    const data = store.getState().data!;
    const input = { quote_id: "quo_bernard", signer_name: "Jean-Pierre Bernard", signature_data_url: SIGNATURE, accepted_terms: true };
    expect(validateSignature(data, input, NOW)).toEqual({});
    const later = new Date(2026, 10, 30);
    expect(validateSignature(data, input, later).quote).toContain("expiré");
  });

  it("repasser en brouillon, renvoyer ; supprimer uniquement un brouillon jamais envoyé", async () => {
    const store = await boot();
    const { actions } = store.getState();
    expect(actions.reopenQuote("quo_doree_labo")).toBe(true);
    let quote = store.getState().data!.quotes.find((q) => q.id === "quo_doree_labo")!;
    expect(quote.status).toBe("brouillon");
    expect(actions.deleteQuoteDraft("quo_doree_labo")).toBe(false);
    const resent = await actions.sendQuote("quo_doree_labo");
    expect(resent.ok).toBe(true);
    quote = store.getState().data!.quotes.find((q) => q.id === "quo_doree_labo")!;
    expect(quote.status).toBe("envoye");
    expect(quote.issue_date).toBe(toISODate(new Date()));

    const input = await mansouriDraft(store);
    const created = actions.createQuote({ ...input, call_log_id: undefined });
    const id = created.ok ? created.value : "";
    expect(actions.deleteQuoteDraft(id)).toBe(true);
    expect(store.getState().data!.quotes.some((q) => q.id === id)).toBe(false);
    expect(store.getState().data!.activities.at(-1)).toMatchObject({ type: "quote_deleted" });
  });

  it("refuse une saisie invalide sans rien modifier", async () => {
    const store = await boot();
    const { actions } = store.getState();
    const input = await mansouriDraft(store);
    const snapshot = JSON.stringify(store.getState().data);
    const empty = actions.createQuote({ ...input, items: [], title: " " });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.errors).toMatchObject({ items: expect.any(String), title: expect.any(String) });
    const invented = actions.createQuote({ ...input, items: [{ ...input.items[0], catalog_item_id: "cat_inconnu" }] });
    expect(invented.ok).toBe(false);
    if (!invented.ok) expect(Object.values(invented.errors)[0]).toContain("aucun prix ne peut être inventé");
    const discount = actions.createQuote({ ...input, discount_percent: undefined, discount_amount_ht: 999_999 });
    expect(discount.ok).toBe(false);
    expect(JSON.stringify(store.getState().data)).toBe(snapshot);
  });
});

describe("Ordre des événements", () => {
  it("à instant égal, le dernier journalisé passe devant (timeline, activité récente)", () => {
    const at = "2026-09-28T07:45:00.000Z";
    const list = [
      { id: "a", created_at: "2026-09-27T10:00:00.000Z" },
      { id: "b", created_at: at },
      { id: "c", created_at: at },
      { id: "d", created_at: at },
    ];
    expect(newestFirst(list).map((e) => e.id)).toEqual(["d", "c", "b", "a"]);
    expect(list.map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("Sprint 2 — portail, liste et règles", () => {
  it("le portail n'expose que les devis transmis du client du jeton", async () => {
    const store = await boot();
    const data = store.getState().data!;
    const bernard = data.clients.find((c) => c.id === "cli_bernard")!;
    const view = selectPortal(data, bernard.portal_token)!;
    expect(view.contactName).toBe("M. Jean-Pierre Bernard");
    expect(view.quotes.map((q) => q.reference)).toEqual(["DEV-2026-0041"]);
    expect(selectPortalFocus(view, "DEV-2026-0041", NOW)?.id).toBe("quo_bernard");
    expect(selectPortal(data, "ptk_inconnu")).toBeNull();

    const created = store.getState().actions.createQuote({ ...(await mansouriDraft(store)), client_id: "cli_bernard", call_log_id: undefined });
    expect(created.ok).toBe(true);
    expect(selectPortal(store.getState().data!, bernard.portal_token)!.quotes).toHaveLength(1);
  });

  it("liste et indicateurs du module Devis", async () => {
    const store = await boot();
    const data = store.getState().data!;
    const rows = selectQuoteRows(data, NOW);
    expect(rows).toHaveLength(9);
    expect(rows.find((r) => r.quote.id === "quo_bernard")).toMatchObject({ clientName: "M. Jean-Pierre Bernard", status: "envoye" });
    const kpis = selectQuoteKpis(data, NOW);
    expect(kpis).toMatchObject({ draftsCount: 0, pendingCount: 4, pendingTotalTtc: 21950.7, signedThisMonthCount: 2 });
    expect(kpis.signatureRate).toBe(55.56);
  });

  it("plan d'intervention, acompte et conditions", async () => {
    const store = await boot();
    const data = store.getState().data!;
    const pharmacie = data.quotes.find((q) => q.id === "quo_pharmacie")!;
    const plan = interventionPlanFromQuote(pharmacie, data.catalog);
    expect(plan.type).toBe("installation");
    expect(plan.duration_minutes).toBe(240);
    expect(plan.checklist[0]).toBe("Tirage au vide (< 500 microns)");
    expect(depositAmount(1000, 30)).toBe(300);
    expect(defaultQuoteConditions({ depositPercent: 30, vatRates: [5.5], validityDays: 30 })).toBe(pharmacie.conditions!.replace("TVA à 20 %.", "TVA à 5,5 % : travaux d'amélioration de la performance énergétique d'un logement de plus de 2 ans (attestation simplifiée)."));
    expect(defaultQuoteConditions({ depositPercent: 0, vatRates: [5.5, 20], validityDays: 45 })).toContain("TVA appliquée par ligne : 5,5 %");
  });
});
