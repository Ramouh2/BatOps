"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CheckIcon,
  CornerDownLeftIcon,
  Loader2Icon,
  PhoneIncomingIcon,
  PlusIcon,
  RotateCcwIcon,
  SparklesIcon,
  TriangleAlertIcon,
  WandSparklesIcon,
} from "lucide-react";
import type { CallLog, CatalogItem, Client, DocumentLine } from "@/types/batops";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { SuccessCheck } from "@/components/motion/success-check";
import { Swap } from "@/components/motion/swap";
import { useFeedback } from "@/components/motion/use-flash";
import { marginLevel } from "@/lib/domain/catalog";
import { formatDayMonth, formatEUR, formatNumber, formatPercent, formatVatRate } from "@/lib/domain/format";
import { UNIT_LABEL } from "@/lib/domain/labels";
import { computeTotals, lineTotal } from "@/lib/domain/money";
import { lineFromCatalogItem } from "@/lib/domain/quotes";
import { getAIProvider } from "@/providers";
import type { MissingItemSuggestion, QuoteDraft } from "@/providers/ai/ai.provider";
import { DURATION, EASE_OUT, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { DecimalInput } from "./decimal-input";

const EXAMPLES = [
  "Installation PAC air/eau 8kW avec désembouage et mise en service",
  "Climatisation mono-split 3,5 kW dans la chambre, 6 m de liaisons sous goulotte",
  "Remplacement du chauffe-eau électrique par un chauffe-eau thermodynamique 200 L",
];

const STEPS = [
  "Lecture de la demande",
  "Recherche dans votre catalogue",
  "Quantités et main-d'œuvre",
  "Contrôle des oublis techniques",
  "Choix du taux de TVA",
];
const STEP_MS = 230;

type Phase = "idle" | "analyzing" | "results" | "inserted";

interface Proposal {
  line: DocumentLine;
  selected: boolean;
  reason: string;
  /** Article déjà présent dans le devis. */
  present: boolean;
  fromSuggestion?: boolean;
}

/**
 * Assistant devis IA : description → analyse (étapes animées) → propositions expliquées → sélection et
 * quantités modifiables → marge calculée → insertion dans le devis. Tous les prix viennent du catalogue.
 */
export function QuoteAIAssistant({
  catalog,
  client,
  openCall,
  existingLines,
  showMargins,
  onInsert,
}: {
  catalog: CatalogItem[];
  client?: Pick<Client, "type" | "housing_over_2_years">;
  openCall?: CallLog;
  existingLines: DocumentLine[];
  showMargins: boolean;
  onInsert: (lines: DocumentLine[], reasons: Record<string, string>, meta: { title: string; callId?: string }) => number;
}) {
  const [prompt, setPrompt] = useState("");
  const [callId, setCallId] = useState<string | undefined>();
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<QuoteDraft | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [pending, setPending] = useState<MissingItemSuggestion[]>([]);
  const [insertedCount, setInsertedCount] = useState(0);
  const runId = useRef(0);
  const { scope, shake } = useFeedback<HTMLDivElement>();
  const activeCount = catalog.filter((c) => c.is_active).length;

  // Une analyse abandonnée (nouvelle analyse, démontage) ne doit plus modifier l'état.
  useEffect(() => () => void (runId.current += 1), []);

  const analyze = async () => {
    const text = prompt.trim();
    if (!text) {
      shake();
      return;
    }
    const id = ++runId.current;
    setPhase("analyzing");
    setStep(0);
    setDraft(null);
    const timer = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length)), STEP_MS);
    const [result] = await Promise.all([
      getAIProvider().generateQuoteDraft(text, { catalog, clientType: client?.type, housingOver2Years: client?.housing_over_2_years }),
      new Promise((resolve) => window.setTimeout(resolve, STEP_MS * STEPS.length + 80)),
    ]);
    window.clearInterval(timer);
    if (id !== runId.current) return;
    const present = new Set(existingLines.map((l) => l.catalog_item_id));
    setDraft(result);
    setStep(STEPS.length);
    setProposals(
      result.lines.map((line) => ({
        line,
        reason: result.reasons[line.id] ?? "",
        present: present.has(line.catalog_item_id),
        selected: !present.has(line.catalog_item_id),
      })),
    );
    setPending(result.suggestions.filter((s) => !present.has(s.catalog_item_id)));
    setPhase("results");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void analyze();
    }
  };

  const acceptSuggestion = (suggestion: MissingItemSuggestion) => {
    const item = catalog.find((c) => c.id === suggestion.catalog_item_id);
    if (!item || !draft) return;
    const line = lineFromCatalogItem(item, suggestion.qty, draft.vat_rate, true);
    setProposals((list) => [...list, { line, reason: suggestion.reason, present: false, selected: true, fromSuggestion: true }]);
    setPending((list) => list.filter((s) => s.rule_id !== suggestion.rule_id));
  };

  const selected = proposals.filter((p) => p.selected);
  const selectionTotals = useMemo(() => computeTotals(selected.map((p) => p.line)), [selected]);
  const level = marginLevel(selectionTotals.margin_percent, selectionTotals.margin_ht);

  const insert = () => {
    if (!draft || selected.length === 0) return;
    const lines = selected.map((p) => ({ ...p.line, ai_suggested: true, total_ht: lineTotal(p.line.qty, p.line.unit_price_ht) }));
    const reasons = Object.fromEntries(selected.map((p) => [p.line.id, p.reason]));
    const count = onInsert(lines, reasons, { title: draft.title, callId });
    setInsertedCount(count);
    setPhase("inserted");
  };

  const reset = () => {
    runId.current += 1;
    setPhase("idle");
    setDraft(null);
    setProposals([]);
    setPending([]);
  };

  return (
    <section
      ref={scope}
      className={cn(
        "relative overflow-hidden rounded-lg border bg-card shadow-xs transition-colors duration-300",
        phase === "analyzing" ? "border-amber-300" : "border-amber-200/80",
      )}
      aria-labelledby="ai-assistant-title"
      data-testid="ai-assistant"
      data-phase={phase}
    >
      {/* Bandeau d'activité pendant l'analyse */}
      <AnimatePresence>
        {phase === "analyzing" ? (
          <motion.div key="bar" className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-amber-100" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-amber-500 to-transparent"
              animate={{ x: ["-100%", "300%"] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex items-start gap-3 bg-gradient-to-b from-amber-50/80 to-transparent px-4 pt-4 pb-3 sm:px-5">
        <motion.span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-sm"
          animate={phase === "analyzing" ? { rotate: [0, -8, 8, 0], scale: [1, 1.06, 1] } : { rotate: 0, scale: 1 }}
          transition={phase === "analyzing" ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" } : SPRING.pop}
        >
          <SparklesIcon className="size-4.5" />
        </motion.span>
        <div className="min-w-0 flex-1">
          <h2 id="ai-assistant-title" className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
            Assistant devis IA
            <Badge tone="ai" className="text-[10px]">
              Local · 0 €
            </Badge>
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Décrivez les travaux : l&apos;IA propose les lignes de votre catalogue ({activeCount} articles) et explique chaque choix.{" "}
            <span className="font-medium text-slate-800">Aucun prix n&apos;est inventé.</span>
          </p>
        </div>
      </div>

      <div className="px-4 pb-4 sm:px-5">
        <AnimatePresence mode="wait" initial={false}>
          {phase === "idle" ? (
            <motion.div key="idle" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: DURATION.base, ease: EASE_OUT }}>
              <label htmlFor="ai-prompt" className="sr-only">
                Description des travaux
              </label>
              <div className="rounded-lg border bg-white transition-shadow focus-within:border-amber-300 focus-within:ring-[3px] focus-within:ring-amber-200/60">
                <Textarea
                  id="ai-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={2}
                  placeholder="Ex. Installation PAC air/eau 8 kW avec désembouage et mise en service"
                  className="min-h-16 resize-none border-0 shadow-none focus-visible:ring-0"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed px-2.5 py-2">
                  <p className="hidden text-[11px] text-muted-foreground sm:block">
                    <kbd className="rounded border bg-slate-50 px-1 font-mono text-[10px]">Ctrl</kbd> +{" "}
                    <kbd className="rounded border bg-slate-50 px-1 font-mono text-[10px]">Entrée</kbd> pour analyser
                  </p>
                  <Button type="button" variant="ai" size="sm" onClick={() => void analyze()} disabled={!prompt.trim()} className="ml-auto">
                    <WandSparklesIcon />
                    Analyser la demande
                  </Button>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {openCall ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPrompt(openCall.summary);
                      setCallId(openCall.id);
                    }}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-900 transition-colors hover:bg-amber-100"
                  >
                    <PhoneIncomingIcon className="size-3 shrink-0" />
                    <span className="truncate">Demande du {formatDayMonth(openCall.created_at)} : {openCall.summary}</span>
                  </button>
                ) : null}
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => {
                      setPrompt(example);
                      setCallId(undefined);
                    }}
                    className="max-w-full truncate rounded-full border bg-white px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </motion.div>
          ) : null}

          {phase === "analyzing" ? (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: DURATION.base, ease: EASE_OUT }}
              aria-live="polite"
            >
              <p className="mb-3 line-clamp-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700 italic">« {prompt.trim()} »</p>
              <ol className="space-y-1.5" data-testid="ai-steps">
                {STEPS.map((label, index) => {
                  const state = index < step ? "done" : index === step ? "active" : "todo";
                  return (
                    <motion.li
                      key={label}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: state === "todo" ? 0.45 : 1, x: 0 }}
                      transition={{ duration: DURATION.base, ease: EASE_OUT, delay: index * 0.04 }}
                      className="flex items-center gap-2.5 text-sm"
                    >
                      <span className="flex size-5 items-center justify-center">
                        {state === "done" ? (
                          <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={SPRING.pop} className="flex size-5 items-center justify-center rounded-full bg-amber-500 text-white">
                            <CheckIcon className="size-3" strokeWidth={3} />
                          </motion.span>
                        ) : state === "active" ? (
                          <Loader2Icon className="size-4 animate-spin text-amber-600" />
                        ) : (
                          <span className="size-1.5 rounded-full bg-slate-300" />
                        )}
                      </span>
                      <span className={cn(state === "active" ? "font-medium text-slate-900" : "text-slate-600")}>
                        {label}
                        {index === 1 ? <span className="text-slate-400"> ({activeCount} articles)</span> : null}
                      </span>
                    </motion.li>
                  );
                })}
              </ol>
              <div className="mt-4 space-y-2" aria-hidden="true">
                {[0.9, 0.75, 0.82].map((w, i) => (
                  <div key={i} className="relative h-8 overflow-hidden rounded-md bg-amber-50/70" style={{ width: `${w * 100}%` }}>
                    <div className="skeleton-shimmer absolute inset-0" />
                  </div>
                ))}
              </div>
            </motion.div>
          ) : null}

          {phase === "results" && draft ? (
            <motion.div key="results" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: DURATION.base, ease: EASE_OUT }}>
              {/* Ce que l'IA a compris */}
              {draft.detected.length > 0 ? (
                <motion.div className="mb-3 flex flex-wrap items-center gap-1.5" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}>
                  <span className="text-xs text-muted-foreground">Compris :</span>
                  {draft.detected.map((term) => (
                    <motion.span
                      key={term}
                      variants={{ hidden: { opacity: 0, scale: 0.85 }, show: { opacity: 1, scale: 1, transition: SPRING.pop } }}
                      className="rounded-full bg-amber-100/70 px-2 py-0.5 text-xs font-medium text-amber-900"
                    >
                      {term}
                    </motion.span>
                  ))}
                </motion.div>
              ) : null}

              <div className="rounded-lg border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50/60 px-3 py-2">
                  <p className="min-w-0 text-sm font-medium text-slate-900">{draft.title}</p>
                  <Badge tone="info" title={draft.vat_reason}>
                    TVA {formatVatRate(draft.vat_rate)}
                  </Badge>
                </div>
                {proposals.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">Aucune ligne proposée : précisez la demande ou ajoutez les lignes depuis le catalogue.</p>
                ) : (
                  <motion.ul layout className="divide-y" data-testid="ai-proposals">
                    <AnimatePresence initial={true}>
                      {proposals.map((proposal, index) => (
                        <motion.li
                          key={proposal.line.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: DURATION.slow, ease: EASE_OUT, delay: proposal.fromSuggestion ? 0 : index * 0.07 }}
                          className={cn("flex gap-3 px-3 py-2.5 transition-colors", proposal.fromSuggestion && "bg-emerald-50/50", !proposal.selected && "bg-slate-50/60")}
                          data-testid="ai-proposal"
                        >
                          <Checkbox
                            tone="ai"
                            className="mt-0.5"
                            checked={proposal.selected}
                            onCheckedChange={(checked) => setProposals((list) => list.map((p) => (p.line.id === proposal.line.id ? { ...p, selected: checked } : p)))}
                            aria-label={`Garder ${proposal.line.name}`}
                          />
                          <div className={cn("min-w-0 flex-1 transition-opacity", !proposal.selected && "opacity-55")}>
                            <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate-900">
                              {proposal.line.name}
                              {proposal.present ? <Badge className="text-[10px]">déjà dans le devis</Badge> : null}
                              {proposal.fromSuggestion ? (
                                <Badge tone="success" className="text-[10px]">
                                  <CheckIcon /> oubli ajouté
                                </Badge>
                              ) : null}
                            </p>
                            <p className="mt-0.5 flex gap-1 text-xs text-slate-600">
                              <SparklesIcon className="mt-0.5 size-3 shrink-0 text-amber-500" />
                              <span>{proposal.reason}</span>
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span className="sr-only">Quantité — {proposal.line.name}</span>
                              <DecimalInput
                                value={proposal.line.qty}
                                onValueChange={(qty) =>
                                  setProposals((list) =>
                                    list.map((p) => (p.line.id === proposal.line.id ? { ...p, line: { ...p.line, qty, total_ht: lineTotal(qty, p.line.unit_price_ht) } } : p)),
                                  )
                                }
                                max={10_000}
                                className="h-7 w-14 px-1.5 text-right text-xs"
                              />
                              {UNIT_LABEL[proposal.line.unit]} × {formatEUR(proposal.line.unit_price_ht)}
                            </label>
                            <span className="text-sm font-semibold text-slate-900 tabular">
                              <AnimatedNumber value={proposal.line.total_ht} format={formatEUR} countUp={false} duration={0.35} />
                            </span>
                          </div>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </motion.ul>
                )}
              </div>

              {/* Avertissements : quantités estimées, articles absents… */}
              {draft.warnings.length > 0 ? (
                <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: proposals.length * 0.07 + 0.1 }} className="mt-3 space-y-1.5">
                  {draft.warnings.map((warning) => (
                    <li key={warning} className="flex gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                      <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
                      {warning}
                    </li>
                  ))}
                </motion.ul>
              ) : null}

              {/* Oublis possibles, à valider un par un */}
              <AnimatePresence initial={true}>
                {pending.length > 0 ? (
                  <motion.div
                    key="pending"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: DURATION.slow, ease: EASE_OUT, delay: proposals.length * 0.07 + 0.2 }}
                    className="mt-3 overflow-hidden"
                  >
                    <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">Oublis possibles</p>
                    <ul className="space-y-1.5" data-testid="ai-suggestions">
                      <AnimatePresence initial={false} mode="popLayout">
                        {pending.map((suggestion) => (
                          <motion.li
                            key={suggestion.rule_id}
                            layout
                            exit={{ opacity: 0, x: 24, transition: { duration: DURATION.base } }}
                            className="flex items-center gap-3 rounded-md border border-dashed px-3 py-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-900">{suggestion.name}</p>
                              <p className="text-xs text-slate-600">{suggestion.reason}</p>
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground tabular">
                              {formatNumber(suggestion.qty)} × {formatEUR(suggestion.unit_price_ht)}
                            </span>
                            <Button type="button" size="sm" variant="outline" onClick={() => acceptSuggestion(suggestion)} aria-label={`Ajouter ${suggestion.name} à la proposition`}>
                              <PlusIcon />
                              Ajouter
                            </Button>
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </ul>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {/* Calcul de la sélection → insertion */}
              <div className="mt-4 flex flex-col gap-3 rounded-lg bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Sélection ({selected.length})</dt>
                    <dd className="font-semibold text-slate-900 tabular">
                      <AnimatedNumber value={selectionTotals.total_ht} format={formatEUR} countUp={false} duration={0.45} /> HT
                    </dd>
                  </div>
                  {showMargins && selected.length > 0 ? (
                    <div data-testid="ai-margin">
                      <dt className="text-xs text-muted-foreground">Marge estimée</dt>
                      <dd className="flex items-center gap-2 font-semibold text-slate-900 tabular">
                        <AnimatedNumber value={selectionTotals.margin_percent} format={formatPercent} countUp={false} duration={0.45} />
                        <Badge tone={level.tone} className="text-[10px]">
                          <Swap swapKey={level.level}>{level.label}</Swap>
                        </Badge>
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={reset}>
                    <RotateCcwIcon />
                    Recommencer
                  </Button>
                  <Button type="button" variant="ai" size="sm" onClick={insert} disabled={selected.length === 0} data-testid="ai-insert">
                    <CornerDownLeftIcon />
                    Insérer {selected.length} ligne{selected.length > 1 ? "s" : ""}
                  </Button>
                </div>
              </div>
            </motion.div>
          ) : null}

          {phase === "inserted" ? (
            <motion.div
              key="inserted"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={SPRING.pop}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-50/70 px-3 py-2.5"
              role="status"
            >
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                <SuccessCheck className="size-5" />
                {insertedCount > 0
                  ? `${insertedCount} ligne${insertedCount > 1 ? "s" : ""} ajoutée${insertedCount > 1 ? "s" : ""} au devis, au prix du catalogue.`
                  : "Ces articles étaient déjà dans le devis."}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => { setPrompt(""); reset(); }}>
                <SparklesIcon />
                Nouvelle analyse
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}
