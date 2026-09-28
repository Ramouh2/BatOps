"use client";

import Link from "next/link";
import { LockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/lib/store";
import { ROLE_HOME } from "@/lib/permissions";
import { ROLE_LABEL } from "@/lib/domain/labels";

export function AccessDenied() {
  const user = useCurrentUser();
  if (!user) return null;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-slate-100">
        <LockIcon className="size-5 text-slate-500" />
      </span>
      <h1 className="mt-4 text-lg font-semibold text-slate-900">Accès réservé</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Le profil {ROLE_LABEL[user.role]} n&apos;a pas accès à cet espace. Changez de profil de démo en haut à droite ou
        revenez à votre espace.
      </p>
      <Button asChild className="mt-6">
        <Link href={ROLE_HOME[user.role]}>Revenir à mon espace</Link>
      </Button>
    </div>
  );
}
