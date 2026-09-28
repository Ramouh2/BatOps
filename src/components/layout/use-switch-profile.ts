"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useActions, useData } from "@/lib/store";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { canAccessPath, ROLE_HOME } from "@/lib/permissions";

/**
 * Changement de profil de démo en 1 clic (Marc ↔ Sophie ↔ Lucas…).
 * Reste sur la page courante si le nouveau rôle y a accès, sinon rejoint l'espace du rôle.
 */
export function useSwitchProfile() {
  const { signIn } = useActions();
  const users = useData((d) => d.users);
  const router = useRouter();
  const pathname = usePathname();

  return useCallback(
    (userId: string) => {
      const user = users.find((u) => u.id === userId);
      if (!user) return;
      signIn(user.id);

      const onFieldApp = pathname === "/tech" || pathname.startsWith("/tech/");
      const isTechnician = user.role === "technician";
      const mustMove =
        pathname === "/" ||
        pathname === "/login" ||
        !canAccessPath(user.role, pathname) ||
        (isTechnician && !onFieldApp) ||
        (!isTechnician && onFieldApp);
      if (mustMove) router.push(ROLE_HOME[user.role]);

      toast.success(`Vous êtes ${user.full_name}`, { description: `${ROLE_LABEL[user.role]} · ${user.job_title}` });
    },
    [users, signIn, pathname, router],
  );
}
