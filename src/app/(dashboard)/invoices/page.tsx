import type { Metadata } from "next";
import { ModuleRoadmap } from "@/components/modules/module-roadmap";

export const metadata: Metadata = { title: "Factures" };

export default function InvoicesPage() {
  return <ModuleRoadmap module="invoices" />;
}
