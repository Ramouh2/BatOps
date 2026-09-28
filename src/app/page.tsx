"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppSplash } from "@/components/layout/app-splash";
import { useCurrentUser } from "@/lib/store";
import { ROLE_HOME } from "@/lib/permissions";

/** Redirection intelligente : espace du rôle courant, ou connexion démo. */
export default function HomePage() {
  const user = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    router.replace(user ? ROLE_HOME[user.role] : "/login");
  }, [user, router]);

  return <AppSplash />;
}
