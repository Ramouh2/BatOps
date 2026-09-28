import type { CatalogItem } from "@/types/batops";

export const SECTION = {
  preparation: "Dépose & préparation",
  equipment: "Fourniture des équipements",
  accessories: "Raccordements & accessoires",
  labor: "Main-d'œuvre & mise en service",
  travel: "Déplacement & diagnostic",
  maintenance: "Entretien annuel",
  extra: "Travaux complémentaires",
} as const;

/** Section de devis par défaut d'un article du catalogue (utilisée par le seed et l'assistant devis). */
export function defaultSectionFor(item: Pick<CatalogItem, "reference" | "category" | "equipment_template">): string {
  if (item.equipment_template) return SECTION.equipment;
  if (item.reference.startsWith("FOR-DEP") || item.reference === "FOR-DESEMB") return SECTION.preparation;
  switch (item.category) {
    case "fourniture":
      return SECTION.accessories;
    case "main_oeuvre":
    case "forfait":
      return SECTION.labor;
    case "deplacement":
      return SECTION.travel;
    case "maintenance":
      return SECTION.maintenance;
  }
}

export type MarginLevel = "loss" | "critical" | "low" | "correct" | "excellent";

export interface MarginLevelMeta {
  level: MarginLevel;
  label: string;
  tone: "danger" | "warning" | "info" | "success";
}

/** Lecture rapide de la marge (en % du prix de vente) pour le badge du catalogue. */
export function marginLevel(marginPercent: number, marginHt: number): MarginLevelMeta {
  if (marginHt < 0) return { level: "loss", label: "À perte", tone: "danger" };
  if (marginPercent < 10) return { level: "critical", label: "Critique", tone: "danger" };
  if (marginPercent < 25) return { level: "low", label: "Faible", tone: "warning" };
  if (marginPercent < 40) return { level: "correct", label: "Correcte", tone: "info" };
  return { level: "excellent", label: "Excellente", tone: "success" };
}
