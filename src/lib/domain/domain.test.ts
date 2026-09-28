import { describe, expect, it } from "vitest";
import type { Invoice, Quote } from "@/types/batops";
import { catalogMargin, computeTotals, round2 } from "./money";
import { formatEUR, formatPercent, formatPhone, formatRelativeDay, formatRelativeTime } from "./format";
import { getInvoiceDisplayStatus, getQuoteDisplayStatus, invoiceBalance } from "./status";
import { formatReference, referenceNumber } from "./ids";

const NOW = new Date(2026, 8, 28, 10, 0);

describe("montants", () => {
  it("arrondit au centime commercial", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(598.4836)).toBe(598.48);
    expect(round2(-2.675)).toBe(-2.68);
  });

  it("calcule la TVA par taux et répartit la remise", () => {
    const totals = computeTotals(
      [
        { qty: 1, unit_price_ht: 1000, buying_price_ht: 600, vat_rate: 5.5 },
        { qty: 2, unit_price_ht: 250, buying_price_ht: 100, vat_rate: 20 },
      ],
      150,
    );
    expect(totals.subtotal_ht).toBe(1500);
    expect(totals.total_ht).toBe(1350);
    expect(totals.vat_breakdown).toEqual([
      { rate: 5.5, base_ht: 900, tva: 49.5 },
      { rate: 20, base_ht: 450, tva: 90 },
    ]);
    expect(totals.total_ttc).toBe(1489.5);
    expect(totals.cost_ht).toBe(800);
    expect(totals.margin_ht).toBe(550);
    expect(totals.margin_percent).toBe(40.74);
  });

  it("borne la remise au sous-total", () => {
    expect(computeTotals([{ qty: 1, unit_price_ht: 100, buying_price_ht: 0, vat_rate: 10 }], 500).total_ht).toBe(0);
  });

  it("calcule la marge d'un article du catalogue", () => {
    expect(catalogMargin({ buying_price_ht: 78, selling_price_ht: 136 })).toEqual({
      margin_ht: 58,
      margin_percent: 42.65,
      coefficient: 1.74,
    });
  });
});

describe("formats français", () => {
  it("formate montants, pourcentages et téléphones", () => {
    expect(formatEUR(11480).replace(/\s/g, " ")).toBe("11 480,00 €");
    expect(formatPercent(35.6)).toBe("35,6 %");
    expect(formatPhone("0642189910")).toBe("06 42 18 99 10");
  });

  it("exprime les jours relatifs", () => {
    expect(formatRelativeDay("2026-09-28", NOW)).toBe("aujourd'hui");
    expect(formatRelativeDay("2026-09-27", NOW)).toBe("hier");
    expect(formatRelativeDay("2026-09-24", NOW)).toBe("il y a 4 jours");
    expect(formatRelativeDay("2026-10-10", NOW)).toBe("dans 12 jours");
  });

  it("exprime l'horodatage relatif des événements", () => {
    expect(formatRelativeTime(new Date(2026, 8, 28, 9, 59, 40), NOW)).toBe("à l'instant");
    expect(formatRelativeTime(new Date(2026, 8, 28, 9, 55), NOW)).toBe("il y a 5 min");
    expect(formatRelativeTime(new Date(2026, 8, 28, 7, 12), NOW)).toBe("aujourd'hui 07:12");
    expect(formatRelativeTime(new Date(2026, 8, 27, 16, 20), NOW)).toBe("hier 16:20");
    expect(formatRelativeTime(new Date(2026, 8, 21, 16, 20), NOW)).toBe("21 sept.");
  });

  it("formate et relit les références", () => {
    expect(formatReference("invoice", 2026, 84)).toBe("FAC-2026-0084");
    expect(referenceNumber("DEV-2026-0041")).toBe(41);
  });
});

describe("statuts dérivés", () => {
  const invoice = (patch: Partial<Invoice>): Invoice =>
    ({
      invoice_type: "facture",
      status: "emise",
      due_date: "2026-10-10",
      amount_due_ttc: 1000,
      amount_paid: 0,
      ...patch,
    }) as Invoice;

  it("dérive en_retard et paiement partiel", () => {
    expect(getInvoiceDisplayStatus(invoice({}), NOW)).toBe("emise");
    expect(getInvoiceDisplayStatus(invoice({ amount_paid: 300 }), NOW)).toBe("partiellement_payee");
    expect(getInvoiceDisplayStatus(invoice({ due_date: "2026-09-19" }), NOW)).toBe("en_retard");
    expect(getInvoiceDisplayStatus(invoice({ due_date: "2026-09-19", status: "payee", amount_paid: 1000 }), NOW)).toBe("payee");
    expect(invoiceBalance(invoice({ amount_paid: 300 }))).toBe(700);
    expect(getInvoiceDisplayStatus(invoice({ invoice_type: "avoir", due_date: "2026-01-01" }), NOW)).toBe("emise");
  });

  it("marque expiré un devis envoyé hors validité", () => {
    const quote = { status: "envoye", valid_until: "2026-09-27" } as Quote;
    expect(getQuoteDisplayStatus(quote, NOW)).toBe("expire");
    expect(getQuoteDisplayStatus({ ...quote, valid_until: "2026-09-28" }, NOW)).toBe("envoye");
  });
});
