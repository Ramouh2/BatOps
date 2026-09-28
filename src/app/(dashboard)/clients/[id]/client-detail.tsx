"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeftIcon,
  KeyRoundIcon,
  MailIcon,
  MapPinIcon,
  NavigationIcon,
  PencilIcon,
  PhoneIcon,
  PhoneIncomingIcon,
  UserCheckIcon,
  UserXIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/segmented";
import { EmptyState } from "@/components/shared/empty-state";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/reveal";
import { Swap } from "@/components/motion/swap";
import { useFeedback } from "@/components/motion/use-flash";
import { ClientAvatar } from "@/components/crm/client-avatar";
import { ClientFormSheet } from "@/components/crm/client-form-sheet";
import { ClientTimeline } from "@/components/crm/client-timeline";
import { EquipmentPanel } from "@/components/crm/equipment-panel";
import { ClientContracts, ClientDocuments, ClientInterventions } from "@/components/crm/client-records";
import { useActions, useCurrentUser, useData, useNow } from "@/lib/store";
import { selectClient360 } from "@/lib/store/crm-selectors";
import { can } from "@/lib/permissions";
import { clientContactName, clientDisplayName, formatAddress } from "@/lib/domain/clients";
import { formatDate, formatEURCompact, formatRelativeTime } from "@/lib/domain/format";
import { CALL_INTENT_LABEL, CLIENT_SOURCE_LABEL, CLIENT_STATUS, CLIENT_TYPE_LABEL, URGENCY } from "@/lib/domain/labels";
import { DURATION, EASE_OUT } from "@/lib/motion";

type DetailTab = "timeline" | "documents" | "interventions";

function MiniStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <StaggerItem className="rounded-lg border bg-card px-4 py-3 shadow-xs">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{children}</p>
    </StaggerItem>
  );
}

