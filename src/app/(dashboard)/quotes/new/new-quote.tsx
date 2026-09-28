"use client";

import { useSearchParams } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { QuoteWorkspace } from "@/components/quotes/quote-workspace";
import { useCurrentUser } from "@/lib/store";
import { can } from "@/lib/permissions";

/** Nouveau devis (`?client=` pré-sélectionne le client depuis sa fiche). */
export function NewQuote() {
  const params = useSearchParams();
  const user = useCurrentUser();
  if (!user || !can(user.role, "manage_quotes")) return <AccessDenied />;
  return <QuoteWorkspace initialClientId={params.get("client") ?? undefined} />;
}
