/**
 * TVA des travaux (bâtiment, France) : règle partagée par l'assistant IA et l'éditeur de devis.
 *  - 20 % : client professionnel, ou logement de moins de 2 ans ;
 *  - 5,5 % : amélioration de la performance énergétique (PAC, chauffe-eau thermodynamique) d'un logement de plus de 2 ans ;
 *  - 10 % : autres travaux de rénovation d'un logement de plus de 2 ans.
 */
import type { ClientType, VatRate } from "@/types/batops";

export const VAT_RATES: VatRate[] = [5.5, 10, 20];

/** Équipements dont la pose ouvre droit au taux de 5,5 % (performance énergétique). */
export const ENERGY_RENOVATION_REFS = ["PAC-ATL-8", "CET-THE-200"];

export interface VatRecommendation {
  rate: VatRate;
  reason: string;
}

export function recommendVat(context: {
  clientType?: ClientType;
  housingOver2Years?: boolean;
  energyRenovation: boolean;
}): VatRecommendation {
  if (context.clientType === "professionnel") return { rate: 20, reason: "Client professionnel : TVA à 20 %." };
  if (context.housingOver2Years === false) return { rate: 20, reason: "Logement achevé depuis moins de 2 ans : TVA à 20 %." };
  if (context.energyRenovation) {
    return {
      rate: 5.5,
      reason: "Travaux d'amélioration de la performance énergétique dans un logement de plus de 2 ans : TVA à 5,5 %.",
    };
  }
  return { rate: 10, reason: "Travaux de rénovation dans un logement de plus de 2 ans : TVA à 10 %." };
}

export function isVatRate(value: number): value is VatRate {
  return (VAT_RATES as number[]).includes(value);
}
