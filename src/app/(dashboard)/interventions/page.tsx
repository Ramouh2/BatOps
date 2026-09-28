import type { Metadata } from "next";
import { ModuleRoadmap } from "@/components/modules/module-roadmap";

export const metadata: Metadata = { title: "Interventions" };

export default function InterventionsPage() {
  return <ModuleRoadmap module="interventions" />;
}
