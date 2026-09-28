import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeTotals, round2 } from "@/lib/domain/money";
import { diffInCalendarDays, isSameDay, isSameMonth, toDate } from "@/lib/domain/dates";
import {
  getContractDisplayStatus,
  getInvoiceDisplayStatus,
  daysOverdue,
  isReadyToInvoice,
  quoteNeedsReminder,
} from "@/lib/domain/status";
import { referenceNumber } from "@/lib/domain/ids";
import { createDemoData, DEMO_USERS } from "./seed";

// Lundi 28 septembre 2026, 07:45 — le « lundi matin de Marc » du cadrage.
const NOW = new Date(2026, 8, 28, 7, 45);
const data = createDemoData(NOW);

const byId = <T extends { id: string }>(items: T[], id: string) => {
  const found = items.find((item) => item.id === id);
  if (!found) throw new Error(`introuvable : ${id}`);
  return found;
};

describe("seed ClimAir Pro — intégrité", () => {
  it("est déterministe pour un même instant", () => {
    expect(createDemoData(NOW)).toEqual(data);
  });

  it("a des identifiants, références et jetons portail uniques", () => {
    const collections = [data.users, data.clients, data.equipment, data.catalog, data.quotes, data.interventions, data.photos, data.invoices, data.contracts, data.calls, data.activities, data.outbox];
    for (const collection of collections) {
      const ids = collection.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    for (const refs of [data.quotes, data.interventions, data.invoices, data.contracts, data.catalog].map((c) => c.map((e) => e.reference))) {
      expect(new Set(refs).size).toBe(refs.length);
      expect(refs.every((r) => r.length > 0)).toBe(true);
    }
    const tokens = data.clients.map((c) => c.portal_token);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it("résout toutes les relations", () => {
    const clientIds = new Set(data.clients.map((c) => c.id));
    const userIds = new Set(data.users.map((u) => u.id));
    const quoteIds = new Set(data.quotes.map((q) => q.id));
    const interventionIds = new Set(data.interventions.map((i) => i.id));
    const equipmentIds = new Set(data.equipment.map((e) => e.id));
    const contractIds = new Set(data.contracts.map((c) => c.id));
    const callIds = new Set(data.calls.map((c) => c.id));
    const catalogIds = new Set(data.catalog.map((c) => c.id));

    for (const e of data.equipment) expect(clientIds.has(e.client_id)).toBe(true);
    for (const q of data.quotes) {
      expect(clientIds.has(q.client_id)).toBe(true);
      for (const line of q.items) expect(catalogIds.has(line.catalog_item_id!)).toBe(true);
    }
    for (const i of data.interventions) {
      expect(clientIds.has(i.client_id)).toBe(true);
      if (i.quote_id) expect(quoteIds.has(i.quote_id)).toBe(true);
      if (i.assigned_technician_id) expect(userIds.has(i.assigned_technician_id)).toBe(true);
      if (i.equipment_id) expect(equipmentIds.has(i.equipment_id)).toBe(true);
      if (i.contract_id) expect(contractIds.has(i.contract_id)).toBe(true);
      if (i.call_log_id) expect(callIds.has(i.call_log_id)).toBe(true);
    }
    for (const p of data.photos) {
      expect(interventionIds.has(p.intervention_id)).toBe(true);
      expect(byId(data.interventions, p.intervention_id).client_id).toBe(p.client_id);
    }
    for (const inv of data.invoices) {
      expect(clientIds.has(inv.client_id)).toBe(true);
      if (inv.quote_id) expect(byId(data.quotes, inv.quote_id).client_id).toBe(inv.client_id);
      if (inv.intervention_id) expect(byId(data.interventions, inv.intervention_id).client_id).toBe(inv.client_id);
      if (inv.contract_id) expect(contractIds.has(inv.contract_id)).toBe(true);
    }
    for (const c of data.contracts) {
      expect(clientIds.has(c.client_id)).toBe(true);
      if (c.equipment_id) expect(byId(data.equipment, c.equipment_id).client_id).toBe(c.client_id);
    }
    for (const call of data.calls) {
      if (call.client_id) expect(clientIds.has(call.client_id)).toBe(true);
      if (call.intervention_id) expect(byId(data.interventions, call.intervention_id).call_log_id).toBe(call.id);
    }
    for (const a of data.activities) expect(clientIds.has(a.client_id)).toBe(true);
  });

  it("n'utilise que des prix du catalogue et des totaux cohérents", () => {
    for (const doc of [...data.quotes, ...data.invoices]) {
      for (const line of doc.items) {
        expect(line.total_ht).toBe(round2(line.qty * line.unit_price_ht));
        if (line.catalog_item_id) {
          const item = byId(data.catalog, line.catalog_item_id);
          expect(line.unit_price_ht).toBe(item.selling_price_ht);
          expect(line.buying_price_ht).toBe(item.buying_price_ht);
        }
      }
      const totals = computeTotals(doc.items, doc.discount_amount_ht);
      expect(doc.total_ht).toBe(totals.total_ht);
      expect(doc.total_tva).toBe(totals.total_tva);
      expect(doc.total_ttc).toBe(totals.total_ttc);
    }
  });

  it("a des paiements cohérents avec les factures", () => {
    for (const inv of data.invoices) {
      const paid = round2(inv.payments.reduce((s, p) => s + p.amount, 0));
      expect(inv.amount_paid).toBe(paid);
      expect(paid).toBeLessThanOrEqual(inv.amount_due_ttc);
      if (inv.status === "payee") expect(paid).toBe(inv.amount_due_ttc);
      for (const p of inv.payments) expect(toDate(p.paid_at).getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  it("référence des photos de démo présentes dans /public", () => {
    for (const photo of data.photos) {
      expect(existsSync(join(process.cwd(), "public", photo.image_url))).toBe(true);
    }
  });

  it("numérote les séquences au-delà des références existantes", () => {
    const max = (refs: string[]) => Math.max(...refs.map(referenceNumber));
    expect(data.sequences.quote).toBe(max(data.quotes.map((q) => q.reference)) + 1);
    expect(data.sequences.intervention).toBe(max(data.interventions.map((i) => i.reference)) + 1);
    expect(data.sequences.invoice).toBe(max(data.invoices.map((i) => i.reference)) + 1);
    expect(data.sequences.contract).toBe(max(data.contracts.map((c) => c.reference)) + 1);
  });

  it("numérote les factures dans l'ordre chronologique", () => {
    const sorted = [...data.invoices].sort((a, b) => referenceNumber(a.reference) - referenceNumber(b.reference));
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].issue_date >= sorted[i - 1].issue_date).toBe(true);
    }
  });
});

describe("seed ClimAir Pro — l'histoire du lundi matin", () => {
  it("Mme Martin : dépannage aujourd'hui 14 h avec Lucas, facturable 214,50 € TTC une fois la pompe ajoutée", () => {
    const job = byId(data.interventions, "int_martin");
    expect(job.status).toBe("planifiee");
    expect(job.assigned_technician_id).toBe(DEMO_USERS.lucas);
    expect(isSameDay(toDate(job.scheduled_start!), NOW)).toBe(true);
    expect(toDate(job.scheduled_start!).getHours()).toBe(14);
    const pump = byId(data.catalog, "cat_acc_pompe_si27");
    const withPump = [...job.parts_used, { ...job.parts_used[0], unit_price_ht: pump.selling_price_ht, buying_price_ht: pump.buying_price_ht }];
    expect(computeTotals(withPump).total_ttc).toBe(214.5);
  });

  it("M. Bernard : devis DEV-2026-0041 de 11 480,00 € TTC envoyé il y a 4 jours, à relancer", () => {
    const quote = byId(data.quotes, "quo_bernard");
    expect(quote.reference).toBe("DEV-2026-0041");
    expect(quote.total_ttc).toBe(11480);
    expect(quote.status).toBe("envoye");
    expect(diffInCalendarDays(toDate(quote.sent_at!), NOW)).toBe(4);
    expect(quoteNeedsReminder(quote, NOW)).toBe(true);
    expect(byId(data.clients, "cli_bernard").status).toBe("prospect");
  });

  it("Mme Mansouri : prospect créé par Nora hier à 19 h 42, appel à traiter", () => {
    const call = byId(data.calls, "call_mansouri");
    expect(call.status).toBe("qualifie_ia");
    expect(diffInCalendarDays(toDate(call.created_at), NOW)).toBe(1);
    expect(toDate(call.created_at).getHours()).toBe(19);
    expect(toDate(call.created_at).getMinutes()).toBe(42);
    expect(byId(data.clients, "cli_mansouri").source).toBe("nora_ia");
  });

  it("Le Bellevue : contrat de maintenance à planifier dans 12 jours", () => {
    const contract = byId(data.contracts, "ctr_bellevue");
    expect(diffInCalendarDays(NOW, toDate(contract.next_visit_date))).toBe(12);
    expect(getContractDisplayStatus(contract, data.interventions, NOW)).toBe("a_planifier");
    expect(contract.annual_price_ht).toBe(380);
  });

  it("Boulangerie Dorée : dépannage terminé hier par Karim, photos avant/après, signé, prêt à facturer", () => {
    const job = byId(data.interventions, "int_doree");
    expect(job.status).toBe("terminee");
    expect(job.assigned_technician_id).toBe(DEMO_USERS.karim);
    expect(diffInCalendarDays(toDate(job.actual_end!), NOW)).toBe(1);
    expect(job.signed_by_name).toBeTruthy();
    const categories = data.photos.filter((p) => p.intervention_id === job.id).map((p) => p.category);
    expect(categories).toContain("avant");
    expect(categories).toContain("apres");
    expect(isReadyToInvoice(job, data.invoices)).toBe(true);
    const readyToInvoice = data.interventions.filter((i) => isReadyToInvoice(i, data.invoices));
    expect(readyToInvoice.map((i) => i.id)).toEqual(["int_doree"]);
  });

  it("M. Mercier : FAC-2026-0084 de 2 890,00 € TTC en retard de 9 jours", () => {
    const invoice = byId(data.invoices, "inv_mercier");
    expect(invoice.reference).toBe("FAC-2026-0084");
    expect(invoice.total_ttc).toBe(2890);
    expect(getInvoiceDisplayStatus(invoice, NOW)).toBe("en_retard");
    expect(daysOverdue(invoice, NOW)).toBe(9);
    expect(data.invoices.filter((i) => getInvoiceDisplayStatus(i, NOW) === "en_retard")).toHaveLength(1);
  });

  it("Syndic Lorraine Habitat : 3 factures payées ce mois-ci et une visite VMC demain avec Karim", () => {
    const paidThisMonth = data.invoices.filter(
      (i) => i.client_id === "cli_syndic" && i.status === "payee" && i.payments.some((p) => isSameMonth(toDate(p.paid_at), NOW)),
    );
    expect(paidThisMonth).toHaveLength(3);
    const visit = byId(data.interventions, "int_syndic_vmc");
    expect(visit.assigned_technician_id).toBe(DEMO_USERS.karim);
    expect(diffInCalendarDays(NOW, toDate(visit.scheduled_start!))).toBe(1);
    expect(getContractDisplayStatus(byId(data.contracts, "ctr_syndic_vmc"), data.interventions, NOW)).toBe("visite_planifiee");
  });

  it("ne contient aucune intervention à planifier au démarrage (la colonne se remplit à la signature)", () => {
    expect(data.interventions.filter((i) => i.status === "nouvelle")).toHaveLength(0);
  });

  it("reste cohérent un 1er du mois (encaissements ramenés dans le mois)", () => {
    const firstOfMonth = new Date(2026, 9, 1, 9, 0);
    const d = createDemoData(firstOfMonth);
    for (const inv of d.invoices) {
      for (const p of inv.payments) expect(toDate(p.paid_at).getTime()).toBeLessThanOrEqual(firstOfMonth.getTime());
    }
    const syndicPaid = d.invoices.filter(
      (i) => i.client_id === "cli_syndic" && i.payments.some((p) => isSameMonth(toDate(p.paid_at), firstOfMonth)),
    );
    expect(syndicPaid).toHaveLength(3);
  });
});
