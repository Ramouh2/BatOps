import type { Metadata } from "next";
import { SettingsFoundation } from "./settings-foundation";

export const metadata: Metadata = { title: "Paramètres" };

export default function SettingsPage() {
  return <SettingsFoundation />;
}
