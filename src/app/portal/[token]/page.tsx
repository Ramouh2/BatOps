import { Suspense } from "react";
import type { Metadata } from "next";
import { PortalView } from "./portal-view";

export const metadata: Metadata = {
  title: "Votre devis",
  robots: { index: false, follow: false },
};

/** Portail client public (sans compte) : l'accès se fait par le jeton non devinable du client. */
export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <Suspense>
      <PortalView token={decodeURIComponent(token)} />
    </Suspense>
  );
}
