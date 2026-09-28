import { Suspense } from "react";
import type { Metadata } from "next";
import { NewQuote } from "./new-quote";

export const metadata: Metadata = { title: "Nouveau devis" };

export default function NewQuotePage() {
  return (
    <Suspense>
      <NewQuote />
    </Suspense>
  );
}
