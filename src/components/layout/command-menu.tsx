"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RotateCcwIcon } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useCurrentUser, useData } from "@/lib/store";
import { useUi } from "@/lib/store/ui";
import { can } from "@/lib/permissions";
import { FIELD_APP_ITEM, navSectionsFor } from "@/lib/navigation";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { useSwitchProfile } from "./use-switch-profile";

/** Palette de commandes (⌘K / Ctrl+K) : navigation, changement de profil, actions de démo. */
export function CommandMenu() {
  const open = useUi((s) => s.commandOpen);
  const setOpen = useUi((s) => s.setCommandOpen);
  const openReset = useUi((s) => s.setResetDialogOpen);
  const user = useCurrentUser();
  const users = useData((d) => d.users);
  const switchProfile = useSwitchProfile();
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(!useUi.getState().commandOpen);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);

  if (!user) return null;

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  const navItems = navSectionsFor(user.role).flatMap((s) => s.items);
  if (can(user.role, "use_field_app")) navItems.push(FIELD_APP_ITEM);

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Palette de commandes" description="Naviguer dans BATOPS ou lancer une action">
      <CommandInput placeholder="Aller à un module, changer de profil…" />
      <CommandList>
        <CommandEmpty>Aucun résultat.</CommandEmpty>
        <CommandGroup heading="Aller à">
          {navItems.map((item) => (
            <CommandItem key={item.href} value={`aller ${item.label}`} onSelect={() => run(() => router.push(item.href))}>
              <item.icon strokeWidth={1.75} />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Profil de démo">
          {users
            .filter((u) => u.is_active && u.id !== user.id)
            .map((u) => (
              <CommandItem key={u.id} value={`profil ${u.full_name} ${ROLE_LABEL[u.role]}`} onSelect={() => run(() => switchProfile(u.id))}>
                <UserAvatar user={u} className="size-5 text-[9px]" />
                Devenir {u.full_name}
                <span className="ml-auto text-xs text-muted-foreground">{ROLE_LABEL[u.role]}</span>
              </CommandItem>
            ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Démo">
          <CommandItem value="réinitialiser données démo reset" onSelect={() => run(() => openReset(true))}>
            <RotateCcwIcon />
            Réinitialiser les données de démo
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
