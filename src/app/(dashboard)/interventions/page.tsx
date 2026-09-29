import { Suspense } from "react";
import type { Metadata } from "next";
import { InterventionsView } from "./interventions-view";

export const metadata: Metadata = { title: "Interventions" };

export default function InterventionsPage() {
  return (
    <Suspense>
      <InterventionsView />
    </Suspense>
  );
}
