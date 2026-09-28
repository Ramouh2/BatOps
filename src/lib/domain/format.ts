import type { ISODate, ISODateTime } from "@/types/batops";
import { diffInCalendarDays, toDate } from "./dates";

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const eurCompact = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** `1 450,00 €` */
export function formatEUR(amount: number): string {
  return eur.format(amount);
}

/** `1 450 €` — pour les KPI. */
export function formatEURCompact(amount: number): string {
  return eurCompact.format(amount);
}

export function formatNumber(value: number): string {
  return number.format(value);
}

/** `35,6 %` */
export function formatPercent(value: number): string {
  return `${percent.format(value)} %`;
}

/** `5,5 %` / `10 %` */
export function formatVatRate(rate: number): string {
  return `${number.format(rate)} %`;
}

type DateInput = ISODate | ISODateTime | Date;

const dateShort = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const dateLong = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const dateMonthDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** `28 sept. 2026` */
export function formatDate(value: DateInput): string {
  return dateShort.format(toDate(value));
}

/** `lundi 28 septembre` */
export function formatDateLong(value: DateInput): string {
  return dateLong.format(toDate(value));
}

/** `28 sept.` */
export function formatDayMonth(value: DateInput): string {
  return dateMonthDay.format(toDate(value));
}

/** `14:00` */
export function formatTime(value: DateInput): string {
  return time.format(toDate(value));
}

/** `28 sept. 2026 à 14:00` */
export function formatDateTime(value: DateInput): string {
  return `${formatDate(value)} à ${formatTime(value)}`;
}

/** `aujourd'hui`, `hier`, `demain`, `il y a 4 jours`, `dans 12 jours`. */
export function formatRelativeDay(value: DateInput, now: Date): string {
  const days = diffInCalendarDays(now, toDate(value));
  if (days === 0) return "aujourd'hui";
  if (days === -1) return "hier";
  if (days === 1) return "demain";
  if (days < 0) return `il y a ${-days} jours`;
  return `dans ${days} jours`;
}

/** `06 42 18 99 10` */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  return phone;
}

/** Durée en minutes → `1 h 30`. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
