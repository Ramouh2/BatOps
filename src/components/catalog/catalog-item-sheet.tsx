"use client";

import { useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { InfoIcon, PackageCheckIcon, WandSparklesIcon } from "lucide-react";
import { toast } from "sonner";
import type { BatopsData, CatalogCategory, CatalogItem, CatalogUnit, VatRate } from "@/types/batops";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Swap } from "@/components/motion/swap";
import { useFeedback } from "@/components/motion/use-flash";
import { useActions } from "@/lib/store";
import { catalogItemUsage } from "@/lib/store/actions/catalog";
import { marginLevel } from "@/lib/domain/catalog";
import { CATALOG_CATEGORY_LABEL, EQUIPMENT_CATEGORY_LABEL, UNIT_LABEL } from "@/lib/domain/labels";
import { formatEUR, formatPercent, formatVatRate } from "@/lib/domain/format";
import { catalogMargin, round2 } from "@/lib/domain/money";
import { hasErrors, parseDecimal, validateCatalogItemInput, type CatalogField, type CatalogItemInput } from "@/lib/domain/validation";
import { DURATION, EASE_OUT } from "@/lib/motion";

const CATEGORIES = Object.keys(CATALOG_CATEGORY_LABEL) as CatalogCategory[];
const UNITS = Object.keys(UNIT_LABEL) as CatalogUnit[];
const VAT_RATES: VatRate[] = [5.5, 10, 20];
const TARGET_MARGIN = 40;

interface Draft {
  reference: string;
  name: string;
  description: string;
  category: CatalogCategory;
  unit: CatalogUnit;
  vat_rate: VatRate;
  supplier_name: string;
  buying: string;
  selling: string;
}

const toText = (n: number) => String(n).replace(".", ",");

function toDraft(item?: CatalogItem): Draft {
  return {
    reference: item?.reference ?? "",
    name: item?.name ?? "",
    description: item?.description ?? "",
    category: item?.category ?? "fourniture",
    unit: item?.unit ?? "u",
    vat_rate: item?.vat_rate ?? 10,
    supplier_name: item?.supplier_name ?? "",
    buying: item ? toText(item.buying_price_ht) : "",
    selling: item ? toText(item.selling_price_ht) : "",
  };
}

function toInput(draft: Draft): CatalogItemInput {
  return {
    reference: draft.reference,
    name: draft.name,
    description: draft.description,
    category: draft.category,
    unit: draft.unit,
    vat_rate: draft.vat_rate,
    supplier_name: draft.supplier_name,
    buying_price_ht: parseDecimal(draft.buying) ?? Number.NaN,
    selling_price_ht: parseDecimal(draft.selling) ?? Number.NaN,
  };
}

