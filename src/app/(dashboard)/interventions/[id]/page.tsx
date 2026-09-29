import type { Metadata } from "next";
import { InterventionDetail } from "@/components/interventions/intervention-detail";

export const metadata: Metadata = { title: "Intervention" };

export default async function InterventionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InterventionDetail key={id} interventionId={id} />;
}
