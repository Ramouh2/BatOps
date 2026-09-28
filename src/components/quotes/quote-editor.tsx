"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  CircleDotIcon,
  FileTextIcon,
  ListPlusIcon,
  MapPinIcon,
  PencilIcon,
  PhoneIncomingIcon,
  RotateCcwIcon,
  SaveIcon,
  SendIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { BatopsData, CatalogItem, Client, DocumentLine, VatRate } from "@/types/batops";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedChoice } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Swap } from "@/components/motion/swap";
import { ClientAvatar } from "@/components/crm/client-avatar";
import { ClientFormSheet } from "@/components/crm/client-form-sheet";
import { CatalogItemSheet } from "@/components/catalog/catalog-item-sheet";
import { batopsStore } from "@/lib/store";
import { openQuoteRequest } from "@/lib/store/quote-selectors";
import { clientDisplayName } from "@/lib/domain/clients";
import { marginLevel } from "@/lib/domain/catalog";
import { formatDayMonth, formatEUR, formatNumber, formatPercent, formatVatRate } from "@/lib/domain/format";
import { CLIENT_STATUS, EQUIPMENT_CATEGORY_LABEL } from "@/lib/domain/labels";
import type { FieldErrors } from "@/lib/domain/validation";
import type { VatRecommendation } from "@/lib/domain/vat";
import type { MissingItemSuggestion } from "@/providers/ai/ai.provider";
import { DURATION, EASE_OUT, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { A4Paper } from "./a4-paper";
import { CatalogPicker } from "./catalog-picker";
import { ClientPicker } from "./client-picker";
import { DecimalInput } from "./decimal-input";
import { QuoteAIAssistant } from "./quote-ai-assistant";
import { QuoteDocument, type QuoteDocumentData } from "./quote-document";
import { QuoteLines } from "./quote-lines";
import { QuoteMissingItems } from "./quote-missing-items";
import { QuoteMargin, QuoteTotals } from "./quote-summary";
import type { QuoteEditor } from "./use-quote-editor";

function Card({ title, icon: Icon, children, className, action, id }: { title: string; icon?: typeof MapPinIcon; children: React.ReactNode; className?: string; action?: React.ReactNode; id?: string }) {
  return (
    <section id={id} className={cn("rounded-lg border bg-card p-4 shadow-xs sm:p-5", className)} aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {Icon ? <Icon className="size-4 text-slate-400" /> : null}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const QUICK_DEPOSITS = [0, 30, 40, 50];
const QUICK_VALIDITY = [15, 30, 60];

export interface QuoteEditorBodyProps {
  editor: QuoteEditor;
  data: BatopsData;
  client?: Client;
  /** Devis déjà enregistré (le client n'est alors plus modifiable). */
  saved: boolean;
  doc: QuoteDocumentData;
  errors: FieldErrors;
  showMargins: boolean;
  canEditPrice: boolean;
  canManageCatalog: boolean;
  defaultVat: VatRate;
  recommendation?: VatRecommendation;
  onSave: () => void;
  onSend: () => void;
}

export function QuoteEditorBody({
  editor,
  data,
  client,
  saved,
  doc,
  errors,
  showMargins,
  canEditPrice,
  canManageCatalog,
  defaultVat,
  recommendation,
  onSave,
  onSend,
}: QuoteEditorBodyProps) {
  const { input, totals, state } = editor;
  const [clientSheet, setClientSheet] = useState(false);
  const [catalogSheet, setCatalogSheet] = useState(false);
  const [editSite, setEditSite] = useState(false);

  const usage = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of data.quotes) for (const l of q.items) if (l.catalog_item_id) map.set(l.catalog_item_id, (map.get(l.catalog_item_id) ?? 0) + 1);
    return map;
  }, [data.quotes]);
  const equipment = client ? data.equipment.filter((e) => e.client_id === client.id) : [];
  const openCall = client ? data.calls.filter((c) => c.client_id === client.id && c.status !== "converti").sort((a, b) => b.created_at.localeCompare(a.created_at))[0] : undefined;
  const linkedCall = input.call_log_id ? data.calls.find((c) => c.id === input.call_log_id) : undefined;
  const lineVats = [...new Set(input.items.map((l) => l.vat_rate))];
  const commonVat = lineVats.length === 1 ? String(lineVats[0]) : "mixte";
  const level = marginLevel(totals.margin_percent, totals.margin_ht);

  const pickClient = (next: Client) => {
    editor.setField("client_id", next.id);
    editor.setField("site_address", next.address);
    editor.setField("site_postal_code", next.postal_code);
    editor.setField("site_city", next.city);
    editor.setField("equipment_id", undefined);
    editor.setField("call_log_id", openQuoteRequest(data, next.id)?.id);
  };

  const addFromCatalog = (item: CatalogItem) => {
    editor.addItem(item, defaultVat, 1);
  };

  const addSuggestion = (suggestion: MissingItemSuggestion) => {
    const item = data.catalog.find((c) => c.id === suggestion.catalog_item_id);
    if (!item) return;
    editor.addItem(item, defaultVat, suggestion.qty);
    toast.success(`${item.name} ajouté`, { description: `Oubli signalé par l'IA · ${formatEUR(item.selling_price_ht)} HT (prix catalogue)` });
  };

  const removeLine = (line: DocumentLine) => {
    const index = input.items.findIndex((l) => l.id === line.id);
    editor.removeLine(line.id);
    toast(`Ligne retirée`, {
      description: line.name,
      action: { label: "Annuler", onClick: () => editor.restoreLine(line, index) },
    });
  };

  const insertAi = (lines: DocumentLine[], reasons: Record<string, string>, meta: { title: string; callId?: string }) => {
    const count = editor.insertLines(lines, reasons, { title: meta.title });
    if (meta.callId) editor.setField("call_log_id", meta.callId);
    return count;
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
      <div className="min-w-0 space-y-5">
        {/* Client & chantier */}
        <Card title="Client & chantier" icon={MapPinIcon}>
          {!client ? (
            <div>
              <ClientPicker clients={data.clients} onPick={pickClient} onCreate={() => setClientSheet(true)} invalid={!!errors.client_id} />
              {errors.client_id ? (
                <p id="quote-client-error" role="alert" className="mt-1.5 text-xs font-medium text-rose-600">
                  {errors.client_id}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-muted-foreground">Le type de client et l&apos;âge du logement déterminent la TVA recommandée.</p>
              )}
            </div>
          ) : (
            <motion.div key={client.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DURATION.base, ease: EASE_OUT }} className="space-y-4">
              <div className="flex items-start gap-3">
                <ClientAvatar client={client} className="size-10" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                    <Link href={`/clients/${client.id}`} className="hover:text-primary">
                      {clientDisplayName(client)}
                    </Link>
                    {client.status === "prospect" ? <Badge tone={CLIENT_STATUS.prospect.tone}>Prospect</Badge> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {client.address}, {client.postal_code} {client.city} · {client.phone}
                  </p>
                </div>
                {!saved ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => editor.setField("client_id", "")}>
                    Changer
                  </Button>
                ) : null}
              </div>

              {openCall && !linkedCall ? (
                <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                  <PhoneIncomingIcon className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Demande du {formatDayMonth(openCall.created_at)} : {openCall.summary} <span className="font-medium">Utilisez-la dans l&apos;assistant IA ci-dessous.</span>
                  </span>
                </p>
              ) : null}
              {linkedCall ? (
                <p className="flex items-center gap-2 text-xs text-slate-600">
                  <PhoneIncomingIcon className="size-3.5 text-amber-600" />
                  Devis issu de la demande du {formatDayMonth(linkedCall.created_at)} (l&apos;appel passera en « converti »).
                  <button type="button" className="font-medium text-slate-500 underline-offset-2 hover:underline" onClick={() => editor.setField("call_log_id", undefined)}>
                    Délier
                  </button>
                </p>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Équipement concerné" htmlFor="quote-equipment" error={errors.equipment_id} hint={equipment.length === 0 ? "Aucun équipement dans le parc de ce client." : undefined}>
                  <Select value={input.equipment_id ?? "none"} onValueChange={(v) => editor.setField("equipment_id", v === "none" ? undefined : v)}>
                    <SelectTrigger id="quote-equipment" disabled={equipment.length === 0}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun (nouvelle installation)</SelectItem>
                      {equipment.map((eq) => (
                        <SelectItem key={eq.id} value={eq.id}>
                          {eq.brand} {eq.model} · {EQUIPMENT_CATEGORY_LABEL[eq.category]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-slate-900">Adresse du chantier</span>
                  {!editSite && !errors.site_address && !errors.site_postal_code && !errors.site_city ? (
                    <p className="flex h-9 items-center justify-between gap-2 rounded-md border border-dashed px-3 text-sm text-slate-700">
                      <span className="truncate">
                        {input.site_address === client.address && input.site_city === client.city ? "À l'adresse du client" : `${input.site_address}, ${input.site_city}`}
                      </span>
                      <button type="button" onClick={() => setEditSite(true)} className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
                        <PencilIcon className="size-3" /> Modifier
                      </button>
                    </p>
                  ) : null}
                </div>
              </div>
              <AnimatePresence initial={false}>
                {editSite || errors.site_address || errors.site_postal_code || errors.site_city ? (
                  <motion.div key="site" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="grid gap-3 pt-1 sm:grid-cols-[minmax(0,2fr)_7rem_minmax(0,1fr)]">
                      <Field label="Adresse" htmlFor="site-address" error={errors.site_address}>
                        <Input id="site-address" value={input.site_address} onChange={(e) => editor.setField("site_address", e.target.value)} />
                      </Field>
                      <Field label="Code postal" htmlFor="site-cp" error={errors.site_postal_code}>
                        <Input id="site-cp" inputMode="numeric" value={input.site_postal_code} onChange={(e) => editor.setField("site_postal_code", e.target.value)} />
                      </Field>
                      <Field label="Ville" htmlFor="site-city" error={errors.site_city}>
                        <Input id="site-city" value={input.site_city} onChange={(e) => editor.setField("site_city", e.target.value)} />
                      </Field>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          )}
        </Card>

        {/* Assistant IA */}
        <QuoteAIAssistant
          catalog={data.catalog}
          client={client}
          openCall={openCall}
          existingLines={input.items}
          showMargins={showMargins}
          onInsert={insertAi}
        />

        {/* Lignes */}
        <Card
          title="Lignes du devis"
          icon={ListPlusIcon}
          id="quote-lines-card"
          action={
            <span className="text-xs text-muted-foreground tabular">
              <Swap swapKey={input.items.length}>
                {input.items.length} ligne{input.items.length > 1 ? "s" : ""}
              </Swap>
            </span>
          }
        >
          <CatalogPicker
            catalog={data.catalog}
            usage={usage}
            showMargins={showMargins}
            onPick={addFromCatalog}
            onCreate={canManageCatalog ? () => setCatalogSheet(true) : undefined}
          />
          <div className="mt-3">
            {input.items.length === 0 ? (
              <EmptyState
                icon={FileTextIcon}
                className={cn("rounded-lg border border-dashed py-8", errors.items && "border-rose-300 bg-rose-50/40")}
                title={errors.items ?? "Aucune ligne pour l'instant"}
                description="Recherchez un article du catalogue ou décrivez les travaux à l'assistant IA."
              />
            ) : (
              <QuoteLines
                lines={input.items}
                catalog={data.catalog}
                reasons={state.reasons}
                freshIds={state.freshIds}
                errors={errors}
                canEditPrice={canEditPrice}
                showMargins={showMargins}
                onUpdate={editor.updateLine}
                onRemove={removeLine}
              />
            )}
          </div>
          <QuoteMissingItems lines={input.items} catalog={data.catalog} onAdd={addSuggestion} />
        </Card>

        <div className="grid gap-5 2xl:grid-cols-2">
          {/* Conditions commerciales */}
          <Card title="Remise, TVA & acompte" icon={CircleDotIcon}>
            <div className="space-y-4">
              <Field label="Remise commerciale" htmlFor="quote-discount" error={errors.discount}>
                <div className="flex items-center gap-2">
                  <SegmentedChoice<"percent" | "amount">
                    name="Type de remise"
                    value={state.discountMode}
                    onValueChange={(mode) => editor.setDiscount(mode, 0)}
                    options={[
                      { value: "percent", label: "%" },
                      { value: "amount", label: "€" },
                    ]}
                    className="w-24 shrink-0"
                  />
                  <DecimalInput
                    key={state.discountMode}
                    id="quote-discount"
                    value={state.discountMode === "percent" ? (input.discount_percent ?? 0) : input.discount_amount_ht}
                    onValueChange={(v) => editor.setDiscount(state.discountMode, v)}
                    allowZero
                    max={state.discountMode === "percent" ? 100 : undefined}
                    className="w-28 text-right"
                  />
                  <AnimatePresence initial={false}>
                    {totals.discount_amount_ht > 0 ? (
                      <motion.span initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-xs text-emerald-700 tabular">
                        − {formatEUR(totals.discount_amount_ht)} HT
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </div>
              </Field>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-900">TVA de toutes les lignes</span>
                <SegmentedChoice<string>
                  name="Taux de TVA des lignes"
                  value={commonVat}
                  onValueChange={(v) => editor.setVatAll(Number(v) as VatRate)}
                  options={[
                    { value: "5.5", label: "5,5 %" },
                    { value: "10", label: "10 %" },
                    { value: "20", label: "20 %" },
                  ]}
                />
                {recommendation ? (
                  <p className="text-xs text-muted-foreground">
                    {recommendation.reason}
                    {input.items.length > 0 && commonVat !== String(recommendation.rate) ? (
                      <>
                        {" "}
                        <button type="button" onClick={() => editor.setVatAll(recommendation.rate)} className="font-medium text-primary hover:underline">
                          Appliquer {formatVatRate(recommendation.rate)}
                        </button>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Acompte à la signature" htmlFor="quote-deposit" error={errors.deposit_percent}>
                  <div className="flex items-center gap-1.5">
                    <DecimalInput id="quote-deposit" value={input.deposit_percent} onValueChange={(v) => editor.setField("deposit_percent", v)} allowZero max={100} className="w-20 text-right" />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  <div className="mt-1 flex gap-1">
                    {QUICK_DEPOSITS.map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => editor.setField("deposit_percent", pct)}
                        className={cn("rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap transition-colors", input.deposit_percent === pct ? "border-primary bg-blue-50 text-primary" : "text-slate-500 hover:border-slate-300")}
                      >
                        {pct} %
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Validité" htmlFor="quote-validity" error={errors.validity_days}>
                  <div className="flex items-center gap-1.5">
                    <DecimalInput id="quote-validity" value={input.validity_days} onValueChange={(v) => editor.setField("validity_days", Math.round(v))} max={180} className="w-20 text-right" />
                    <span className="text-sm text-muted-foreground">jours</span>
                  </div>
                  <div className="mt-1 flex gap-1">
                    {QUICK_VALIDITY.map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => editor.setField("validity_days", days)}
                        className={cn("rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap transition-colors", input.validity_days === days ? "border-primary bg-blue-50 text-primary" : "text-slate-500 hover:border-slate-300")}
                      >
                        {days} j
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            </div>
          </Card>

          {/* Totaux & marge */}
          <Card title={showMargins ? "Totaux & rentabilité" : "Totaux"}>
            <QuoteTotals totals={totals} depositPercent={input.deposit_percent} />
            {showMargins ? (
              <div className="mt-4 border-t pt-4">
                <QuoteMargin totals={totals} />
              </div>
            ) : null}
          </Card>
        </div>

        {/* Notes & conditions */}
        <Card title="Précisions & conditions" icon={FileTextIcon}>
          <div className="space-y-4">
            <Field label="Précisions pour le client" htmlFor="quote-notes" hint="Imprimées sous les lignes (accès, délais, options…).">
              <Textarea id="quote-notes" rows={2} value={input.notes ?? ""} onChange={(e) => editor.setField("notes", e.target.value)} placeholder="Ex. Pose prévue sous 3 semaines après signature. Évacuation de l'ancien matériel incluse." />
            </Field>
            <Field
              label="Conditions"
              htmlFor="quote-conditions"
              hint={state.conditionsCustom ? "Conditions personnalisées." : "Générées automatiquement (acompte, TVA, validité)."}
            >
              <Textarea id="quote-conditions" rows={3} value={editor.conditions} onChange={(e) => editor.setConditions(e.target.value)} />
            </Field>
            <AnimatePresence initial={false}>
              {state.conditionsCustom ? (
                <motion.div key="reset" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Button type="button" variant="ghost" size="sm" onClick={() => editor.setConditions(null)}>
                    <RotateCcwIcon />
                    Rétablir les conditions automatiques
                  </Button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </Card>

        {/* Barre de synthèse collante : totaux, marge, enregistrement, envoi */}
        <div className="sticky bottom-3 z-20">
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...SPRING.layout, delay: 0.25 }}
            className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border bg-white/90 px-4 py-2.5 shadow-lg ring-1 ring-slate-900/5 backdrop-blur supports-[backdrop-filter]:bg-white/80"
            data-testid="quote-sticky-bar"
          >
            <dl className="flex flex-1 flex-wrap items-baseline gap-x-5 gap-y-1">
              <div>
                <dt className="text-[11px] text-muted-foreground">Total HT</dt>
                <dd className="text-sm font-semibold text-slate-900 tabular">
                  <AnimatedNumber value={totals.total_ht} format={formatEUR} countUp={false} duration={0.5} />
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">Total TTC</dt>
                <dd className="text-sm font-semibold text-slate-900 tabular" data-testid="sticky-ttc">
                  <AnimatedNumber value={totals.total_ttc} format={formatEUR} countUp={false} duration={0.5} />
                </dd>
              </div>
              {showMargins && totals.total_ht > 0 ? (
                <div>
                  <dt className="text-[11px] text-muted-foreground">Marge</dt>
                  <dd className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 tabular">
                    <AnimatedNumber value={totals.margin_percent} format={formatPercent} countUp={false} duration={0.5} />
                    <Badge tone={level.tone} className="text-[10px]">
                      <Swap swapKey={level.level}>{level.label}</Swap>
                    </Badge>
                  </dd>
                </div>
              ) : null}
            </dl>
            <span className="flex items-center gap-1.5 text-xs" aria-live="polite" data-testid="save-state">
              <Swap swapKey={editor.dirty ? "dirty" : saved ? "saved" : "new"}>
                {editor.dirty ? (
                  <span className="flex items-center gap-1.5 text-amber-700">
                    <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
                    Modifications non enregistrées
                  </span>
                ) : saved ? (
                  <span className="text-emerald-700">Enregistré</span>
                ) : (
                  <span className="text-muted-foreground">Nouveau devis</span>
                )}
              </Swap>
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onSave} data-testid="save-quote" disabled={saved && !editor.dirty}>
                <SaveIcon />
                Enregistrer
              </Button>
              <Button type="button" size="sm" onClick={onSend} data-testid="send-quote" className="group">
                <SendIcon className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                Envoyer au client
              </Button>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Aperçu A4 en direct */}
      <aside className="hidden xl:block" aria-label="Aperçu A4 en direct">
        <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-xl bg-slate-100/80 p-3 ring-1 ring-slate-200/70">
          <p className="mb-2 flex items-center justify-between px-1 text-xs font-medium text-slate-500">
            Aperçu en direct
            <span className="flex items-center gap-1 text-[11px] font-normal">
              <span className="size-1.5 rounded-full bg-emerald-500" /> synchronisé
            </span>
          </p>
          <A4Paper>
            <QuoteDocument doc={doc} organization={data.organization} client={client ?? placeholderClient(data)} equipment={data.equipment.find((e) => e.id === input.equipment_id)} />
          </A4Paper>
          <p className="mt-2 px-1 text-[11px] text-slate-400">
            {input.items.length} ligne{input.items.length > 1 ? "s" : ""} · TVA {lineVats.map((r) => formatVatRate(r)).join(" + ") || "—"} · {formatNumber(input.validity_days)} jours de validité
          </p>
        </div>
      </aside>

      <ClientFormSheet
        open={clientSheet}
        onOpenChange={setClientSheet}
        onSaved={(id) => {
          const created = batopsStore.getState().data?.clients.find((c) => c.id === id);
          if (created) pickClient(created);
        }}
      />
      <CatalogItemSheet
        open={catalogSheet}
        onOpenChange={setCatalogSheet}
        data={data}
        onSaved={(id) => {
          const item = batopsStore.getState().data?.catalog.find((c) => c.id === id);
          if (item) editor.addItem(item, defaultVat, 1);
        }}
      />
    </div>
  );
}

/** Client fictif pour l'aperçu tant qu'aucun client n'est choisi. */
function placeholderClient(data: BatopsData): Client {
  return {
    id: "",
    organization_id: data.organization.id,
    status: "prospect",
    type: "particulier",
    last_name: "Client à choisir",
    phone: "",
    address: "",
    postal_code: "",
    city: "",
    portal_token: "",
    created_at: data.seeded_at,
  };
}