export function ClientDetail({ clientId }: { clientId: string }) {
  const data = useData((d) => d);
  const now = useNow();
  const user = useCurrentUser();
  const { convertProspect } = useActions();
  const [tab, setTab] = useState<DetailTab>("timeline");
  const [editOpen, setEditOpen] = useState(false);
  const { scope: headerScope, flash } = useFeedback<HTMLDivElement>();

  const view = useMemo(() => selectClient360(data, clientId, now), [data, clientId, now]);

  if (!view) {
    return (
      <EmptyState
        icon={UserXIcon}
        title="Client introuvable"
        description="Cette fiche n'existe pas ou a été réinitialisée avec les données de démo."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/clients">
              <ArrowLeftIcon />
              Retour aux clients
            </Link>
          </Button>
        }
      />
    );
  }

  const { client, stats } = view;
  const name = clientDisplayName(client);
  const showAmounts = user ? can(user.role, "view_financials") : false;
  const openCall = view.calls.find((c) => c.status !== "converti");
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(formatAddress(client))}`;
  const status = CLIENT_STATUS[client.status];

  const convert = () => {
    if (!convertProspect(client.id)) return;
    flash("rgba(16, 185, 129, 0.16)");
    toast.success("Prospect converti en client", { description: `${name} rejoint vos clients.` });
  };

  return (
    <div className="space-y-6">
      <Reveal>
        <Link href="/clients" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-slate-900">
          <ArrowLeftIcon className="size-4" />
          Clients
        </Link>
      </Reveal>

      <Reveal delay={0.04}>
        <div ref={headerScope} className="-m-2 flex flex-col gap-4 rounded-xl p-2 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <ClientAvatar client={client} className="size-12 text-sm" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{name}</h1>
                <Badge tone={status.tone} data-testid="client-status">
                  <Swap swapKey={client.status}>{status.label}</Swap>
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {CLIENT_TYPE_LABEL[client.type]}
                {client.company_name ? ` · ${clientContactName(client)}` : ""}
                {client.source ? ` · ${CLIENT_SOURCE_LABEL[client.source]}` : ""} · {client.status === "prospect" ? "Prospect" : "Fiche créée"} le{" "}
                {formatDate(client.created_at)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${client.phone.replace(/\s/g, "")}`}>
                <PhoneIcon />
                Appeler
              </a>
            </Button>
            {client.email ? (
              <Button asChild variant="outline" size="sm">
                <a href={`mailto:${client.email}`}>
                  <MailIcon />
                  E-mail
                </a>
              </Button>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <a href={mapsUrl} target="_blank" rel="noreferrer">
                <NavigationIcon />
                Itinéraire
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <PencilIcon />
              Modifier
            </Button>
            <AnimatePresence initial={false}>
              {client.status === "prospect" ? (
                <motion.span key="convert" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                  <Button size="sm" onClick={convert}>
                    <UserCheckIcon />
                    Convertir en client
                  </Button>
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </Reveal>

      <AnimatePresence initial={false}>
        {openCall ? (
          <motion.section
            key={openCall.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: DURATION.slow, ease: EASE_OUT, delay: 0.1 }}
            className="rounded-lg border border-amber-200 bg-amber-50/60 p-4"
            aria-label="Demande entrante"
          >
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-amber-900">
              <PhoneIncomingIcon className="size-4" />
              {openCall.handled_by === "nora" ? "Demande qualifiée par Nora" : "Demande reçue au bureau"}
              <Badge tone="ai">{CALL_INTENT_LABEL[openCall.detected_intent]}</Badge>
              {openCall.urgency !== "normale" ? <Badge tone={URGENCY[openCall.urgency].tone}>{URGENCY[openCall.urgency].label}</Badge> : null}
              <span className="text-xs font-normal text-amber-800/80">{formatRelativeTime(openCall.created_at, now)}</span>
            </div>
            <p className="mt-2 text-sm text-slate-800">{openCall.summary}</p>
            {openCall.preferred_slot || openCall.equipment_mentioned ? (
              <p className="mt-1 text-xs text-slate-600">
                {openCall.equipment_mentioned ? `Équipement : ${openCall.equipment_mentioned}` : ""}
                {openCall.equipment_mentioned && openCall.preferred_slot ? " · " : ""}
                {openCall.preferred_slot ? `Disponibilité : ${openCall.preferred_slot}` : ""}
              </p>
            ) : null}
          </motion.section>
        ) : null}
      </AnimatePresence>

      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4" delay={0.1}>
        {showAmounts ? (
          <MiniStat label="Encaissé (total)">
            <AnimatedNumber value={stats.cashCollected} format={formatEURCompact} />
          </MiniStat>
        ) : null}
        <MiniStat label="Devis en attente">
          <AnimatedNumber value={stats.openQuotes} />
        </MiniStat>
        <MiniStat label="Interventions à venir">
          <AnimatedNumber value={stats.upcomingInterventions} />
        </MiniStat>
        <MiniStat label="Équipements">
          <AnimatedNumber value={view.equipment.length} />
        </MiniStat>
      </Stagger>

      <div className="grid gap-6 xl:grid-cols-3">
        <Reveal delay={0.18} className="min-w-0 xl:col-span-2">
          <section className="rounded-lg border bg-card p-4 shadow-xs sm:p-5">
            <SegmentedTabs
              label="Sections de la fiche"
              value={tab}
              onValueChange={setTab}
              className="mb-5"
              items={[
                { value: "timeline", label: "Timeline", suffix: <span className="text-xs text-slate-400 tabular">{view.activities.length}</span> },
                { value: "documents", label: "Devis & factures", suffix: <span className="text-xs text-slate-400 tabular">{view.quotes.length + view.invoices.length}</span> },
                { value: "interventions", label: "Interventions", suffix: <span className="text-xs text-slate-400 tabular">{view.interventions.length}</span> },
              ]}
            />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: DURATION.base, ease: EASE_OUT }}
              >
                {tab === "timeline" ? <ClientTimeline clientId={client.id} activities={view.activities} /> : null}
                {tab === "documents" ? <ClientDocuments quotes={view.quotes} invoices={view.invoices} showAmounts={showAmounts} /> : null}
                {tab === "interventions" ? <ClientInterventions interventions={view.interventions} users={data.users} /> : null}
              </motion.div>
            </AnimatePresence>
          </section>
        </Reveal>

        <div className="space-y-4">
          <Reveal delay={0.24}>
            <section className="rounded-lg border bg-card p-4 shadow-xs sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Coordonnées</h2>
              <dl className="space-y-2.5 text-sm">
                <div className="flex gap-2.5">
                  <dt className="sr-only">Téléphone</dt>
                  <PhoneIcon className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  <dd className="tabular">
                    <a href={`tel:${client.phone.replace(/\s/g, "")}`} className="text-slate-900 hover:text-primary">
                      {client.phone}
                    </a>
                  </dd>
                </div>
                {client.email ? (
                  <div className="flex gap-2.5">
                    <dt className="sr-only">E-mail</dt>
                    <MailIcon className="mt-0.5 size-4 shrink-0 text-slate-400" />
                    <dd className="min-w-0 truncate">
                      <a href={`mailto:${client.email}`} className="text-slate-900 hover:text-primary">
                        {client.email}
                      </a>
                    </dd>
                  </div>
                ) : null}
                <div className="flex gap-2.5">
                  <dt className="sr-only">Adresse</dt>
                  <MapPinIcon className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  <dd className="text-slate-900">
                    {client.address}
                    <br />
                    {client.postal_code} {client.city}
                  </dd>
                </div>
              </dl>
              {client.access_notes ? (
                <div className="mt-4 flex gap-2.5 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-900">
                  <KeyRoundIcon className="mt-0.5 size-4 shrink-0" />
                  <p>{client.access_notes}</p>
                </div>
              ) : null}
              {client.type === "particulier" && client.housing_over_2_years !== undefined ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Logement {client.housing_over_2_years ? "de plus de 2 ans : TVA réduite applicable" : "de moins de 2 ans : TVA 20 %"}
                </p>
              ) : null}
              {client.notes ? <p className="mt-3 border-t pt-3 text-sm whitespace-pre-line text-slate-600">{client.notes}</p> : null}
            </section>
          </Reveal>

          <Reveal delay={0.3}>
            <section className="rounded-lg border bg-card p-4 shadow-xs sm:p-5">
              <EquipmentPanel clientId={client.id} clientName={name} equipment={view.equipment} data={data} />
            </section>
          </Reveal>

          <Reveal delay={0.36}>
            <section className="rounded-lg border bg-card p-4 shadow-xs sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Contrats d&apos;entretien</h2>
              <ClientContracts contracts={view.contracts} interventions={data.interventions} showAmounts={showAmounts} />
            </section>
          </Reveal>
        </div>
      </div>

      <ClientFormSheet open={editOpen} onOpenChange={setEditOpen} client={client} onSaved={() => flash()} />
    </div>
  );
}
