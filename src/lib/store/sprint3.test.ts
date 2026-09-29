import { describe, expect, it } from "vitest";
import { DEMO_USERS } from "@/lib/demo-data";
import { addDays, startOfDay, toDate } from "@/lib/domain/dates";
import {
  atMinutes,
  computeEnd,
  dayLoad,
  detectConflicts,
  findFreeSlots,
  nextFreeSlot,
  nextWorkingDay,
  requiresRefrigerantSkill,
  segmentOnDay,
  startOfWeek,
  suggestTechnician,
} from "@/lib/domain/planning";
import type { InterventionInput } from "@/lib/domain/validation";
import { MockNotificationProvider } from "@/providers/notifications/notification.provider";
import { createBatopsStore } from "./store";
import { createMemoryStorage } from "./safe-storage";
import { selectDashboardKpis } from "./dashboard";
import { selectInterventionsOfDay, selectNavCounters, selectTechnicians } from "./selectors";
import {
  countInterventionTabs,
  filterInterventionRows,
  itemsOnDay,
  layoutLanes,
  selectInterventionDetail,
  selectInterventionRows,
  selectPlanningItems,
  selectPlanningKpis,
  selectUnplanned,
  selectScheduleNews,
  selectUpcomingForTechnician,
} from "./planning-selectors";

// Lundi 28 septembre 2026, 7 h 45.
const NOW = new Date(2026, 8, 28, 7, 45);
const SIGNATURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const at = (dayOffset: number, hour: number, minute = 0) => new Date(2026, 8, 28 + dayOffset, hour, minute);

async function boot() {
  const session = { value: DEMO_USERS.sophie as string | null, load: () => session.value, save: (id: string | null) => void (session.value = id) };
  const store = createBatopsStore({ storage: createMemoryStorage(), session, notifications: () => new MockNotificationProvider(), origin: () => "https://demo.batops.fr" });
  await store.persist.rehydrate();
  store.getState().actions.ensureData(NOW);
  return store;
}

describe("Planning — horaires et fin d'intervention", () => {
  it("étale un chantier sur les jours ouvrés (8 h – 18 h), sans week-end", () => {
    expect(computeEnd(at(0, 8), 840)).toEqual(at(1, 12)); // 10 h + 4 h
    expect(computeEnd(at(4, 8), 840)).toEqual(at(7, 12)); // vendredi → lundi
    expect(computeEnd(at(0, 8, 30), 240)).toEqual(at(0, 12, 30));
    expect(computeEnd(at(0, 8), 1260)).toEqual(at(2, 9)); // 21 h de pose : 3 jours
  });

  it("termine le jour même une intervention courte ou en soirée", () => {
    expect(computeEnd(at(0, 17), 120)).toEqual(at(0, 19));
    expect(computeEnd(at(0, 19), 90)).toEqual(at(0, 20, 30));
  });

  it("découpe un chantier étalé par jour pour l'affichage", () => {
    const range = { start: at(4, 8), end: at(7, 12) };
    expect(segmentOnDay(range, at(4, 0))).toMatchObject({ startMin: 480, endMin: 1080, continuesAfter: true });
    expect(segmentOnDay(range, at(5, 0))).toBeNull();
    expect(segmentOnDay(range, at(7, 0))).toMatchObject({ startMin: 480, endMin: 720, continuesBefore: true, continuesAfter: false });
    expect(startOfWeek(at(3, 15))).toEqual(startOfDay(at(0, 0)));
    expect(nextWorkingDay(at(4, 10))).toEqual(startOfDay(at(7, 0)));
  });

  it("répartit les interventions simultanées en couloirs", () => {
    const lanes = layoutLanes([
      { id: "a", segment: { startMin: 480, endMin: 600 } },
      { id: "b", segment: { startMin: 540, endMin: 660 } },
      { id: "c", segment: { startMin: 700, endMin: 760 } },
    ]);
    expect(lanes.map((l) => [l.id, l.lane, l.lanes])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 0, 1],
    ]);
  });
});

