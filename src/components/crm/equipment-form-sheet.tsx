"use client";

import { useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import type { Equipment, EquipmentCategory, RefrigerantType } from "@/types/batops";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useFeedback } from "@/components/motion/use-flash";
import { useActions } from "@/lib/store";
import { EQUIPMENT_CATEGORY_LABEL } from "@/lib/domain/labels";
import { parseISODate, toISODate } from "@/lib/domain/dates";
import {
  hasErrors,
  REFRIGERANT_CATEGORIES,
  validateEquipmentInput,
  type EquipmentField,
  type EquipmentInput,
} from "@/lib/domain/validation";
import { DURATION, EASE_OUT } from "@/lib/motion";

const CATEGORIES = Object.keys(EQUIPMENT_CATEGORY_LABEL) as EquipmentCategory[];
const REFRIGERANTS: RefrigerantType[] = ["R32", "R410A", "R290"];

function toInput(equipment?: Equipment): EquipmentInput {
  return {
    category: equipment?.category ?? "climatisation",
    brand: equipment?.brand ?? "",
    model: equipment?.model ?? "",
    serial_number: equipment?.serial_number ?? "",
    refrigerant_type: equipment?.refrigerant_type ?? (equipment ? undefined : "R32"),
    installation_date: equipment?.installation_date ?? "",
    warranty_end_date: equipment?.warranty_end_date ?? "",
    location_in_property: equipment?.location_in_property ?? "",
    notes: equipment?.notes ?? "",
  };
}

function plusYears(isoDate: string, years: number): string {
  const date = parseISODate(isoDate);
  date.setFullYear(date.getFullYear() + years);
  return toISODate(date);
}

function EquipmentForm({ clientId, equipment, onDone }: { clientId: string; equipment?: Equipment; onDone: () => void }) {
  const [form, setForm] = useState<EquipmentInput>(() => toInput(equipment));
  const [submitted, setSubmitted] = useState(false);
  const { addEquipment, updateEquipment } = useActions();
  const { scope, shake } = useFeedback<HTMLFormElement>();
  const errors = submitted ? validateEquipmentInput(form) : {};
  const hasRefrigerant = REFRIGERANT_CATEGORIES.includes(form.category);

  const set = <K extends keyof EquipmentInput>(key: K, value: EquipmentInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const invalid = (key: EquipmentField) => (errors[key] ? { "aria-invalid": true, "aria-describedby": `eq-${key}-error` } : {});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const found = validateEquipmentInput(form);
    if (hasErrors(found)) {
      shake();
      const first = (["brand", "model", "warranty_end_date"] as EquipmentField[]).find((k) => found[k]);
      if (first) document.getElementById(`eq-${first}`)?.focus();
      return;
    }
    const result = equipment ? updateEquipment(equipment.id, form) : addEquipment(clientId, form);
    if (!result.ok) return shake();
    toast.success(equipment ? "Équipement mis à jour" : "Équipement ajouté au parc", {
      description: `${EQUIPMENT_CATEGORY_LABEL[form.category]} ${form.brand} ${form.model}`,
    });
    onDone();
  };

  return (
    <form ref={scope} onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody className="space-y-5">
        <Field label="Catégorie" htmlFor="eq-category" required>
          <Select value={form.category} onValueChange={(v) => set("category", v as EquipmentCategory)}>
            <SelectTrigger id="eq-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {EQUIPMENT_CATEGORY_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Marque" htmlFor="eq-brand" error={errors.brand} required>
            <Input id="eq-brand" value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Daikin" {...invalid("brand")} />
          </Field>
          <Field label="Modèle" htmlFor="eq-model" error={errors.model} required>
            <Input id="eq-model" value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="Perfera FTXM35R" {...invalid("model")} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="N° de série" htmlFor="eq-serial">
            <Input id="eq-serial" value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} className="font-mono" />
          </Field>
          <AnimatePresence initial={false} mode="popLayout">
            {hasRefrigerant ? (
              <motion.div
                key="refrigerant"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1, transition: { duration: DURATION.base, ease: EASE_OUT } }}
                exit={{ opacity: 0, scale: 0.97, transition: { duration: DURATION.fast } }}
              >
                <Field label="Fluide frigorigène" htmlFor="eq-refrigerant">
                  <Select value={form.refrigerant_type ?? "none"} onValueChange={(v) => set("refrigerant_type", v === "none" ? undefined : (v as RefrigerantType))}>
                    <SelectTrigger id="eq-refrigerant">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Non renseigné</SelectItem>
                      {REFRIGERANTS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date de pose" htmlFor="eq-installation">
            <Input id="eq-installation" type="date" value={form.installation_date} onChange={(e) => set("installation_date", e.target.value)} />
          </Field>
          <Field
            label="Fin de garantie"
            htmlFor="eq-warranty_end_date"
            error={errors.warranty_end_date}
            hint={
              form.installation_date ? (
                <span className="flex gap-1.5">
                  {[2, 3, 5].map((years) => (
                    <button
                      key={years}
                      type="button"
                      className="rounded border bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
                      onClick={() => set("warranty_end_date", plusYears(form.installation_date!, years))}
                    >
                      + {years} ans
                    </button>
                  ))}
                </span>
              ) : undefined
            }
          >
            <Input
              id="eq-warranty_end_date"
              type="date"
              value={form.warranty_end_date}
              onChange={(e) => set("warranty_end_date", e.target.value)}
              {...invalid("warranty_end_date")}
            />
          </Field>
        </div>
        <Field label="Emplacement" htmlFor="eq-location">
          <Input id="eq-location" value={form.location_in_property} onChange={(e) => set("location_in_property", e.target.value)} placeholder="Salon, sous-sol, façade sud…" />
        </Field>
        <Field label="Notes" htmlFor="eq-notes">
          <Textarea id="eq-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </SheetBody>
      <SheetFooter>
        <Button type="submit">{equipment ? "Enregistrer" : "Ajouter au parc"}</Button>
      </SheetFooter>
    </form>
  );
}

export function EquipmentFormSheet({
  open,
  onOpenChange,
  clientId,
  clientName,
  equipment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  equipment?: Equipment;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{equipment ? "Modifier l'équipement" : "Ajouter un équipement"}</SheetTitle>
          <SheetDescription>Parc installé de {clientName}</SheetDescription>
        </SheetHeader>
        {open ? <EquipmentForm key={equipment?.id ?? "new"} clientId={clientId} equipment={equipment} onDone={() => onOpenChange(false)} /> : null}
      </SheetContent>
    </Sheet>
  );
}
