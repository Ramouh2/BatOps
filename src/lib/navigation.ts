import {
  BookOpenIcon,
  CalendarDaysIcon,
  CameraIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  PhoneCallIcon,
  ReceiptTextIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  UsersIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@/types/batops";
import { can, type Capability } from "@/lib/permissions";
import type { NavCounterKey } from "@/lib/store/selectors";

export type ModuleKey =
  | "dashboard"
  | "calls"
  | "clients"
  | "quotes"
  | "invoices"
  | "planning"
  | "interventions"
  | "photos"
  | "sav"
  | "catalog"
  | "settings"
  | "tech";

export interface NavItem {
  module: ModuleKey;
  href: string;
  label: string;
  icon: LucideIcon;
  requires: Capability;
  counter?: NavCounterKey;
  /** Sens du compteur [singulier, pluriel], affiché en infobulle et lu par les lecteurs d'écran. */
  counterHint?: [string, string];
  counterTone?: "neutral" | "ai" | "danger" | "warning";
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Pilotage",
    items: [
      { module: "dashboard", href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboardIcon, requires: "view_dashboard" },
      {
        module: "calls",
        href: "/calls",
        label: "Appels Nora",
        icon: PhoneCallIcon,
        requires: "manage_calls",
        counter: "calls",
        counterHint: ["appel à traiter", "appels à traiter"],
        counterTone: "ai",
      },
    ],
  },
  {
    label: "Commercial",
    items: [
      { module: "clients", href: "/clients", label: "Clients", icon: UsersIcon, requires: "manage_clients", counter: "prospects", counterHint: ["prospect à traiter", "prospects à traiter"] },
      { module: "quotes", href: "/quotes", label: "Devis", icon: FileTextIcon, requires: "read_quotes", counter: "quotes", counterHint: ["devis en attente de signature", "devis en attente de signature"] },
      {
        module: "invoices",
        href: "/invoices",
        label: "Factures",
        icon: ReceiptTextIcon,
        requires: "read_invoices",
        counter: "invoices",
        counterHint: ["facture en retard", "factures en retard"],
        counterTone: "danger",
      },
    ],
  },
  {
    label: "Terrain",
    items: [
      { module: "planning", href: "/planning", label: "Planning", icon: CalendarDaysIcon, requires: "manage_planning", counter: "planning", counterHint: ["intervention à planifier", "interventions à planifier"], counterTone: "warning" },
      { module: "interventions", href: "/interventions", label: "Interventions", icon: WrenchIcon, requires: "manage_interventions", counter: "interventions", counterHint: ["intervention prête à facturer", "interventions prêtes à facturer"] },
      { module: "photos", href: "/photos", label: "Photos chantier", icon: CameraIcon, requires: "manage_interventions" },
      { module: "sav", href: "/sav", label: "Maintenance & SAV", icon: ShieldCheckIcon, requires: "manage_contracts", counter: "sav", counterHint: ["visite d'entretien à planifier", "visites d'entretien à planifier"], counterTone: "warning" },
    ],
  },
  {
    label: "Configuration",
    items: [
      { module: "catalog", href: "/catalog", label: "Catalogue & tarifs", icon: BookOpenIcon, requires: "read_catalog" },
      { module: "settings", href: "/settings", label: "Paramètres", icon: SettingsIcon, requires: "manage_settings" },
    ],
  },
];

export const FIELD_APP_ITEM: NavItem = {
  module: "tech",
  href: "/tech",
  label: "App technicien",
  icon: SmartphoneIcon,
  requires: "use_field_app",
};

export function navSectionsFor(role: UserRole): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => can(role, item.requires)),
  })).filter((section) => section.items.length > 0);
}

export function findNavItem(pathname: string): NavItem | undefined {
  return [...NAV_SECTIONS.flatMap((s) => s.items), FIELD_APP_ITEM].find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
