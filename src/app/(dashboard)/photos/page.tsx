import type { Metadata } from "next";
import { ModuleRoadmap } from "@/components/modules/module-roadmap";

export const metadata: Metadata = { title: "Photos chantier" };

export default function PhotosPage() {
  return <ModuleRoadmap module="photos" />;
}
