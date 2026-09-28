"use client";

import { ChevronsUpDownIcon, LogOutIcon, RotateCcwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuCheckItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useActions, useCurrentUser, useData } from "@/lib/store";
import { useUi } from "@/lib/store/ui";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import { useSwitchProfile } from "./use-switch-profile";

/** Sélecteur de rôle « Mode démo » : Marc (Patron) · Sophie (Secrétaire) · Lucas (Technicien)… */
export function RoleSwitcher({ compact = false, className }: { compact?: boolean; className?: string }) {
  const user = useCurrentUser();
  const users = useData((d) => d.users);
  const switchProfile = useSwitchProfile();
  const { signOut } = useActions();
  const openReset = useUi((s) => s.setResetDialogOpen);
  const router = useRouter();

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-2.5 rounded-lg border bg-card py-1 pr-2 pl-1 text-left shadow-xs transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40",
          compact && "size-11 justify-center border-transparent p-0 shadow-none",
          className,
        )}
        aria-label={`Profil de démo : ${user.full_name} (${ROLE_LABEL[user.role]}). Changer de rôle`}
      >
        <UserAvatar user={user} className={compact ? "size-9 text-xs" : undefined} />
        {compact ? null : (
          <>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate text-sm leading-tight font-medium text-slate-900">{user.full_name}</span>
              <span className="block text-xs leading-tight text-muted-foreground">{ROLE_LABEL[user.role]}</span>
            </span>
            <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Mode démo — changer de profil</DropdownMenuLabel>
        {users
          .filter((u) => u.is_active)
          .map((u) => (
            <DropdownMenuCheckItem key={u.id} checked={u.id === user.id} onSelect={() => switchProfile(u.id)}>
              <UserAvatar user={u} />
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-900">{u.full_name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {ROLE_LABEL[u.role]} · {u.job_title}
                </span>
              </span>
            </DropdownMenuCheckItem>
          ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openReset(true)}>
          <RotateCcwIcon />
          Réinitialiser les données de démo
        </DropdownMenuItem>
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
