import type { Metadata } from "next";
import { ModuleRoadmap } from "@/components/modules/module-roadmap";

export const metadata: Metadata = { title: "Clients" };

export default function ClientsPage() {
  return <ModuleRoadmap module="clients" />;
}
