import type { Metadata } from "next";
import { ModuleRoadmap } from "@/components/modules/module-roadmap";

export const metadata: Metadata = { title: "Planning" };

export default function PlanningPage() {
  return <ModuleRoadmap module="planning" />;
}
