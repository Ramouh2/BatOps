"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeftIcon,
  BanIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CalendarXIcon,
  CheckIcon,
  ClipboardListIcon,
  FileSignatureIcon,
  FileTextIcon,
  HistoryIcon,
  KeyRoundIcon,
  MapPinIcon,
  MoreHorizontalIcon,
  NavigationIcon,
  PackageIcon,
  PencilIcon,
  PhoneIcon,
  PhoneIncomingIcon,
  ReceiptTextIcon,
  RepeatIcon,
  SnowflakeIcon,
  SparklesIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ActivityIcon } from "@/components/shared/activity-meta";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/motion/progress-bar";
import { Reveal } from "@/components/motion/reveal";
import { Swap } from "@/components/motion/swap";
import { useFeedback } from "@/components/motion/use-flash";
import { ClientAvatar } from "@/components/crm/client-avatar";
import { EquipmentIcon } from "@/components/crm/equipment-icon";
import { InterventionStatusTrack } from "./intervention-status-track";
import { InterventionFormSheet } from "./intervention-form-sheet";
import { PlanSheet, type PlanDefaults } from "./plan-sheet";
import { usePlanningActions } from "./use-planning-actions";
import { useActions, useCurrentUser, useData, useNow } from "@/lib/store";
import { selectInterventionDetail } from "@/lib/store/planning-selectors";
import { can } from "@/lib/permissions";
import { isSameDay, toDate, toISODate } from "@/lib/domain/dates";
import { isRefrigerantQualified, nextFreeSlot, PLANNABLE_STATUSES } from "@/lib/domain/planning";
import { getInvoiceDisplayStatus, getQuoteDisplayStatus, isReadyToInvoice } from "@/lib/domain/status";
import { formatDate, formatDateLong, formatDuration, formatEUR, formatRelativeTime, formatTime } from "@/lib/domain/format";
import {
  EQUIPMENT_CATEGORY_LABEL,
  INTERVENTION_STATUS,
  INTERVENTION_TYPE_LABEL,
  INVOICE_STATUS,
  INVOICE_TYPE_LABEL,
  PHOTO_CATEGORY_LABEL,
  PRIORITY,
  QUOTE_STATUS,
  UNIT_LABEL,
} from "@/lib/domain/labels";
import { DURATION, EASE_OUT, listItem, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

const CANCEL_REASONS = ["Reporté à la demande du client", "Client injoignable", "Travaux annulés par le client", "Doublon"];
const PART_SOURCE = { devis: "Devis", bureau: "Bureau", terrain: "Terrain" } as const;

function Card({ title, icon: Icon, action, children, className, testId }: { title: string; icon: typeof WrenchIcon; action?: React.ReactNode; children: React.ReactNode; className?: string; testId?: string }) {
  return (
    <section className={cn("rounded-lg border bg-card p-4 shadow-xs sm:p-5", className)} data-testid={testId}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Icon className="size-4 text-slate-400" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function InterventionDetail({ interventionId }: { interventionId: string }) {
  const data = useData((d) => d);
  const now = useNow();
  const user = useCurrentUser();
  const { cancelIntervention } = useActions();
  const [planOpen, setPlanOpen] = useState<PlanDefaults | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const { scope: headerScope, flash } = useFeedback<HTMLDivElement>();
  const { unschedule } = usePlanningActions(() => flash());

  const detail = useMemo(() => selectInterventionDetail(data, interventionId), [data, interventionId]);

  // Créneau conseillé : premier créneau libre parmi les techniciens compétents.
  const suggestion = useMemo(() => {
    if (!detail || detail.item.intervention.status !== "nouvelle") return null;
    const { intervention, needsRefrigerant } = detail.item;
    const eligible = detail.technicians.filter((t) => t.is_active && (!needsRefrigerant || isRefrigerantQualified(t)));
    const pool = eligible.length ? eligible : detail.technicians.filter((t) => t.is_active);
    let best: { technicianId: string; start: Date } | null = null;
    for (const tech of pool) {
      const slot = nextFreeSlot(tech.id, now, intervention.duration_minutes, data.interventions, { excludeId: intervention.id });
      if (slot && (!best || slot < best.start)) best = { technicianId: tech.id, start: slot };
    }
    return best;
  }, [detail, data.interventions, now]);

  if (!detail) {
    return (
      <EmptyState
        icon={WrenchIcon}
        title="Intervention introuvable"
        description="Cette intervention n'existe pas ou a été réinitialisée avec les données de démo."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/interventions">
              <ArrowLeftIcon />
              Retour aux interventions
            </Link>
          </Button>
        }
      />
    );
  }

  const { item, client, quote, call, contract, equipment, photos, invoices, activities } = detail;
  const { intervention, technician } = item;
  const canPlan = user ? can(user.role, "manage_planning") : false;
  const canManage = user ? can(user.role, "manage_interventions") : false;
  const showAmounts = user ? can(user.role, "view_financials") : false;
  const plannable = PLANNABLE_STATUSES.includes(intervention.status);
  const closed = intervention.status === "terminee" || intervention.status === "annulee";
  const status = INTERVENTION_STATUS[intervention.status];
  const start = intervention.scheduled_start ? toDate(intervention.scheduled_start) : null;
  const end = intervention.scheduled_end ? toDate(intervention.scheduled_end) : null;
  const siteAddress = `${intervention.address}, ${intervention.postal_code} ${intervention.city}`;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(siteAddress)}`;
  const checklistDone = intervention.checklist.filter((c) => c.checked).length;
  const partsTotal = intervention.parts_used.reduce((sum, p) => sum + p.qty * p.unit_price_ht, 0);
  const readyToInvoice = isReadyToInvoice(intervention, data.invoices);
  const suggestedTech = suggestion ? detail.technicians.find((t) => t.id === suggestion.technicianId) : undefined;
  const hasReport = Boolean(intervention.technician_report_notes || intervention.anomalies_found || intervention.recommendations || intervention.signed_at);

  return (
    <div className="space-y-6">
      <Reveal>
        <Link href="/interventions" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-slate-900">
          <ArrowLeftIcon className="size-4" />
          Interventions
        </Link>
      </Reveal>

      <Reveal delay={0.04}>
        <div ref={headerScope} className="-m-2 flex flex-col gap-4 rounded-xl p-2 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono text-slate-600" data-testid="intervention-reference">
                {intervention.reference}
              </span>
              <Badge tone="neutral">{INTERVENTION_TYPE_LABEL[intervention.type]}</Badge>
              {intervention.priority !== "normale" ? <Badge tone={PRIORITY[intervention.priority].tone}>{PRIORITY[intervention.priority].label}</Badge> : null}
              {item.needsRefrigerant ? (
                <Badge tone="info">
                  <SnowflakeIcon /> Frigoriste requis
                </Badge>
              ) : null}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{intervention.title}</h1>
              <Badge tone={status.tone} data-testid="intervention-status">
                <Swap swapKey={intervention.status}>{status.label}</Swap>
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {client ? (
                <Link href={`/clients/${client.id}`} className="font-medium text-slate-700 hover:text-primary">
                  {item.clientName}
                </Link>
              ) : (
                item.clientName
              )}{" "}
              · {item.source.label} · créée le {formatDate(intervention.created_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {plannable && canPlan ? (
              <Button onClick={() => setPlanOpen({})} data-testid="fiche-plan">
                <CalendarClockIcon />
                {intervention.status === "planifiee" ? "Déplacer / réaffecter" : "Planifier"}
              </Button>
            ) : null}
            {start && canPlan ? (
              <Button asChild variant="outline">
                <Link href={`/planning?vue=jour&date=${toISODate(start)}`}>
                  <CalendarDaysIcon />
                  Voir au planning
                </Link>
              </Button>
            ) : null}
            {!closed && canManage ? (
              <Button variant="outline" onClick={() => setEditOpen(true)} data-testid="fiche-edit">
                <PencilIcon />
                Modifier
              </Button>
            ) : null}
            {!closed && canManage ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Plus d'actions" data-testid="fiche-more">
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {intervention.status === "planifiee" && canPlan ? (
                    <DropdownMenuItem onSelect={() => unschedule(intervention.id)} data-testid="fiche-unschedule">
                      <CalendarXIcon />
                      Retirer du planning
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onSelect={() => setCancelOpen(true)} className="text-rose-700 focus:text-rose-700" data-testid="fiche-cancel">
                    <BanIcon />
                    Annuler l&apos;intervention
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.08}>
        <section className="rounded-lg border bg-card px-4 pt-4 pb-3 shadow-xs sm:px-6">
          <InterventionStatusTrack intervention={intervention} />
        </section>
      </Reveal>

      <AnimatePresence initial={false}>
        {item.conflicts.length > 0 ? (
          <motion.section
            key="conflicts"
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: DURATION.base, ease: EASE_OUT }}
            className="overflow-hidden"
            data-testid="fiche-conflicts"
          >
            <div className="flex flex-col gap-3 rounded-lg border border-rose-200 bg-rose-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <TriangleAlertIcon className="mt-0.5 size-5 shrink-0 text-rose-600" />
                <div>
                  <p className="text-sm font-semibold text-rose-900">{item.conflicts.length > 1 ? `${item.conflicts.length} conflits à résoudre` : "Conflit à résoudre"}</p>
                  <ul className="mt-1 space-y-0.5 text-sm text-rose-800">
                    {item.conflicts.map((c, i) => (
                      <li key={`${c.kind}-${i}`}>{c.message}</li>
                    ))}
                  </ul>
                </div>
              </div>
              {canPlan ? (
                <Button size="sm" variant="outline" className="shrink-0 border-rose-200 bg-white" onClick={() => setPlanOpen({})}>
                  <CalendarClockIcon />
                  Changer de créneau
                </Button>
              ) : null}
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <Reveal delay={0.12}>
            <Card title="Créneau & technicien" icon={CalendarClockIcon} testId="fiche-schedule">
              {start && end ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-base font-semibold text-slate-900 first-letter:uppercase" data-testid="fiche-slot">
                      <Swap swapKey={intervention.scheduled_start ?? ""}>
                        {formatDateLong(start)} · {formatTime(start)} – {isSameDay(start, end) ? formatTime(end) : `${formatDateLong(end)} ${formatTime(end)}`}
                      </Swap>
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {formatDuration(intervention.duration_minutes)} de travail · {formatRelativeTime(start, now)}
                    </p>
                  </div>
                  {technician ? (
                    <motion.div key={technician.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={SPRING.snappy} className="flex items-center gap-3 rounded-lg border px-3 py-2" data-testid="fiche-technician">
                      <UserAvatar user={technician} className="size-9 text-xs" />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{technician.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {isRefrigerantQualified(technician) ? "Frigoriste · " : ""}
                          {technician.specialties.slice(0, 2).join(" · ")}
                        </p>
                      </div>
                    </motion.div>
                  ) : null}
                </div>
              ) : intervention.status === "annulee" ? (
                <p className="text-sm text-muted-foreground">Intervention annulée : aucun créneau réservé.</p>
              ) : (
                <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 p-4">
                  <p className="text-sm font-medium text-amber-900">
                    À planifier · {formatDuration(intervention.duration_minutes)} de travail
                  </p>
                  {suggestion && suggestedTech ? (
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="flex items-center gap-2 text-sm text-slate-700" data-testid="fiche-suggestion">
                        <SparklesIcon className="size-4 text-amber-600" />
                        Créneau conseillé :
                        <UserAvatar user={suggestedTech} className="size-6 text-[9px]" />
                        <span className="font-medium">
                          {suggestedTech.full_name.split(" ")[0]} · {formatDateLong(suggestion.start)} à {formatTime(suggestion.start)}
                        </span>
                      </p>
                      {canPlan ? (
                        <Button size="sm" onClick={() => setPlanOpen({ technicianId: suggestion.technicianId, start: suggestion.start })} data-testid="fiche-use-suggestion">
                          <CheckIcon />
                          Choisir ce créneau
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </Card>
          </Reveal>

          <Reveal delay={0.16}>
            <Card
              title="Briefing & checklist"
              icon={ClipboardListIcon}
              action={
                intervention.checklist.length ? (
                  <span className="text-xs text-muted-foreground tabular">
                    {checklistDone}/{intervention.checklist.length} points
                  </span>
                ) : null
              }
            >
              {intervention.description ? (
                <p className="mb-4 rounded-md bg-slate-50 px-3 py-2.5 text-sm whitespace-pre-line text-slate-700" data-testid="fiche-description">
                  {intervention.description}
                </p>
              ) : (
                <p className="mb-4 text-sm text-muted-foreground">Aucune consigne particulière.</p>
              )}
              {intervention.checklist.length ? (
                <>
                  <ProgressBar value={checklistDone} max={intervention.checklist.length} tone={checklistDone === intervention.checklist.length ? "success" : "primary"} label="Avancement de la checklist" className="mb-3" />
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {intervention.checklist.map((point) => (
                      <li key={point.id} className="flex items-start gap-2 text-sm">
                        <span
                          className={cn(
                            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                            point.checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white",
                          )}
                        >
                          {point.checked ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
                        </span>
                        <span className={point.checked ? "text-slate-500" : "text-slate-800"}>{point.label}</span>
                      </li>
                    ))}
                  </ul>
                  {!closed ? <p className="mt-3 text-xs text-muted-foreground">Le technicien coche les points sur le terrain, depuis son application.</p> : null}
                </>
              ) : null}
            </Card>
          </Reveal>

          <Reveal delay={0.2}>
            <Card
              title="Pièces & prestations"
              icon={PackageIcon}
              action={showAmounts && intervention.parts_used.length ? <span className="text-sm font-semibold text-slate-900 tabular">{formatEUR(partsTotal)} HT</span> : null}
              testId="fiche-parts"
            >
              {intervention.parts_used.length ? (
                <ul className="divide-y">
                  {intervention.parts_used.map((part) => (
                    <li key={part.id} className="flex items-center gap-3 py-2 text-sm">
                      <span className="w-14 shrink-0 text-right text-slate-500 tabular">
                        {part.qty} {UNIT_LABEL[part.unit]}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-slate-800">{part.name}</span>
                      <Badge tone={part.source === "terrain" ? "warning" : "neutral"} className="hidden sm:inline-flex">
                        {PART_SOURCE[part.source]}
                      </Badge>
                      {showAmounts ? <span className="w-24 shrink-0 text-right font-medium text-slate-900 tabular">{formatEUR(part.qty * part.unit_price_ht)}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {quote ? "Aucune ligne reprise du devis." : "Aucune pièce prévue. Le technicien pourra en ajouter depuis le terrain."}
                </p>
              )}
            </Card>
          </Reveal>

          <Reveal delay={0.24}>
            <Card title="Rapport, photos & signature" icon={FileSignatureIcon} testId="fiche-report">
              {hasReport || photos.length ? (
                <div className="space-y-4">
                  {intervention.technician_report_notes ? (
                    <div>
                      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Travaux réalisés</p>
                      <p className="mt-1 text-sm whitespace-pre-line text-slate-800">{intervention.technician_report_notes}</p>
                    </div>
                  ) : null}
                  {intervention.anomalies_found ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2">
                      <p className="text-xs font-medium text-amber-800">Anomalies constatées</p>
                      <p className="mt-0.5 text-sm text-amber-950">{intervention.anomalies_found}</p>
                    </div>
                  ) : null}
                  {intervention.recommendations ? (
                    <div>
                      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Recommandations</p>
                      <p className="mt-1 text-sm text-slate-800">{intervention.recommendations}</p>
                    </div>
                  ) : null}
                  {photos.length ? (
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {photos.map((photo, index) => (
                        <motion.li
                          key={photo.id}
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: DURATION.base, ease: EASE_OUT, delay: 0.05 * index }}
                          className="overflow-hidden rounded-md border bg-slate-50"
                        >
                          <Image src={photo.image_url} alt={photo.caption ?? PHOTO_CATEGORY_LABEL[photo.category]} width={320} height={240} unoptimized className="aspect-[4/3] w-full object-cover" />
                          <p className="truncate px-2 py-1 text-[11px] text-slate-600">
                            <span className="font-medium">{PHOTO_CATEGORY_LABEL[photo.category]}</span> · {formatTime(photo.taken_at)}
                          </p>
                        </motion.li>
                      ))}
                    </ul>
                  ) : null}
                  {intervention.signed_at ? (
                    <div className="flex items-center gap-4 rounded-md border px-3 py-2">
                      {intervention.client_signature_url ? (
                        <Image src={intervention.client_signature_url} alt={`Signature de ${intervention.signed_by_name ?? "client"}`} width={140} height={56} unoptimized className="h-12 w-auto" />
                      ) : null}
                      <p className="text-sm text-slate-700">
                        Signé par <span className="font-medium">{intervention.signed_by_name}</span>
                        <span className="block text-xs text-muted-foreground">{formatRelativeTime(intervention.signed_at, now)}</span>
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {intervention.status === "annulee"
                    ? "Intervention annulée : pas de rapport."
                    : "Le technicien saisit le rapport, les photos et la signature du client depuis l'application terrain."}
                </p>
              )}
            </Card>
          </Reveal>

          <Reveal delay={0.28}>
            <Card title="Historique" icon={HistoryIcon} testId="fiche-history">
              {activities.length ? (
                <ol className="relative space-y-1 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-slate-200">
                  <AnimatePresence initial={false} mode="popLayout">
                    {activities.map((activity) => (
                      <motion.li key={activity.id} layout variants={listItem} initial="initial" animate="animate" exit="exit" transition={SPRING.layout} className="relative flex gap-3 py-1.5" data-testid="fiche-history-item">
                        <ActivityIcon type={activity.type} className="relative bg-white" />
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                            <span className="font-medium text-slate-900">{activity.title}</span>
                            <time dateTime={activity.created_at} className="text-xs text-slate-400 tabular">
                              {formatRelativeTime(activity.created_at, now)}
                            </time>
                          </p>
                          {activity.description ? <p className="mt-0.5 text-sm whitespace-pre-line text-slate-600">{activity.description}</p> : null}
                          {activity.actor_name ? <p className="mt-0.5 text-xs text-muted-foreground">{activity.actor_name}</p> : null}
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">Aucun événement enregistré.</p>
              )}
            </Card>
          </Reveal>
        </div>

        <div className="space-y-4">
          <Reveal delay={0.16}>
            <Card title="Client & chantier" icon={MapPinIcon}>
              {client ? (
                <Link href={`/clients/${client.id}`} className="mb-3 flex items-center gap-3 rounded-md transition-colors hover:text-primary">
                  <ClientAvatar client={client} className="size-9" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.clientName}</span>
                    <span className="block text-xs text-muted-foreground tabular">{client.phone}</span>
                  </span>
                </Link>
              ) : null}
              <p className="text-sm text-slate-900" data-testid="fiche-address">
                {intervention.site_label ? <span className="block font-medium">{intervention.site_label}</span> : null}
                {intervention.address}
                <br />
                {intervention.postal_code} {intervention.city}
              </p>
              {client?.access_notes ? (
                <div className="mt-3 flex gap-2.5 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-900">
                  <KeyRoundIcon className="mt-0.5 size-4 shrink-0" />
                  <p>{client.access_notes}</p>
                </div>
              ) : null}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {client ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={`tel:${client.phone.replace(/\s/g, "")}`}>
                      <PhoneIcon />
                      Appeler
                    </a>
                  </Button>
                ) : null}
                <Button asChild variant="outline" size="sm">
                  <a href={mapsUrl} target="_blank" rel="noreferrer">
                    <NavigationIcon />
                    Itinéraire
                  </a>
                </Button>
              </div>
            </Card>
          </Reveal>

          {equipment ? (
            <Reveal delay={0.2}>
              <Card title="Équipement" icon={WrenchIcon}>
                <div className="flex items-start gap-3">
                  <EquipmentIcon category={equipment.category} />
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-slate-900">
                      {equipment.brand} {equipment.model}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {EQUIPMENT_CATEGORY_LABEL[equipment.category]}
                      {equipment.location_in_property ? ` · ${equipment.location_in_property}` : ""}
                    </p>
                    {equipment.serial_number ? <p className="mt-1 font-mono text-xs text-slate-500">N° {equipment.serial_number}</p> : null}
                    {equipment.refrigerant_type ? <p className="mt-0.5 text-xs text-sky-700">Fluide {equipment.refrigerant_type}</p> : null}
                  </div>
                </div>
              </Card>
            </Reveal>
          ) : null}

          <Reveal delay={0.24}>
            <Card title="Origine & facturation" icon={FileTextIcon} testId="fiche-links">
              <ul className="space-y-2 text-sm">
                {quote ? (
                  <li>
                    <Link href={`/quotes/${quote.id}`} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors hover:border-slate-300 hover:bg-slate-50" data-testid="fiche-quote-link">
                      <span className="min-w-0">
                        <span className="block font-mono text-xs text-slate-500">{quote.reference}</span>
                        <span className="block truncate text-slate-800">{quote.title}</span>
                      </span>
                      <StatusBadge meta={QUOTE_STATUS[getQuoteDisplayStatus(quote, now)]} />
                    </Link>
                  </li>
                ) : null}
                {call ? (
                  <li className="flex gap-2.5 rounded-md border px-3 py-2">
                    <PhoneIncomingIcon className="mt-0.5 size-4 shrink-0 text-slate-400" />
                    <span>
                      <span className="block text-xs text-muted-foreground">
                        {call.handled_by === "nora" ? "Appel qualifié par Nora" : "Appel reçu au bureau"} · {formatRelativeTime(call.created_at, now)}
                      </span>
                      <span className="text-slate-800">{call.summary}</span>
                    </span>
                  </li>
                ) : null}
                {contract ? (
                  <li className="flex gap-2.5 rounded-md border px-3 py-2">
                    <RepeatIcon className="mt-0.5 size-4 shrink-0 text-slate-400" />
                    <span>
                      <span className="block font-mono text-xs text-slate-500">{contract.reference}</span>
                      <span className="text-slate-800">{contract.name}</span>
                    </span>
                  </li>
                ) : null}
                <li className="flex items-center justify-between gap-3 px-1 pt-1 text-xs">
                  <span className="text-muted-foreground">Facturation</span>
                  <span className={cn("font-medium", intervention.is_billable ? "text-slate-800" : "text-slate-500")}>
                    {intervention.is_billable ? "Facturable" : contract ? "Incluse au contrat" : "Non facturable"}
                  </span>
                </li>
                {readyToInvoice ? (
                  <li className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                    <ReceiptTextIcon className="size-4" />
                    Terminée : prête à facturer
                  </li>
                ) : null}
                {invoices.map((invoice) => (
                  <li key={invoice.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                    <span>
                      <span className="block font-mono text-xs text-slate-500">{invoice.reference}</span>
                      <span className="text-slate-800">
                        {INVOICE_TYPE_LABEL[invoice.invoice_type]}
                        {showAmounts ? ` · ${formatEUR(invoice.total_ttc)} TTC` : ""}
                      </span>
                    </span>
                    <StatusBadge meta={INVOICE_STATUS[getInvoiceDisplayStatus(invoice, now)]} />
                  </li>
                ))}
              </ul>
            </Card>
          </Reveal>
        </div>
      </div>

      <PlanSheet
        open={planOpen !== null}
        onOpenChange={(open) => !open && setPlanOpen(null)}
        interventionId={intervention.id}
        defaults={planOpen ?? undefined}
        showFicheLink={false}
        onDone={() => flash()}
      />
      <InterventionFormSheet open={editOpen} onOpenChange={setEditOpen} intervention={intervention} onSaved={() => flash()} />
      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        reference={intervention.reference}
        onConfirm={(reason) => {
          const result = cancelIntervention(intervention.id, reason);
          if (!result.ok) return Object.values(result.errors)[0] ?? "Annulation impossible.";
          toast.success(`${intervention.reference} annulée`, { description: reason });
          flash("rgba(100, 116, 139, 0.14)");
          return null;
        }}
      />
    </div>
  );
}

function CancelDialog({
  open,
  onOpenChange,
  reference,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reference: string;
  onConfirm: (reason: string) => string | null;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { scope, shake } = useFeedback<HTMLFormElement>();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const message = onConfirm(reason);
    if (message) {
      setError(message);
      shake();
      return;
    }
    setReason("");
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form ref={scope} onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Annuler {reference} ?</DialogTitle>
            <DialogDescription>Le créneau est libéré et le motif est noté dans l&apos;historique du client.</DialogDescription>
          </DialogHeader>
          <div className="my-4 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {CANCEL_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setReason(r);
                    setError(null);
                  }}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    reason === r ? "border-slate-900 bg-slate-900 text-white" : "bg-white text-slate-600 hover:border-slate-300",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <label htmlFor="cancel-reason" className="sr-only">
              Motif de l&apos;annulation
            </label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError(null);
              }}
              rows={3}
              placeholder="Motif de l'annulation (obligatoire)"
              aria-invalid={error ? true : undefined}
              data-testid="cancel-reason"
            />
            <AnimatePresence initial={false}>
              {error ? (
                <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="text-xs text-rose-600">
                  {error}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Garder l&apos;intervention
            </Button>
            <Button type="submit" variant="destructive" data-testid="confirm-cancel">
              <BanIcon />
              Annuler l&apos;intervention
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
