"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FilePlusIcon, FileTextIcon, RotateCcwIcon } from "lucide-react";
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
import { ClientAvatar } from "@/components/crm/client-avatar";
import { useCurrentUser, useData } from "@/lib/store";
import { useUi } from "@/lib/store/ui";
import { can } from "@/lib/permissions";
import { FIELD_APP_ITEM, navSectionsFor } from "@/lib/navigation";
import { CLIENT_STATUS, QUOTE_STATUS, ROLE_LABEL } from "@/lib/domain/labels";
import { clientDisplayName } from "@/lib/domain/clients";
import { useSwitchProfile } from "./use-switch-profile";

/** Palette de commandes (⌘K / Ctrl+K) : navigation, changement de profil, actions de démo. */
export function CommandMenu() {
  const open = useUi((s) => s.commandOpen);
  const setOpen = useUi((s) => s.setCommandOpen);
  const openReset = useUi((s) => s.setResetDialogOpen);
  const user = useCurrentUser();
  const users = useData((d) => d.users);
  const clients = useData((d) => d.clients);
  const quotes = useData((d) => d.quotes);
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
      <CommandInput placeholder="Client, devis, module, profil…" />
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
        {can(user.role, "manage_clients") ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Clients & prospects">
              {clients.map((client) => (
                <CommandItem
                  key={client.id}
                  value={`client ${clientDisplayName(client)} ${client.city} ${client.phone.replace(/\s/g, "")}`}
                  onSelect={() => run(() => router.push(`/clients/${client.id}`))}
                >
                  <ClientAvatar client={client} className="size-6 rounded-md text-[9px]" />
                  <span className="truncate">{clientDisplayName(client)}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {client.city}
                    {client.status === "prospect" ? <span className="text-blue-700">{CLIENT_STATUS.prospect.label}</span> : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
        {can(user.role, "read_quotes") ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Devis">
              {can(user.role, "manage_quotes") ? (
                <CommandItem value="nouveau devis créer" onSelect={() => run(() => router.push("/quotes/new"))}>
                  <FilePlusIcon />
                  Nouveau devis
                </CommandItem>
              ) : null}
              {[...quotes]
                .sort((a, b) => b.reference.localeCompare(a.reference))
                .map((quote) => {
                  const client = clients.find((c) => c.id === quote.client_id);
                  return (
                    <CommandItem
                      key={quote.id}
                      value={`devis ${quote.reference} ${quote.title} ${client ? clientDisplayName(client) : ""}`}
                      onSelect={() => run(() => router.push(`/quotes/${quote.id}`))}
                    >
                      <FileTextIcon />
                      <span className="shrink-0 font-mono text-xs">{quote.reference}</span>
                      <span className="truncate">{client ? clientDisplayName(client) : quote.title}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{QUOTE_STATUS[quote.status].label}</span>
                    </CommandItem>
                  );
                })}
            </CommandGroup>
          </>
        ) : null}
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
