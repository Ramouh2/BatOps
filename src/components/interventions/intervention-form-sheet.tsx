"use client";

import { useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PencilIcon, PhoneIncomingIcon } from "lucide-react";
import { toast } from "sonner";
import type { Client, Intervention, InterventionPriority, InterventionType } from "@/types/batops";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedChoice } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useFeedback } from "@/components/motion/use-flash";
import { ClientAvatar } from "@/components/crm/client-avatar";
import { ClientPicker } from "@/components/quotes/client-picker";
import { DecimalInput } from "@/components/quotes/decimal-input";
import { batopsStore, useActions, useData } from "@/lib/store";
import { clientDisplayName } from "@/lib/domain/clients";
import { formatDayMonth } from "@/lib/domain/format";
import { EQUIPMENT_CATEGORY_LABEL } from "@/lib/domain/labels";
import { hasErrors, validateInterventionInput, type InterventionField, type InterventionInput } from "@/lib/domain/validation";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

const TYPES: { value: InterventionType; label: string }[] = [
  { value: "depannage", label: "Dépannage" },
  { value: "installation", label: "Installation" },
  { value: "maintenance", label: "Entretien" },
  { value: "sav", label: "SAV" },
];
const PRIORITIES: { value: InterventionPriority; label: string }[] = [
  { value: "normale", label: "Normale" },
  { value: "haute", label: "Haute" },
  { value: "urgente", label: "Urgente" },
];
const DURATIONS = [30, 60, 90, 120, 240, 600];
const durationLabel = (m: number) => (m < 60 ? `${m} min` : m === 600 ? "1 j" : `${m / 60} h`.replace(".5 h", " h 30"));

function toInput(intervention?: Intervention, client?: Client): InterventionInput {
  return {
    client_id: intervention?.client_id ?? client?.id ?? "",
    title: intervention?.title ?? "",
    type: intervention?.type ?? "depannage",
    priority: intervention?.priority ?? "normale",
    description: intervention?.description ?? "",
    duration_minutes: intervention?.duration_minutes ?? 90,
    address: intervention?.address ?? client?.address ?? "",
    postal_code: intervention?.postal_code ?? client?.postal_code ?? "",
    city: intervention?.city ?? client?.city ?? "",
    site_label: intervention?.site_label ?? "",
    equipment_id: intervention?.equipment_id,
    is_billable: intervention?.is_billable ?? true,
    call_log_id: intervention?.call_log_id,
  };
}

