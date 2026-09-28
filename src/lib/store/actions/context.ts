import type { FieldErrors } from "@/lib/domain/validation";

/** Contexte d'une mutation métier : instant et auteur (affiché dans la timeline). */
export interface MutationContext {
  now: Date;
  actor?: string;
}

export type MutationResult<T = void> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

export const ok = <T>(value: T): MutationResult<T> => ({ ok: true, value });
export const fail = <T = never>(errors: FieldErrors): MutationResult<T> => ({ ok: false, errors });
