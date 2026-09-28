"use client";

import { useId } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ChevronsUpDownIcon, LogOutIcon, RotateCcwIcon, SettingsIcon, SparklesIcon } from "lucide-react";
import { BatopsMark } from "@/components/brand/logo";
import { Swap } from "@/components/motion/swap";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActions, useCurrentUser, useData, useNavCounters } from "@/lib/store";
import { useUi } from "@/lib/store/ui";
import { can } from "@/lib/permissions";
import { FIELD_APP_ITEM, navSectionsFor, type NavItem } from "@/lib/navigation";
import type { NavCounters } from "@/lib/store/selectors";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

const PLAN_LABEL = { solo: "Solo", equipe: "Équipe", entreprise: "Entreprise" } as const;

const COUNTER_TONE: Record<NonNullable<NavItem["counterTone"]>, string> = {
  neutral: "bg-slate-100 text-slate-600",
  ai: "bg-amber-100 text-amber-800",
  danger: "bg-rose-100 text-rose-700",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  counters,
  onNavigate,
  label,
}: {
  item: NavItem;
  counters: NavCounters;
  onNavigate?: () => void;
  label?: string;
}) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const count = item.counter ? counters[item.counter] : 0;
  const Icon = item.icon;
  const hint = item.counterHint ? `${count} ${item.counterHint[count > 1 ? 1 : 0]}` : undefined;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={count > 0 ? hint : undefined}
      className={cn(
        "group relative flex h-8 items-center gap-2.5 rounded-md px-2 text-sm text-slate-600 transition-colors hover:bg-slate-100/70 hover:text-slate-900",
        active && "font-medium text-slate-900",
      )}
    >
      {active ? (
        <motion.span layoutId="sidebar-active" className="absolute inset-0 rounded-md bg-slate-100" transition={SPRING.snappy} />
      ) : null}
      <Icon
        className={cn("relative size-4 text-slate-400 transition-colors group-hover:text-slate-600", active && "text-primary group-hover:text-primary")}
        strokeWidth={1.75}
      />
      <span className="relative truncate">{label ?? item.label}</span>
      <AnimatePresence initial={false}>
        {count > 0 ? (
          <motion.span
            key="counter"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={SPRING.pop}
            className={cn(
              "relative ml-auto flex min-w-5 justify-center rounded-full px-1.5 py-px text-[11px] font-semibold tabular",
              COUNTER_TONE[item.counterTone ?? "neutral"],
            )}
          >
            <Swap swapKey={count}>
              <span aria-hidden="true">{count}</span>
            </Swap>
            {hint ? <span className="sr-only">{hint}</span> : null}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </Link>
  );
}

function WorkspaceMenu() {
  const organization = useData((d) => d.organization);
  const user = useCurrentUser();
  const { signOut } = useActions();
  const openReset = useUi((s) => s.setResetDialogOpen);
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-14 w-full items-center gap-2.5 border-b px-4 text-left outline-none transition-colors hover:bg-slate-50 focus-visible:bg-slate-50">
        <BatopsMark />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">{organization.name}</span>
          <span className="block truncate text-xs text-muted-foreground">BATOPS · Plan {PLAN_LABEL[organization.subscription_plan]}</span>
        </span>
        <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>
          {organization.legal_name}
          <span className="block font-normal">Espace de démonstration</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user && can(user.role, "manage_settings") ? (
          <DropdownMenuItem onSelect={() => router.push("/settings")}>
            <SettingsIcon />
            Paramètres de l&apos;entreprise
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => openReset(true)}>
          <RotateCcwIcon />
          Réinitialiser les données de démo
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            signOut();
            router.replace("/login");
          }}
        >
          <LogOutIcon />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Contenu de la barre latérale (fixe sur desktop, tiroir sur mobile). */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const user = useCurrentUser();
  const counters = useNavCounters();
  const layoutGroupId = useId();
  if (!user) return null;
  const sections = navSectionsFor(user.role);

  return (
    <LayoutGroup id={layoutGroupId}>
      <div className="flex h-full w-full flex-col bg-sidebar">
        <WorkspaceMenu />
        <nav aria-label="Navigation principale" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="px-2 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{section.label}</p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink key={item.href} item={item} counters={counters} onNavigate={onNavigate} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="space-y-3 border-t p-3">
          {can(user.role, "use_field_app") ? (
            <NavLink item={FIELD_APP_ITEM} counters={counters} onNavigate={onNavigate} label="Aperçu app technicien" />
          ) : null}
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
              <SparklesIcon className="size-3.5" />
              Mode démo gratuit
            </p>
            <p className="mt-0.5 text-xs text-amber-800/80">Données locales, IA et Nora simulées · 0 €/mois</p>
          </div>
        </div>
      </div>
    </LayoutGroup>
  );
}
