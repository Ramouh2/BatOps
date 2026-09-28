import type { Metadata } from "next";
import { ModuleRoadmap } from "@/components/modules/module-roadmap";

export const metadata: Metadata = { title: "Devis" };

export default function QuotesPage() {
  return <ModuleRoadmap module="quotes" />;
}
