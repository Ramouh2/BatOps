import type { Metadata } from "next";
import { QuoteWorkspace } from "@/components/quotes/quote-workspace";

export const metadata: Metadata = { title: "Devis" };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuoteWorkspace key={id} quoteId={id} />;
}
