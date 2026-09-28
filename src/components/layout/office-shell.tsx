"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useCurrentUser } from "@/lib/store";
import { useUi } from "@/lib/store/ui";
import { canAccessPath } from "@/lib/permissions";
import { AccessDenied } from "./access-denied";
import { AppSplash } from "./app-splash";
import { SidebarContent } from "./app-sidebar";
import { CommandMenu } from "./command-menu";
import { StaleDemoBanner } from "./stale-demo-banner";
import { Topbar } from "./topbar";

/** Coquille de l'espace bureau : sidebar 240 px, barre du haut, garde d'accès par rôle. */
export function OfficeShell({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();
  const mobileNavOpen = useUi((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUi((s) => s.setMobileNavOpen);

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  if (!user) return <AppSplash />;

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r lg:flex">
        <SidebarContent />
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Modules de BATOPS</SheetDescription>
          <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-h-dvh flex-col lg:pl-60">
        <Topbar />
        <StaleDemoBanner />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {canAccessPath(user.role, pathname) ? children : <AccessDenied />}
        </main>
      </div>

      <CommandMenu />
    </div>
  );
}
