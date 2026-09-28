"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  MoreHorizontalIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  SearchIcon,
  SearchXIcon,
  UserCheckIcon,
  UserRoundSearchIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { Client } from "@/types/batops";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedTabs } from "@/components/ui/segmented";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Reveal } from "@/components/motion/reveal";
import { Swap } from "@/components/motion/swap";
import { ClientAvatar } from "@/components/crm/client-avatar";
import { ClientFormSheet } from "@/components/crm/client-form-sheet";
import { batopsStore, useActions, useData, useNow } from "@/lib/store";
import { countByTab, filterClientRows, selectClientRows, type ClientRow, type ClientTab } from "@/lib/store/crm-selectors";
import { CLIENT_SOURCE_LABEL, CLIENT_STATUS, CLIENT_TYPE_LABEL, URGENCY } from "@/lib/domain/labels";
import { formatRelativeTime } from "@/lib/domain/format";
import { DURATION, EASE_OUT, listItem, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

const TABS: { value: ClientTab; label: string }[] = [
  { value: "tous", label: "Tous" },
  { value: "prospects", label: "Prospects à traiter" },
  { value: "clients", label: "Clients" },
  { value: "contrat", label: "Sous contrat" },
];

/** Colonnes fixes partagées par l'en-tête et chaque ligne (la colonne d'actions a une largeur constante). */
const GRID =
  "md:grid-cols-[minmax(0,2.4fr)_6.5rem_minmax(0,1.1fr)_8.5rem_minmax(0,1.6fr)_2.25rem] lg:grid-cols-[minmax(0,2.4fr)_6.5rem_minmax(0,1.1fr)_8.5rem_minmax(0,1.6fr)_9.25rem]";

function isTab(value: string | null): value is ClientTab {
  return TABS.some((t) => t.value === value);
}

function RowActions({ row, onEdit, onConvert }: { row: ClientRow; onEdit: (c: Client) => void; onConvert: (c: Client) => void }) {
  const router = useRouter();
  const prospect = row.client.status === "prospect";
  return (
    <div className="relative z-10 flex items-center justify-end gap-1.5">
      {prospect ? (
        <Button size="sm" variant="outline" className="hidden lg:inline-flex" onClick={() => onConvert(row.client)}>
          <UserCheckIcon />
          Convertir
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${row.name}`}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => router.push(`/clients/${row.client.id}`)}>
            <UsersIcon />
            Ouvrir la fiche
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onEdit(row.client)}>
            <PencilIcon />
            Modifier
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`tel:${row.client.phone.replace(/\s/g, "")}`}>
              <PhoneIcon />
              Appeler {row.client.phone}
            </a>
          </DropdownMenuItem>
          {prospect ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onConvert(row.client)}>
                <UserCheckIcon />
                Convertir en client
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ClientRowItem({
  row,
  tab,
  highlighted,
  now,
  onEdit,
  onConvert,
}: {
  row: ClientRow;
  tab: ClientTab;
  highlighted: boolean;
  now: Date;
  onEdit: (c: Client) => void;
  onConvert: (c: Client) => void;
}) {
  const { client } = row;
  const status = CLIENT_STATUS[client.status];
  const request = row.lastCall && row.lastCall.status !== "converti" ? row.lastCall : undefined;
  const demand = request?.summary ?? client.notes;

  return (
    <motion.li
      layout
      variants={listItem}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={SPRING.layout}
      className={cn("group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-slate-50/80", GRID)}
      data-testid={`client-row-${client.id}`}
    >
      {highlighted ? (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-blue-50"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.8, ease: "easeOut", delay: 0.2 }}
        />
      ) : null}
      <div className="relative flex min-w-0 items-center gap-3">
        <ClientAvatar client={client} />
        <div className="min-w-0">
          <Link
            href={`/clients/${client.id}`}
            className="block truncate text-sm font-medium text-slate-900 outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-primary focus-visible:after:rounded-md focus-visible:after:ring-[3px] focus-visible:after:ring-ring/40"
          >
            {row.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {client.company_name ? `${row.contact} · ` : ""}
            {CLIENT_TYPE_LABEL[client.type]}
            <span className="md:hidden"> · {client.city}</span>
          </p>
        </div>
      </div>
      <div className="relative hidden md:block">
        <Badge tone={status.tone}>
          <Swap swapKey={client.status}>{status.label}</Swap>
        </Badge>
      </div>
      <p className="relative hidden truncate text-sm text-slate-600 md:block">{client.city}</p>
      <p className="relative hidden text-sm text-slate-600 tabular md:block">{client.phone}</p>
      <div className="relative hidden min-w-0 md:block">
        {tab === "prospects" ? (
          <div className="min-w-0">
            <p className="truncate text-sm text-slate-700">{demand ?? "Besoin à qualifier"}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              {request && request.urgency !== "normale" ? <Badge tone={URGENCY[request.urgency].tone}>{URGENCY[request.urgency].label}</Badge> : null}
              {client.source ? CLIENT_SOURCE_LABEL[client.source] : null}
            </p>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0 tabular">
              {row.equipmentCount} équip.
            </span>
            {row.hasContract ? <Badge tone="success">Contrat</Badge> : null}
            {row.openQuotes > 0 ? <Badge tone="info">{row.openQuotes} devis</Badge> : null}
            {row.lastActivityAt ? <span className="truncate">· {formatRelativeTime(row.lastActivityAt, now)}</span> : null}
          </div>
        )}
      </div>
      <RowActions row={row} onEdit={onEdit} onConvert={onConvert} />
    </motion.li>
  );
}

export function ClientsView() {
  const data = useData((d) => d);
  const now = useNow();
  const { convertProspect } = useActions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: ClientTab = isTab(tabParam) ? tabParam : "tous";

  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | undefined>();
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const rows = useMemo(() => selectClientRows(data, now), [data, now]);
  const counts = useMemo(() => countByTab(rows), [rows]);
  const visible = useMemo(() => filterClientRows(rows, tab, query), [rows, tab, query]);

  const setTab = (value: ClientTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "tous") params.delete("tab");
    else params.set("tab", value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  const convert = (client: Client) => {
    if (!convertProspect(client.id)) return;
    setHighlightId(client.id);
    toast.success("Prospect converti en client", {
      description: `${rows.find((r) => r.client.id === client.id)?.name ?? ""} rejoint vos clients.`,
      action: { label: "Ouvrir la fiche", onClick: () => router.push(`/clients/${client.id}`) },
    });
  };

  const onSaved = (clientId: string) => {
    setHighlightId(clientId);
    if (!editing) {
      // La nouvelle fiche doit être visible : on revient sur « Tous » si le filtre courant la masque.
      const created = batopsStore.getState().data?.clients.find((c) => c.id === clientId);
      const visibleInTab =
        tab === "tous" || (tab === "prospects" && created?.status === "prospect") || (tab === "clients" && created?.status === "client");
      if (query) setQuery("");
      if (!visibleInTab) setTab("tous");
    }
  };

  const prospectLabel = counts.prospects > 1 ? "prospects à traiter" : "prospect à traiter";

  return (
    <>
      <Reveal>
        <PageHeader
          title="Clients & prospects"
          description={
            <>
              <Swap swapKey={counts.clients}>{counts.clients}</Swap> clients ·{" "}
              <Swap swapKey={counts.prospects}>{counts.prospects}</Swap> {prospectLabel}
            </>
          }
          actions={
            <Button onClick={openCreate}>
              <PlusIcon />
              Nouveau client
            </Button>
          }
        />
      </Reveal>

      <Reveal delay={0.08} className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SegmentedTabs
          label="Filtrer les clients"
          value={tab}
          onValueChange={setTab}
          items={TABS.map((t) => ({
            value: t.value,
            label: t.label,
            suffix: (
              <span className="rounded-full bg-slate-200/70 px-1.5 text-[11px] font-semibold text-slate-600 tabular">
                <Swap swapKey={counts[t.value]}>{counts[t.value]}</Swap>
              </span>
            ),
          }))}
        />
        <div className="relative w-full lg:w-72">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nom, ville, téléphone…"
            aria-label="Rechercher un client"
            className="pr-9 pl-9"
          />
          <AnimatePresence>
            {query ? (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: DURATION.fast, ease: EASE_OUT }}
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Effacer la recherche"
              >
                <XIcon className="size-3.5" />
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>
      </Reveal>

      <Reveal delay={0.14}>
        <section className="overflow-hidden rounded-lg border bg-card shadow-xs" aria-label="Liste des clients">
          <div className={cn("hidden gap-4 border-b bg-slate-50/70 px-4 py-2 text-xs font-medium text-muted-foreground md:grid", GRID)} aria-hidden="true">
            <span>Client</span>
            <span>Statut</span>
            <span>Ville</span>
            <span>Téléphone</span>
            <span>{tab === "prospects" ? "Demande" : "Parc & activité"}</span>
            <span />
          </div>
          <AnimatePresence mode="popLayout" initial={false}>
            {visible.length === 0 ? (
              <motion.div key={`empty-${tab}-${query ? "q" : ""}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {query ? (
                  <EmptyState
                    icon={SearchXIcon}
                    title={`Aucun résultat pour « ${query} »`}
                    description="Vérifiez l'orthographe ou cherchez par ville, téléphone ou e-mail."
                    action={
                      <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                        Effacer la recherche
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={UserRoundSearchIcon}
                    title={tab === "prospects" ? "Aucun prospect à traiter" : "Aucun client dans cette vue"}
                    description={tab === "prospects" ? "Chaque nouvelle demande apparaîtra ici jusqu'à sa conversion." : undefined}
                    action={
                      <Button size="sm" onClick={openCreate}>
                        <PlusIcon />
                        Nouveau {tab === "prospects" ? "prospect" : "client"}
                      </Button>
                    }
                  />
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
          <motion.ul layout className="divide-y">
            <AnimatePresence mode="popLayout" initial={false}>
              {visible.map((row) => (
                <ClientRowItem
                  key={row.client.id}
                  row={row}
                  tab={tab}
                  now={now}
                  highlighted={row.client.id === highlightId}
                  onEdit={(client) => {
                    setEditing(client);
                    setFormOpen(true);
                  }}
                  onConvert={convert}
                />
              ))}
            </AnimatePresence>
          </motion.ul>
        </section>
      </Reveal>

      <ClientFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        client={editing}
        defaultStatus={tab === "clients" || tab === "contrat" ? "client" : "prospect"}
        onSaved={onSaved}
      />
    </>
  );
}
