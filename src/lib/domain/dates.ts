import type { ISODate, ISODateTime } from "@/types/batops";

const DAY_MS = 86_400_000;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** Jour local au format `YYYY-MM-DD` (pas de conversion UTC). */
export function toISODate(date: Date): ISODate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Interprète un `YYYY-MM-DD` comme minuit heure locale. */
export function parseISODate(value: ISODate): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Accepte un jour (`YYYY-MM-DD`) ou un instant ISO complet. */
export function toDate(value: ISODate | ISODateTime | Date): Date {
  if (value instanceof Date) return value;
  return value.length === 10 ? parseISODate(value) : new Date(value);
}

/** Nombre de jours calendaires entre deux dates (b − a), indépendant de l'heure et des changements d'heure. */
export function diffInCalendarDays(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / DAY_MS);
}

export function isSameDay(a: Date, b: Date): boolean {
  return diffInCalendarDays(a, b) === 0;
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
