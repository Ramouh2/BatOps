"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import type { Civility, Client, ClientSource, ClientType } from "@/types/batops";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedChoice } from "@/components/ui/segmented";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useFeedback } from "@/components/motion/use-flash";
import { useActions } from "@/lib/store";
import { clientDisplayName } from "@/lib/domain/clients";
import { CLIENT_SOURCE_LABEL } from "@/lib/domain/labels";
import { hasErrors, validateClientInput, type ClientField, type ClientInput } from "@/lib/domain/validation";
import { DURATION, EASE_OUT } from "@/lib/motion";

const CIVILITIES: Civility[] = ["M.", "Mme", "M. et Mme"];
const SOURCES = Object.keys(CLIENT_SOURCE_LABEL) as ClientSource[];
const FIELD_ORDER: ClientField[] = ["company_name", "last_name", "phone", "email", "address", "postal_code", "city"];

function emptyInput(status: ClientInput["status"]): ClientInput {
  return {
    status,
    type: "particulier",
    last_name: "",
    first_name: "",
    company_name: "",
    email: "",
    phone: "",
    address: "",
    postal_code: "",
    city: "",
    access_notes: "",
    notes: "",
    source: "telephone",
    housing_over_2_years: true,
  };
}

function fromClient(client: Client): ClientInput {
  return {
    status: client.status,
    type: client.type,
    civility: client.civility,
    first_name: client.first_name ?? "",
    last_name: client.last_name,
    company_name: client.company_name ?? "",
    email: client.email ?? "",
    phone: client.phone,
    address: client.address,
    postal_code: client.postal_code,
    city: client.city,
    access_notes: client.access_notes ?? "",
    notes: client.notes ?? "",
    source: client.source,
    housing_over_2_years: client.housing_over_2_years ?? true,
  };
}

const collapse = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto", transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { opacity: 0, height: 0, transition: { duration: DURATION.fast } },
};

