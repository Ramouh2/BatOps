import type { Metadata } from "next";
import { DashboardPreview } from "./dashboard-preview";

export const metadata: Metadata = { title: "Tableau de bord" };

export default function DashboardPage() {
  return <DashboardPreview />;
}
