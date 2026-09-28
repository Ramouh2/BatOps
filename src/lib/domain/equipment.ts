import type { Equipment } from "@/types/batops";
import { diffInCalendarDays, toDate } from "./dates";
import { formatDate } from "./format";

export interface WarrantyStatus {
  label: string;
  tone: "success" | "warning" | "neutral";
}

/** État de garantie : couverte, fin proche (< 90 jours) ou expirée. */
export function warrantyStatus(equipment: Pick<Equipment, "warranty_end_date">, now: Date): WarrantyStatus | null {
  if (!equipment.warranty_end_date) return null;
  const days = diffInCalendarDays(now, toDate(equipment.warranty_end_date));
  if (days < 0) return { label: "Garantie expirée", tone: "neutral" };
  if (days <= 90) return { label: `Fin de garantie le ${formatDate(equipment.warranty_end_date)}`, tone: "warning" };
  return { label: `Garantie jusqu'au ${formatDate(equipment.warranty_end_date)}`, tone: "success" };
}