function ItemForm({ item, data, onDone }: { item?: CatalogItem; data: BatopsData; onDone: (id: string) => void }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(item));
  const [submitted, setSubmitted] = useState(false);
  const { createCatalogItem, updateCatalogItem } = useActions();
  const { scope, shake } = useFeedback<HTMLFormElement>();
  const input = toInput(draft);
  const errors = submitted ? validateCatalogItemInput(input, data.catalog, item?.id) : {};
  const usage = item ? catalogItemUsage(data, item.id) : null;

  const pricesValid = Number.isFinite(input.buying_price_ht) && Number.isFinite(input.selling_price_ht);
  const margin = pricesValid ? catalogMargin(input) : null;
  const level = margin ? marginLevel(margin.margin_percent, margin.margin_ht) : null;
  const suggested = Number.isFinite(input.buying_price_ht) && input.buying_price_ht > 0 ? round2(input.buying_price_ht / (1 - TARGET_MARGIN / 100)) : null;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const invalid = (key: CatalogField) => (errors[key] ? { "aria-invalid": true, "aria-describedby": `cat-${key}-error` } : {});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const found = validateCatalogItemInput(input, data.catalog, item?.id);
    if (hasErrors(found)) {
      shake();
      const first = (["reference", "name", "buying_price_ht", "selling_price_ht"] as CatalogField[]).find((k) => found[k]);
      if (first) document.getElementById(`cat-${first}`)?.focus();
      return;
    }
    if (item) {
      const before = catalogMargin(item).margin_percent;
      const result = updateCatalogItem(item.id, input);
      if (!result.ok) return shake();
      const after = catalogMargin(input).margin_percent;
      toast.success("Article mis à jour", {
        description: before !== after ? `Marge ${formatPercent(before)} → ${formatPercent(after)}` : input.name,
      });
      onDone(item.id);
      return;
    }
    const result = createCatalogItem(input);
    if (!result.ok) return shake();
    toast.success("Article ajouté au catalogue", { description: `${input.reference.toUpperCase()} · ${input.name}` });
    onDone(result.value);
  };

  return (
    <form ref={scope} onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <Field label="Référence" htmlFor="cat-reference" error={errors.reference} required>
            <Input
              id="cat-reference"
              value={draft.reference}
              onChange={(e) => set("reference", e.target.value.toUpperCase())}
              className="font-mono uppercase"
              placeholder="ACC-XXX"
              {...invalid("reference")}
            />
          </Field>
          <Field label="Désignation" htmlFor="cat-name" error={errors.name} required>
            <Input id="cat-name" value={draft.name} onChange={(e) => set("name", e.target.value)} {...invalid("name")} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Type" htmlFor="cat-category">
            <Select value={draft.category} onValueChange={(v) => set("category", v as CatalogCategory)}>
              <SelectTrigger id="cat-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATALOG_CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Unité" htmlFor="cat-unit">
            <Select value={draft.unit} onValueChange={(v) => set("unit", v as CatalogUnit)}>
              <SelectTrigger id="cat-unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {UNIT_LABEL[u]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="TVA par défaut" htmlFor="cat-vat">
            <Select value={String(draft.vat_rate)} onValueChange={(v) => set("vat_rate", Number(v) as VatRate)}>
              <SelectTrigger id="cat-vat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VAT_RATES.map((r) => (
                  <SelectItem key={r} value={String(r)}>
                    {formatVatRate(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prix d'achat HT (€)" htmlFor="cat-buying_price_ht" error={errors.buying_price_ht} required>
            <Input
              id="cat-buying_price_ht"
              inputMode="decimal"
              value={draft.buying}
              onChange={(e) => set("buying", e.target.value)}
              className="text-right tabular"
              {...invalid("buying_price_ht")}
            />
          </Field>
          <Field label="Prix de vente HT (€)" htmlFor="cat-selling_price_ht" error={errors.selling_price_ht} required>
            <Input
              id="cat-selling_price_ht"
              inputMode="decimal"
              value={draft.selling}
              onChange={(e) => set("selling", e.target.value)}
              className="text-right tabular"
              {...invalid("selling_price_ht")}
            />
          </Field>
        </div>

        <motion.div layout className="rounded-lg border bg-slate-50/70 p-4" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Marge calculée</p>
            {level ? (
              <Badge tone={level.tone}>
                <Swap swapKey={level.level}>{level.label}</Swap>
              </Badge>
            ) : null}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {margin ? (
              <motion.dl
                key="margin"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DURATION.fast, ease: EASE_OUT }}
                className="mt-3 grid grid-cols-3 gap-3"
              >
                <div>
                  <dt className="text-xs text-muted-foreground">Marge HT</dt>
                  <dd className="text-lg font-semibold text-slate-900">
                    <AnimatedNumber value={margin.margin_ht} format={formatEUR} countUp={false} duration={0.5} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Taux de marque</dt>
                  <dd className="text-lg font-semibold text-slate-900">
                    <AnimatedNumber value={margin.margin_percent} format={formatPercent} countUp={false} duration={0.5} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Coefficient</dt>
                  <dd className="text-lg font-semibold text-slate-900">
                    ×<AnimatedNumber value={margin.coefficient} format={(v) => v.toFixed(2).replace(".", ",")} countUp={false} duration={0.5} />
                  </dd>
                </div>
              </motion.dl>
            ) : (
              <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-2 text-sm text-muted-foreground">
                Saisissez les prix d&apos;achat et de vente pour voir la marge.
              </motion.p>
            )}
          </AnimatePresence>
          {suggested !== null && margin && margin.margin_percent < TARGET_MARGIN ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-3 -ml-2 text-primary hover:text-primary"
              onClick={() => set("selling", toText(suggested))}
            >
              <WandSparklesIcon />
              Appliquer {formatEUR(suggested)} HT pour {TARGET_MARGIN} % de marge
            </Button>
          ) : null}
        </motion.div>

        <Field label="Fournisseur" htmlFor="cat-supplier">
          <Input id="cat-supplier" value={draft.supplier_name} onChange={(e) => set("supplier_name", e.target.value)} placeholder="Daikin, CEDEO, Rexel…" />
        </Field>
        <Field label="Description (reprise sur les devis)" htmlFor="cat-description">
          <Textarea id="cat-description" rows={2} value={draft.description} onChange={(e) => set("description", e.target.value)} />
        </Field>

        {item?.equipment_template ? (
          <p className="flex gap-2 rounded-lg border px-3 py-2.5 text-sm text-slate-600">
            <PackageCheckIcon className="mt-0.5 size-4 shrink-0 text-slate-400" />
            Une fois l&apos;installation payée, crée l&apos;équipement « {EQUIPMENT_CATEGORY_LABEL[item.equipment_template.category]}{" "}
            {item.equipment_template.brand} {item.equipment_template.model} » dans le parc du client (garantie {item.equipment_template.warranty_years} ans).
          </p>
        ) : null}
        {usage ? (
          <p className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5 text-sm text-blue-900">
            <InfoIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              {usage.total > 0
                ? `Présent dans ${usage.quotes} devis, ${usage.invoices} facture(s), ${usage.interventions} intervention(s) et ${usage.contracts} contrat(s). `
                : "Pas encore utilisé. "}
              Les documents déjà émis gardent leur prix ; tout nouveau devis utilisera ce tarif immédiatement.
            </span>
          </p>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button type="submit">{item ? "Enregistrer" : "Ajouter au catalogue"}</Button>
      </SheetFooter>
    </form>
  );
}

export function CatalogItemSheet({
  open,
  onOpenChange,
  item,
  data,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: CatalogItem;
  data: BatopsData;
  onSaved?: (id: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{item ? "Modifier l'article" : "Nouvel article"}</SheetTitle>
          <SheetDescription>{item ? `${item.reference} · ${item.name}` : "Prestation, fourniture, forfait ou contrat de votre bibliothèque de prix."}</SheetDescription>
        </SheetHeader>
        {open ? (
          <ItemForm
            key={item?.id ?? "new"}
            item={item}
            data={data}
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
