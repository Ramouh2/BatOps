import { Suspense } from "react";
import type { Metadata } from "next";
import { QuotesView } from "./quotes-view";

export const metadata: Metadata = { title: "Devis" };

export default function QuotesPage() {
  return (
    <Suspense>
      <QuotesView />
    </Suspense>
  );
}
