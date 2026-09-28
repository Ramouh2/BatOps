import type { Metadata } from "next";
import { ClientDetail } from "./client-detail";

export const metadata: Metadata = { title: "Fiche client" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientDetail clientId={id} />;
}