describe("Planning — conflits et disponibilités (seed ClimAir Pro)", () => {
  it("détecte chevauchement, compétence frigoriste, passé, week-end et horaires", async () => {
    const store = await boot();
    const data = store.getState().data!;
    const pharmacie = data.interventions.find((i) => i.id === "int_pharmacie")!;
    const needs = requiresRefrigerantSkill(pharmacie, data.catalog, data.equipment);
    expect(needs).toBe(true);

    const overlap = detectConflicts({ technician_id: DEMO_USERS.lucas, start: at(0, 10), end: at(0, 11), needsRefrigerant: false }, { interventions: data.interventions, users: data.users });
    expect(overlap).toHaveLength(1);
    expect(overlap[0]).toMatchObject({ kind: "overlap", severity: "error", with_id: "int_pharmacie" });
    expect(overlap[0].message).toContain(pharmacie.reference);

    const skill = detectConflicts({ technician_id: DEMO_USERS.karim, start: at(2, 9), end: at(2, 10), needsRefrigerant: true }, { interventions: data.interventions, users: data.users });
    expect(skill.map((c) => c.kind)).toEqual(["skill"]);

    const proposal = detectConflicts(
      { technician_id: DEMO_USERS.lucas, start: at(-2, 19), end: at(-2, 20), needsRefrigerant: false },
      { interventions: data.interventions, users: data.users, now: NOW },
    );
    expect(proposal.map((c) => c.kind).sort()).toEqual(["outside_hours", "past", "weekend"]);
  });

  it("propose des créneaux libres, le prochain créneau et le bon technicien", async () => {
    const store = await boot();
    const data = store.getState().data!;
    // Lucas : pharmacie 8 h 30 – 12 h 30 et Mme Martin 14 h – 16 h aujourd'hui.
    expect(findFreeSlots(DEMO_USERS.lucas, NOW, 60, data.interventions, { now: NOW }).map((d) => d.getHours() * 60 + d.getMinutes())).toEqual([
      12 * 60 + 30,
      13 * 60,
      16 * 60,
      16 * 60 + 30,
    ]);
    expect(nextFreeSlot(DEMO_USERS.karim, at(1, 8), 120, data.interventions)).toEqual(at(1, 11));
    expect(dayLoad(DEMO_USERS.lucas, NOW, data.interventions)).toBe(360);
    // 10 h : Lucas est occupé (pharmacie), Karim est libre mais n'est pas frigoriste → Karim (libre) passe devant.
    expect(suggestTechnician(selectTechnicians(data), { start: at(0, 10), end: at(0, 11) }, true, data.interventions)).toBe(DEMO_USERS.karim);
    // Demain 14 h : les deux sont libres → le frigoriste.
    expect(suggestTechnician(selectTechnicians(data), { start: at(1, 14), end: at(1, 15) }, true, data.interventions)).toBe(DEMO_USERS.lucas);
  });
});

