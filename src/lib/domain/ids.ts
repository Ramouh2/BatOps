import type { SequenceKey } from "@/types/batops";

const ALPHABET = "0123456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  // `crypto.getRandomValues` reste disponible hors contexte sécurisé (ex. démo sur téléphone via IP locale),
  // contrairement à `crypto.randomUUID`.
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Identifiant opaque préfixé, ex. `quo_8fK2mZq9Lx4t`. */
export function createId(prefix: string): string {
  return `${prefix}_${randomString(14)}`;
}

/** Jeton de portail client non devinable. */
export function createPortalToken(): string {
  return `ptk_${randomString(24)}`;
}

const REFERENCE_PREFIX: Record<SequenceKey, string> = {
  quote: "DEV",
  intervention: "INT",
  invoice: "FAC",
  avoir: "AVO",
  contract: "CTR",
};

/** `DEV-2026-0042` */
export function formatReference(kind: SequenceKey, year: number, sequence: number): string {
  return `${REFERENCE_PREFIX[kind]}-${year}-${String(sequence).padStart(4, "0")}`;
}

/** Extrait le numéro séquentiel d'une référence (`FAC-2026-0084` → 84). */
export function referenceNumber(reference: string): number {
  const match = /-(\d+)$/.exec(reference);
  return match ? Number(match[1]) : 0;
}
