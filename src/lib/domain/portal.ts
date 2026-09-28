/**
 * Liens du portail client public (`/portal/[token]`), sans mot de passe : le jeton non devinable du client
 * donne accès à ses seuls documents. `?devis=` ouvre directement un devis.
 */
export function portalPath(token: string, quoteReference?: string): string {
  const base = `/portal/${encodeURIComponent(token)}`;
  return quoteReference ? `${base}?devis=${encodeURIComponent(quoteReference)}` : base;
}

export function portalUrl(origin: string, token: string, quoteReference?: string): string {
  return `${origin.replace(/\/+$/, "")}${portalPath(token, quoteReference)}`;
}

/** Motifs de refus proposés sur le portail (le client peut préciser). */
export const REFUSAL_REASONS = [
  "Le prix est trop élevé",
  "J'ai choisi une autre entreprise",
  "Le projet est reporté",
  "Autre raison",
] as const;