describe("Sprint 3 — devis signé → à planifier → planifié → /tech", () => {
  it("parcours complet et synchronisation dashboard / app terrain", async () => {
    const store = await boot();
    const { actions } = store.getState();
    const countersBefore = selectNavCounters(store.getState().data!, NOW);
    expect(countersBefore.planning).toBe(0);

    // 1. Signature du devis Bernard sur le portail → intervention « À planifier ».
    const signed = actions.signQuote({ quote_id: "quo_bernard", signer_name: "Jean-Pierre Bernard", signature_data_url: SIGNATURE, accepted_terms: true });
    expect(signed.ok).toBe(true);
    const interventionId = signed.ok ? signed.value.intervention_id : "";
    let data = store.getState().data!;
    const unplanned = selectUnplanned(selectPlanningItems(data));
    expect(unplanned.map((u) => u.intervention.id)).toEqual([interventionId]);
    expect(unplanned[0]).toMatchObject({ needsRefrigerant: true, source: { kind: "quote", label: "Devis DEV-2026-0041 signé" } });
    expect(selectNavCounters(data, NOW).planning).toBe(1);

    // 2. Affectation à Lucas demain 8 h : 21 h de pose → fin le surlendemain + 1 (jours ouvrés).
    const tomorrow8 = at(1, 8);
    const planned = actions.scheduleIntervention({ intervention_id: interventionId, technician_id: DEMO_USERS.lucas, start: tomorrow8.toISOString() });
    expect(planned.ok && planned.value).toEqual({ change: "planned", conflicts: [] });
    data = store.getState().data!;
    let intervention = data.interventions.find((i) => i.id === interventionId)!;
    expect(intervention).toMatchObject({ status: "planifiee", assigned_technician_id: DEMO_USERS.lucas, duration_minutes: 1260 });
    expect(toDate(intervention.scheduled_end!)).toEqual(at(3, 9));
    expect(selectNavCounters(data, NOW).planning).toBe(0);
    expect(data.activities.at(-1)).toMatchObject({ type: "intervention_scheduled", title: `Intervention ${intervention.reference} planifiée`, actor_name: "Sophie Laurent", client_id: "cli_bernard" });

    // 3. L'app terrain de Lucas le voit (demain et à venir), le dashboard reste cohérent.
    expect(selectInterventionsOfDay(data, addDays(NOW, 1), DEMO_USERS.lucas).map((i) => i.id)).toContain(interventionId);
    expect(selectUpcomingForTechnician(data, DEMO_USERS.lucas, NOW).map((i) => i.id)).toEqual([interventionId]);
    expect(selectDashboardKpis(data, NOW).todayTotal).toBe(3);
    // Chantier étalé : il reste dans la journée de Lucas le jour 2 (après-demain), pas le week-end.
    expect(selectInterventionsOfDay(data, addDays(NOW, 2), DEMO_USERS.lucas).map((i) => i.id)).toContain(interventionId);
    // Pastille « Nouveau » côté terrain (historique de moins de 24 h, horloge réelle des actions).
    expect(selectScheduleNews(data, DEMO_USERS.lucas, new Date()).get(interventionId)).toBe("nouveau");

    // 4. Déplacement, réaffectation (compétence manquante signalée), redimensionnement.
    const moved = actions.scheduleIntervention({ intervention_id: interventionId, technician_id: DEMO_USERS.lucas, start: at(2, 8).toISOString() });
    expect(moved.ok && moved.value.change).toBe("moved");
    expect(selectScheduleNews(store.getState().data!, DEMO_USERS.lucas, new Date()).get(interventionId)).toBe("modifie");
    const reassigned = actions.scheduleIntervention({ intervention_id: interventionId, technician_id: DEMO_USERS.karim, start: at(2, 8).toISOString() });
    expect(reassigned.ok && reassigned.value.change).toBe("reassigned");
    expect(selectScheduleNews(store.getState().data!, DEMO_USERS.lucas, new Date()).has(interventionId)).toBe(false);
    expect(selectScheduleNews(store.getState().data!, DEMO_USERS.karim, new Date()).get(interventionId)).toBe("nouveau");
    expect(reassigned.ok && reassigned.value.conflicts.map((c) => c.kind)).toEqual(["skill"]);
    const resized = actions.scheduleIntervention({ intervention_id: interventionId, technician_id: DEMO_USERS.karim, start: at(2, 8).toISOString(), duration_minutes: 600 });
    expect(resized.ok && resized.value.change).toBe("resized");
    intervention = store.getState().data!.interventions.find((i) => i.id === interventionId)!;
    expect(toDate(intervention.scheduled_end!)).toEqual(at(2, 18));

    // 5. Chevauchement : Karim a déjà la visite VMC demain 8 h – 11 h.
    const clash = actions.scheduleIntervention({ intervention_id: interventionId, technician_id: DEMO_USERS.karim, start: at(1, 10).toISOString(), duration_minutes: 60 });
    expect(clash.ok && clash.value.conflicts.map((c) => c.kind)).toEqual(["overlap", "skill"]);
    const items = selectPlanningItems(store.getState().data!);
    expect(selectPlanningKpis(items, NOW, startOfWeek(NOW)).conflicts).toBe(2);
    expect(items.find((i) => i.intervention.id === "int_syndic_vmc")!.conflicts[0].with_id).toBe(interventionId);

    // 6. Retour dans « À planifier », puis replanification.
    expect(actions.unscheduleIntervention(interventionId)).toBe(true);
    data = store.getState().data!;
    expect(data.interventions.find((i) => i.id === interventionId)).toMatchObject({ status: "nouvelle", assigned_technician_id: undefined, scheduled_start: undefined });
    expect(selectNavCounters(data, NOW).planning).toBe(1);
    expect(actions.unscheduleIntervention(interventionId)).toBe(false);

    // 7. Une intervention terminée ne se replanifie pas ; un technicien invalide est refusé.
    expect(actions.scheduleIntervention({ intervention_id: "int_kieffer", technician_id: DEMO_USERS.lucas, start: tomorrow8.toISOString() }).ok).toBe(false);
    expect(actions.scheduleIntervention({ intervention_id: interventionId, technician_id: DEMO_USERS.sophie, start: tomorrow8.toISOString() }).ok).toBe(false);

    // 8. Fiche : devis, client, historique des planifications.
    const detail = selectInterventionDetail(store.getState().data!, interventionId)!;
    expect(detail.quote?.reference).toBe("DEV-2026-0041");
    expect(detail.activities.map((a) => a.title.split(" ").slice(-1)[0])).toEqual(expect.arrayContaining(["planifiée", "déplacée", "réaffectée", "planning"]));
  });

  it("crée, modifie et annule une intervention saisie au bureau", async () => {
    const store = await boot();
    const { actions } = store.getState();
    const input: InterventionInput = {
      client_id: "cli_bellevue",
      title: "Dépannage climatisation de la salle",
      type: "depannage",
      priority: "urgente",
      description: "Souffle de l'air tiède depuis hier.",
      duration_minutes: 90,
      address: "5 place Stanislas",
      postal_code: "54000",
      city: "Nancy",
      equipment_id: "eq_bellevue_gainable",
      is_billable: true,
    };
    const invalid = actions.createIntervention({ ...input, title: " ", duration_minutes: 5 });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(Object.keys(invalid.errors).sort()).toEqual(["duration_minutes", "title"]);

    const created = actions.createIntervention(input);
    expect(created.ok).toBe(true);
    const id = created.ok ? created.value : "";
    let data = store.getState().data!;
    const intervention = data.interventions.find((i) => i.id === id)!;
    expect(intervention).toMatchObject({ status: "nouvelle", priority: "urgente", reference: `INT-2026-0${data.sequences.intervention - 1}` });
    expect(intervention.checklist[0].label).toBe("Contrôle de l'évacuation des condensats");
    const unplanned = selectUnplanned(selectPlanningItems(data));
    expect(unplanned[0].intervention.id).toBe(id);
    expect(unplanned[0].needsRefrigerant).toBe(true);

    // Planifiée aujourd'hui 12 h 30 chez Lucas, puis durée allongée depuis la fiche.
    actions.scheduleIntervention({ intervention_id: id, technician_id: DEMO_USERS.lucas, start: at(0, 12, 30).toISOString() });
    const updated = actions.updateIntervention(id, { ...input, duration_minutes: 150, title: "Dépannage clim gainable — salle" });
    expect(updated.ok && updated.value).toEqual(["titre", "durée"]);
    data = store.getState().data!;
    expect(toDate(data.interventions.find((i) => i.id === id)!.scheduled_end!)).toEqual(at(0, 15));
    // 15 h dépasse 14 h : chevauchement avec Mme Martin.
    expect(selectPlanningItems(data).find((i) => i.intervention.id === id)!.conflicts[0].kind).toBe("overlap");
    expect(itemsOnDay(selectPlanningItems(data), NOW, DEMO_USERS.lucas).map((e) => e.item.intervention.id)).toEqual(["int_pharmacie", id, "int_martin"]);

    expect(actions.cancelIntervention(id, " ").ok).toBe(false);
    expect(actions.cancelIntervention(id, "Le client a trouvé un autre prestataire").ok).toBe(true);
    data = store.getState().data!;
    expect(selectPlanningItems(data).some((i) => i.intervention.id === id)).toBe(false);
    const rows = selectInterventionRows(data);
    expect(countInterventionTabs(rows).annulees).toBe(1);
    expect(filterInterventionRows(rows, { tab: "annulees", query: "bellevue" }).map((r) => r.intervention.id)).toEqual([id]);
    expect(actions.updateIntervention(id, input).ok).toBe(false);
    expect(data.activities.at(-1)).toMatchObject({ type: "intervention_status", description: "Le client a trouvé un autre prestataire" });
  });

  it("liste des interventions : onglets, filtres et tri", async () => {
    const store = await boot();
    const rows = selectInterventionRows(store.getState().data!);
    expect(countInterventionTabs(rows)).toEqual({ a_planifier: 0, planifiees: 4, en_cours: 0, terminees: 7, annulees: 0, toutes: 11 });
    const karim = filterInterventionRows(rows, { tab: "planifiees", query: "", technicianId: DEMO_USERS.karim });
    expect(karim.map((r) => r.intervention.id)).toEqual(["int_syndic_ecs", "int_syndic_vmc"]);
    expect(filterInterventionRows(rows, { tab: "toutes", query: "", priority: "urgente" }).length).toBeGreaterThan(0);
    expect(atMinutes(NOW, 510)).toEqual(at(0, 8, 30));
  });
});
