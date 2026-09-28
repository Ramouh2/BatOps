import type { Metadata } from "next";
import { ModuleRoadmap } from "@/components/modules/module-roadmap";

export const metadata: Metadata = { title: "Maintenance & SAV" };

export default function SavPage() {
  return <ModuleRoadmap module="sav" />;
}
