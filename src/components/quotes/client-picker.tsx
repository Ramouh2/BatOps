"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SearchIcon, UserPlusIcon } from "lucide-react";
import type { Client } from "@/types/batops";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ClientAvatar } from "@/components/crm/client-avatar";
import { clientDisplayName } from "@/lib/domain/clients";
import { CLIENT_STATUS } from "@/lib/domain/labels";
import { normalize } from "@/providers/text";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Choix du client d'un nouveau devis (recherche nom / ville / téléphone), ou création d'une fiche. */
export function ClientPicker({
  clients,
  onPick,
  onCreate,
  invalid,
}: {
  clients: Client[];
  onPick: (client: Client) => void;
  onCreate: () => void;
  invalid?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    return clients
      .filter((c) => !q || normalize([clientDisplayName(c), c.city, c.postal_code, c.phone.replace(/\s/g, "")].join(" ")).includes(q))
      .sort((a, b) => (a.status === b.status ? clientDisplayName(a).localeCompare(clientDisplayName(b), "fr") : a.status === "prospect" ? -1 : 1))
      .slice(0, 8);
  }, [clients, query]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (results[active]) onPick(results[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
      <Input
        ref={inputRef}
        id="quote-client"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && results[active] ? `${listId}-${results[active].id}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? "quote-client-error" : undefined}
        aria-label="Client du devis"
        placeholder="Rechercher un client ou un prospect…"
        className={cn("h-10 pl-9", invalid && "border-rose-400")}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: DURATION.fast } }}
            transition={{ duration: DURATION.base, ease: EASE_OUT }}
            className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-lg border bg-popover shadow-lg"
          >
            <ul id={listId} role="listbox" aria-label="Clients" className="max-h-72 overflow-y-auto p-1">
              {results.map((client, index) => (
                <li
                  key={client.id}
                  id={`${listId}-${client.id}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => onPick(client)}
                  className={cn("flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm", index === active ? "bg-blue-50/80" : "hover:bg-slate-50")}
                >
                  <ClientAvatar client={client} className="size-8" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{clientDisplayName(client)}</span>
                    <span className="text-xs text-muted-foreground">
                      {client.postal_code} {client.city}
                    </span>
                  </span>
                  {client.status === "prospect" ? <Badge tone={CLIENT_STATUS.prospect.tone}>Prospect</Badge> : null}
                </li>
              ))}
              {results.length === 0 ? <li className="px-3 py-3 text-sm text-muted-foreground">Aucun client trouvé.</li> : null}
            </ul>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                onCreate();
              }}
              className="flex w-full items-center gap-2 border-t px-3.5 py-2.5 text-left text-sm font-medium text-primary transition-colors hover:bg-blue-50/60"
            >
              <UserPlusIcon className="size-4" />
              Nouveau client ou prospect
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