function Form({ intervention, defaultClientId, onDone }: { intervention?: Intervention; defaultClientId?: string; onDone: (id: string, created: boolean) => void }) {
  const data = useData((d) => d);
  const { createIntervention, updateIntervention } = useActions();
  const [form, setForm] = useState<InterventionInput>(() => {
    const client = data.clients.find((c) => c.id === defaultClientId);
    const input = toInput(intervention, client);
    // Une demande de dépannage ouverte du client devient cette intervention (lien visible, annulable).
    if (!intervention && client) input.call_log_id = data.calls.find((c) => c.client_id === client.id && c.status !== "converti" && c.detected_intent !== "devis_installation")?.id;
    return input;
  });
  const [submitted, setSubmitted] = useState(false);
  const [editSite, setEditSite] = useState(false);
  const { scope, shake } = useFeedback<HTMLFormElement>();
  const client = data.clients.find((c) => c.id === form.client_id);
  const errors = submitted ? validateInterventionInput(form, data) : {};
  const equipment = client ? data.equipment.filter((e) => e.client_id === client.id) : [];
  const call = form.call_log_id ? data.calls.find((c) => c.id === form.call_log_id) : undefined;
  const set = <K extends keyof InterventionInput>(key: K, value: InterventionInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const pickClient = (next: Client) =>
    setForm((f) => ({
      ...f,
      client_id: next.id,
      address: next.address,
      postal_code: next.postal_code,
      city: next.city,
      equipment_id: undefined,
      call_log_id: data.calls.find((c) => c.client_id === next.id && c.status !== "converti" && c.detected_intent !== "devis_installation")?.id,
    }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const found = validateInterventionInput(form, data);
    if (hasErrors(found)) {
      shake();
      const order: [InterventionField, string][] = [
        ["client_id", "quote-client"],
        ["title", "int-title"],
        ["duration_minutes", "int-duration"],
        ["address", "int-address"],
        ["postal_code", "int-cp"],
        ["city", "int-city"],
      ];
      const first = order.find(([key]) => found[key]);
      if (first?.[0] === "address" || first?.[0] === "postal_code" || first?.[0] === "city") setEditSite(true);
      if (first) window.setTimeout(() => document.getElementById(first[1])?.focus(), 30);
      return;
    }
    if (intervention) {
      const result = updateIntervention(intervention.id, form);
      if (!result.ok) return shake();
      toast.success(result.value.length ? "Intervention mise à jour" : "Aucune modification", {
        description: result.value.length ? `${result.value.join(", ").replace(/^./, (c) => c.toUpperCase())} modifié${result.value.length > 1 ? "s" : ""}.` : undefined,
      });
      onDone(intervention.id, false);
      return;
    }
    const result = createIntervention(form);
    if (!result.ok) return shake();
    const created = batopsStore.getState().data?.interventions.find((i) => i.id === result.value);
    toast.success(`Intervention ${created?.reference ?? ""} créée`, { description: "Elle attend dans « À planifier »." });
    onDone(result.value, true);
  };

  return (
    <form ref={scope} onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody className="space-y-5">
        {intervention ? null : client ? (
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <ClientAvatar client={client} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{clientDisplayName(client)}</p>
              <p className="truncate text-xs text-muted-foreground">
                {client.address}, {client.city} · {client.phone}
              </p>
            </div>
            {!defaultClientId ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => set("client_id", "")}>
                Changer
              </Button>
            ) : null}
          </div>
        ) : (
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-900">Client</p>
            <ClientPicker clients={data.clients} onPick={pickClient} onCreate={() => toast("Créez d'abord la fiche depuis Clients", { description: "Puis revenez planifier son intervention." })} invalid={!!errors.client_id} />
            {errors.client_id ? (
              <p id="quote-client-error" role="alert" className="mt-1.5 text-xs font-medium text-rose-600">
                {errors.client_id}
              </p>
            ) : null}
          </div>
        )}

        <AnimatePresence initial={false}>
          {call ? (
            <motion.p
              key={call.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-2 overflow-hidden rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900"
            >
              <PhoneIncomingIcon className="mt-0.5 size-3.5 shrink-0" />
              <span className="flex-1">
                Issue de l&apos;appel du {formatDayMonth(call.created_at)} : {call.summary}
              </span>
              <button type="button" className="shrink-0 font-medium underline-offset-2 hover:underline" onClick={() => set("call_log_id", undefined)}>
                Délier
              </button>
            </motion.p>
          ) : null}
        </AnimatePresence>

        <Field label="Intervention" htmlFor="int-title" error={errors.title} required>
          <Input id="int-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex. Fuite sous l'unité intérieure du salon" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-900">Type</span>
            <SegmentedChoice<InterventionType>
              name="Type d'intervention"
              value={form.type}
              onValueChange={(type) => setForm((f) => ({ ...f, type, is_billable: type === "sav" ? false : f.is_billable }))}
              options={TYPES}
              className="text-xs [&_button]:px-1.5"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-900">Priorité</span>
            <SegmentedChoice<InterventionPriority> name="Priorité" value={form.priority} onValueChange={(v) => set("priority", v)} options={PRIORITIES} />
          </div>
        </div>

        <Field label="Consignes pour le technicien" htmlFor="int-description" hint="Symptômes, accès, matériel à prévoir…">
          <Textarea id="int-description" rows={3} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
        </Field>

        <Field label="Durée de travail estimée" htmlFor="int-duration" error={errors.duration_minutes}>
          <div className="flex flex-wrap items-center gap-1.5">
            {DURATIONS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => set("duration_minutes", minutes)}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  form.duration_minutes === minutes ? "border-primary bg-blue-50 text-primary" : "text-slate-600 hover:border-slate-300",
                )}
                aria-pressed={form.duration_minutes === minutes}
              >
                {durationLabel(minutes)}
              </button>
            ))}
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <DecimalInput
                id="int-duration"
                value={Math.round((form.duration_minutes / 60) * 100) / 100}
                onValueChange={(hours) => set("duration_minutes", Math.round(hours * 60))}
                max={100}
                className="h-8 w-16 text-right text-xs"
                aria-label="Durée en heures"
              />
              h
            </span>
          </div>
        </Field>

        {client ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Équipement concerné" htmlFor="int-equipment" error={errors.equipment_id}>
              <Select value={form.equipment_id ?? "none"} onValueChange={(v) => set("equipment_id", v === "none" ? undefined : v)}>
                <SelectTrigger id="int-equipment" disabled={equipment.length === 0}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{equipment.length === 0 ? "Aucun équipement au parc" : "Non précisé"}</SelectItem>
                  {equipment.map((eq) => (
                    <SelectItem key={eq.id} value={eq.id}>
                      {eq.brand} {eq.model} · {EQUIPMENT_CATEGORY_LABEL[eq.category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <label htmlFor="int-billable" className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 sm:mt-6">
              <span className="text-sm">
                <span className="font-medium text-slate-900">Facturable</span>
                <span className="block text-xs text-muted-foreground">{form.is_billable ? "Sera proposée à la facturation" : "Garantie ou contrat : non facturée"}</span>
              </span>
              <Switch id="int-billable" checked={form.is_billable} onCheckedChange={(v) => set("is_billable", v)} />
            </label>
          </div>
        ) : null}

        {client ? (
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-900">Lieu d&apos;intervention</span>
              {!editSite ? (
                <button type="button" onClick={() => setEditSite(true)} className="flex items-center gap-1 text-xs font-medium text-primary">
                  <PencilIcon className="size-3" /> Modifier
                </button>
              ) : null}
            </div>
            {!editSite ? (
              <p className="mt-1 text-sm text-slate-600">
                {form.site_label ? `${form.site_label} — ` : ""}
                {form.address}, {form.postal_code} {form.city}
              </p>
            ) : (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DURATION.base, ease: EASE_OUT }} className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,2fr)_6.5rem_minmax(0,1fr)]">
                <Field label="Site / bâtiment" htmlFor="int-site" className="sm:col-span-3">
                  <Input id="int-site" value={form.site_label ?? ""} onChange={(e) => set("site_label", e.target.value)} placeholder="Ex. Résidence Les Tilleuls — bât. B" />
                </Field>
                <Field label="Adresse" htmlFor="int-address" error={errors.address}>
                  <Input id="int-address" value={form.address} onChange={(e) => set("address", e.target.value)} />
                </Field>
                <Field label="Code postal" htmlFor="int-cp" error={errors.postal_code}>
                  <Input id="int-cp" inputMode="numeric" value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} />
                </Field>
                <Field label="Ville" htmlFor="int-city" error={errors.city}>
                  <Input id="int-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
                </Field>
              </motion.div>
            )}
          </div>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button type="submit" data-testid="save-intervention">
          {intervention ? "Enregistrer" : "Créer l'intervention"}
        </Button>
      </SheetFooter>
    </form>
  );
}

/** Création (dépannage, entretien, SAV…) ou modification d'une intervention. */
export function InterventionFormSheet({
  open,
  onOpenChange,
  intervention,
  defaultClientId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intervention?: Intervention;
  defaultClientId?: string;
  onSaved?: (id: string, created: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:w-[min(36rem,100%)]">
        <SheetHeader>
          <SheetTitle>{intervention ? `Modifier ${intervention.reference}` : "Nouvelle intervention"}</SheetTitle>
          <SheetDescription>{intervention ? intervention.title : "Dépannage, entretien ou SAV : elle rejoint « À planifier »."}</SheetDescription>
        </SheetHeader>
        {open ? (
          <Form
            key={intervention?.id ?? defaultClientId ?? "new"}
            intervention={intervention}
            defaultClientId={defaultClientId}
            onDone={(id, created) => {
              onOpenChange(false);
              onSaved?.(id, created);
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