function ClientForm({
  client,
  defaultStatus,
  onDone,
}: {
  client?: Client;
  defaultStatus: ClientInput["status"];
  onDone: (clientId: string) => void;
}) {
  const [form, setForm] = useState<ClientInput>(() => (client ? fromClient(client) : emptyInput(defaultStatus)));
  const [submitted, setSubmitted] = useState(false);
  const { createClient, updateClient } = useActions();
  const { scope, shake } = useFeedback<HTMLFormElement>();
  const router = useRouter();
  const errors = submitted ? validateClientInput(form) : {};
  const isCompany = form.type !== "particulier";

  const set = <K extends keyof ClientInput>(key: K, value: ClientInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const invalid = (key: ClientField) => (errors[key] ? { "aria-invalid": true, "aria-describedby": `client-${key}-error` } : {});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const found = validateClientInput(form);
    if (hasErrors(found)) {
      shake();
      const first = FIELD_ORDER.find((key) => found[key]);
      if (first) document.getElementById(`client-${first}`)?.focus();
      return;
    }
    if (client) {
      const result = updateClient(client.id, form);
      if (!result.ok) return shake();
      toast.success(result.value.length ? "Fiche mise à jour" : "Aucune modification", {
        description: result.value.length ? `${result.value.join(", ")}.` : undefined,
      });
      onDone(client.id);
      return;
    }
    const result = createClient(form);
    if (!result.ok) return shake();
    const name = clientDisplayName({ ...form, company_name: isCompany ? form.company_name : undefined });
    toast.success(form.status === "prospect" ? "Prospect créé" : "Client créé", {
      description: name,
      action: { label: "Ouvrir la fiche", onClick: () => router.push(`/clients/${result.value}`) },
    });
    onDone(result.value);
  };

  return (
    <form ref={scope} onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody className="space-y-5">
        {!client ? (
          <Field label="Statut" htmlFor="client-status">
            <SegmentedChoice
              name="Statut"
              value={form.status}
              onValueChange={(v) => set("status", v)}
              options={[
                { value: "prospect", label: "Prospect" },
                { value: "client", label: "Client" },
              ]}
            />
          </Field>
        ) : null}
        <Field label="Type" htmlFor="client-type" required>
          <SegmentedChoice
            name="Type de client"
            value={form.type}
            onValueChange={(v: ClientType) => set("type", v)}
            options={[
              { value: "particulier", label: "Particulier" },
              { value: "professionnel", label: "Pro" },
              { value: "syndic", label: "Syndic" },
            ]}
          />
        </Field>

        <AnimatePresence initial={false}>
          {isCompany ? (
            <motion.div key="company" {...collapse} className="overflow-hidden">
              <Field label={form.type === "syndic" ? "Nom du syndic" : "Raison sociale"} htmlFor="client-company_name" error={errors.company_name} required>
                <Input
                  id="client-company_name"
                  value={form.company_name}
                  onChange={(e) => set("company_name", e.target.value)}
                  placeholder={form.type === "syndic" ? "Syndic Lorraine Habitat" : "Restaurant Le Bellevue"}
                  {...invalid("company_name")}
                />
              </Field>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="grid gap-3 sm:grid-cols-[7.5rem_1fr_1fr]">
          <Field label="Civilité" htmlFor="client-civility">
            <Select value={form.civility ?? "none"} onValueChange={(v) => set("civility", v === "none" ? undefined : (v as Civility))}>
              <SelectTrigger id="client-civility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {CIVILITIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Prénom" htmlFor="client-first_name">
            <Input id="client-first_name" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} autoComplete="off" />
          </Field>
          <Field label={isCompany ? "Nom du contact" : "Nom"} htmlFor="client-last_name" error={errors.last_name} required={!isCompany}>
            <Input id="client-last_name" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} autoComplete="off" {...invalid("last_name")} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Téléphone" htmlFor="client-phone" error={errors.phone} required>
            <Input
              id="client-phone"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="06 42 18 99 10"
              className="tabular"
              {...invalid("phone")}
            />
          </Field>
          <Field label="E-mail" htmlFor="client-email" error={errors.email}>
            <Input id="client-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} {...invalid("email")} />
          </Field>
        </div>

        <Field label="Adresse" htmlFor="client-address" error={errors.address} required>
          <Input id="client-address" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="14 rue des Jardins" {...invalid("address")} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <Field label="Code postal" htmlFor="client-postal_code" error={errors.postal_code} required>
            <Input
              id="client-postal_code"
              inputMode="numeric"
              maxLength={5}
              value={form.postal_code}
              onChange={(e) => set("postal_code", e.target.value.replace(/\D/g, ""))}
              className="tabular"
              {...invalid("postal_code")}
            />
          </Field>
          <Field label="Ville" htmlFor="client-city" error={errors.city} required>
            <Input id="client-city" value={form.city} onChange={(e) => set("city", e.target.value)} {...invalid("city")} />
          </Field>
        </div>

        <AnimatePresence initial={false}>
          {!isCompany ? (
            <motion.div key="housing" {...collapse} className="overflow-hidden">
              <label htmlFor="client-housing" className="flex items-center justify-between gap-4 rounded-lg border bg-slate-50/60 px-3 py-2.5">
                <span>
                  <span className="block text-sm font-medium text-slate-700">Logement de plus de 2 ans</span>
                  <span className="block text-xs text-muted-foreground">Ouvre droit à la TVA réduite (10 % ou 5,5 %).</span>
                </span>
                <Switch id="client-housing" checked={form.housing_over_2_years ?? false} onCheckedChange={(v) => set("housing_over_2_years", v)} />
              </label>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <Field label="Source" htmlFor="client-source">
          <Select value={form.source ?? "telephone"} onValueChange={(v) => set("source", v as ClientSource)}>
            <SelectTrigger id="client-source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCES.map((s) => (
                <SelectItem key={s} value={s}>
                  {CLIENT_SOURCE_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Accès chantier" htmlFor="client-access_notes" hint="Digicode, étage, gardien, animaux…">
          <Textarea id="client-access_notes" rows={2} value={form.access_notes} onChange={(e) => set("access_notes", e.target.value)} />
        </Field>
        <Field label={form.status === "prospect" && !client ? "Besoin exprimé" : "Notes"} htmlFor="client-notes">
          <Textarea
            id="client-notes"
            rows={3}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder={form.status === "prospect" ? "Ex. devis clim réversible pour le salon" : undefined}
          />
        </Field>
      </SheetBody>
      <SheetFooter>
        <Button type="submit">{client ? "Enregistrer" : form.status === "prospect" ? "Créer le prospect" : "Créer le client"}</Button>
      </SheetFooter>
    </form>
  );
}

/** Création (4 champs obligatoires) ou modification d'une fiche client / prospect. */
export function ClientFormSheet({
  open,
  onOpenChange,
  client,
  defaultStatus = "prospect",
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client;
  defaultStatus?: ClientInput["status"];
  onSaved?: (clientId: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{client ? "Modifier la fiche" : "Nouveau client ou prospect"}</SheetTitle>
          <SheetDescription>
            {client ? clientDisplayName(client) : "Nom, téléphone, adresse et type suffisent : le reste peut attendre."}
          </SheetDescription>
        </SheetHeader>
        {open ? (
          <ClientForm
            key={client?.id ?? "new"}
            client={client}
            defaultStatus={defaultStatus}
            onDone={(id) => {
              onOpenChange(false);
              onSaved?.(id);
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
