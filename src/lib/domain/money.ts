import type { CatalogItem, DocumentLine, VatRate } from "@/types/batops";

/** Arrondi commercial au centime (gère correctement 1.005 → 1.01). */
export function round2(value: number): number {
  const rounded = Math.round(Number(`${Math.abs(value)}e2`)) / 100;
  return value < 0 ? -rounded : rounded;
}

export function lineTotal(qty: number, unitPriceHt: number): number {
  return round2(qty * unitPriceHt);
}

export interface VatBreakdownRow {
  rate: VatRate;
  base_ht: number;
  tva: number;
}

export interface DocumentTotals {
  subtotal_ht: number;
  discount_amount_ht: number;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  vat_breakdown: VatBreakdownRow[];
  cost_ht: number;
  margin_ht: number;
  /** Marge en % du prix de vente HT (taux de marque). */
  margin_percent: number;
}

type TotalsLine = Pick<DocumentLine, "qty" | "unit_price_ht" | "buying_price_ht" | "vat_rate">;

/**
 * Totaux d'un devis / d'une facture.
 * La TVA est calculée par taux (base HT cumulée puis arrondie), comme sur une facture française.
 * Une remise globale est répartie au prorata des bases HT de chaque taux.
 */
export function computeTotals(lines: TotalsLine[], discountAmountHt = 0): DocumentTotals {
  const subtotal = round2(lines.reduce((sum, l) => sum + lineTotal(l.qty, l.unit_price_ht), 0));
  const discount = round2(Math.min(Math.max(discountAmountHt, 0), subtotal));

  const baseByRate = new Map<VatRate, number>();
  for (const l of lines) {
    baseByRate.set(l.vat_rate, round2((baseByRate.get(l.vat_rate) ?? 0) + lineTotal(l.qty, l.unit_price_ht)));
  }

  const rates = [...baseByRate.keys()].sort((a, b) => a - b);
  let discountLeft = discount;
  const vat_breakdown: VatBreakdownRow[] = rates.map((rate, index) => {
    const base = baseByRate.get(rate) ?? 0;
    const share =
      index === rates.length - 1 ? discountLeft : subtotal > 0 ? round2((discount * base) / subtotal) : 0;
    discountLeft = round2(discountLeft - share);
    const netBase = round2(base - share);
    return { rate, base_ht: netBase, tva: round2((netBase * rate) / 100) };
  });

  const total_ht = round2(subtotal - discount);
  const total_tva = round2(vat_breakdown.reduce((sum, row) => sum + row.tva, 0));
  const cost_ht = round2(lines.reduce((sum, l) => sum + l.qty * l.buying_price_ht, 0));
  const margin_ht = round2(total_ht - cost_ht);

  return {
    subtotal_ht: subtotal,
    discount_amount_ht: discount,
    total_ht,
    total_tva,
    total_ttc: round2(total_ht + total_tva),
    vat_breakdown,
    cost_ht,
    margin_ht,
    margin_percent: total_ht > 0 ? round2((margin_ht / total_ht) * 100) : 0,
  };
}

export interface CatalogMargin {
  margin_ht: number;
  /** Marge en % du prix de vente. */
  margin_percent: number;
  /** Coefficient multiplicateur prix de vente / prix d'achat. */
  coefficient: number;
}

export function catalogMargin(item: Pick<CatalogItem, "buying_price_ht" | "selling_price_ht">): CatalogMargin {
  const margin_ht = round2(item.selling_price_ht - item.buying_price_ht);
  return {
    margin_ht,
    margin_percent: item.selling_price_ht > 0 ? round2((margin_ht / item.selling_price_ht) * 100) : 0,
    coefficient: item.buying_price_ht > 0 ? round2(item.selling_price_ht / item.buying_price_ht) : 0,
  };
}
