"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser, useNow } from "@/lib/store";
import { can } from "@/lib/permissions";
import { formatDateLong } from "@/lib/domain/format";
import { AccessDenied } from "./access-denied";
import { AppSplash } from "./app-splash";
import { RoleSwitcher } from "./role-switcher";
import { StaleDemoBanner } from "./stale-demo-banner";

/**
 * Coquille de l'app terrain : colonne mobile (centrée sur desktop), en-tête compact,
 * aucune information financière n'y est jamais affichée.
 */
export function FieldShell({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const now = useNow();
  const router = useRouter();

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  if (!user) return <AppSplash />;

  return (
    <div className="flex min-h-dvh justify-center bg-slate-200/70">
      <div className="flex min-h-dvh w-full max-w-md flex-col bg-background shadow-xl shadow-slate-900/5 md:border-x">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-white/95 px-4 py-2 backdrop-blur">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-slate-900">{user.full_name}</p>
            <p className="truncate text-sm text-muted-foreground first-letter:uppercase">{formatDateLong(now)}</p>
          </div>
          <RoleSwitcher compact />
        </header>
        <StaleDemoBanner className="sm:flex-col sm:items-stretch" />
        <main className="flex-1 px-4 py-5">{can(user.role, "use_field_app") ? children : <AccessDenied />}</main>
      </div>
    </div>
  );
}
