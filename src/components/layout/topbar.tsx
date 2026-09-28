"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { MenuIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUi } from "@/lib/store/ui";
import { findNavItem, NAV_SECTIONS } from "@/lib/navigation";
import { RoleSwitcher } from "./role-switcher";

const noopSubscribe = () => () => {};

function useIsMac() {
  return useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => false,
  );
}

export function Topbar() {
  const pathname = usePathname();
  const setMobileNavOpen = useUi((s) => s.setMobileNavOpen);
  const setCommandOpen = useUi((s) => s.setCommandOpen);
  const isMac = useIsMac();

  const item = findNavItem(pathname);
  const section = NAV_SECTIONS.find((s) => s.items.some((i) => i.href === item?.href));

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-white/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/70 sm:px-6 lg:px-8">
      <Button
        variant="ghost"
        size="icon"
        className="-ml-2 lg:hidden"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Ouvrir la navigation"
      >
        <MenuIcon className="size-5" />
      </Button>

      <nav aria-label="Fil d'Ariane" className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
        {section ? <span className="text-muted-foreground">{section.label}</span> : null}
        {section && item ? <span className="text-slate-300">/</span> : null}
        {item ? <span className="truncate font-medium text-slate-900">{item.label}</span> : null}
      </nav>
      <span className="truncate text-sm font-medium text-slate-900 md:hidden">{item?.label}</span>

      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="ml-auto flex h-9 items-center gap-2 rounded-md border bg-card px-2.5 text-sm text-muted-foreground shadow-xs transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:w-64 md:ml-6 md:mr-auto"
        aria-label="Ouvrir la palette de commandes"
      >
        <SearchIcon className="size-4" />
        <span className="hidden sm:inline">Rechercher, aller à…</span>
        <kbd className="ml-auto hidden rounded border bg-slate-50 px-1.5 font-mono text-[11px] text-slate-500 sm:inline">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      <RoleSwitcher />
    </header>
  );
}
