"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogItem, DocumentLine, VatRate } from "@/types/batops";
import { lineTotal, round2, type DocumentTotals } from "@/lib/domain/money";
import {
  computeQuoteTotals,
  defaultQuoteConditions,
  lineFromCatalogItem,
  vatRatesOf,
  type DiscountMode,
} from "@/lib/domain/quotes";
import type { QuoteInput } from "@/lib/domain/validation";

/** Clé de comparaison : détecte les modifications non enregistrées. */
function fingerprint(input: QuoteInput): string {
  return JSON.stringify({
    ...input,
    items: input.items.map((l) => [l.catalog_item_id, round2(l.qty), round2(l.unit_price_ht), l.vat_rate, l.section]),
    conditions: input.conditions ?? "",
    notes: input.notes ?? "",
    equipment_id: input.equipment_id ?? "",
    call_log_id: input.call_log_id ?? "",
  });
}

export interface QuoteEditorState {
  input: QuoteInput;
  discountMode: DiscountMode;
  /** Conditions saisies à la main (sinon régénérées : acompte, TVA, validité). */
  conditionsCustom: boolean;
  /** Explications de l'IA par ligne insérée (non persistées). */
  reasons: Record<string, string>;
  /** Lignes ajoutées récemment (surbrillance). */
  freshIds: string[];
}

/** Conditions affichées : saisies à la main, sinon générées (acompte, TVA, validité). */
function resolveConditions(state: QuoteEditorState): string {
  return state.conditionsCustom
    ? (state.input.conditions ?? "")
    : defaultQuoteConditions({
        depositPercent: state.input.deposit_percent,
        vatRates: vatRatesOf(state.input.items),
        validityDays: state.input.validity_days,
      });
}

/** Empreinte d'un état « tel qu'il serait enregistré » (conditions résolues). */
function stateFingerprint(state: QuoteEditorState): string {
  return fingerprint({ ...state.input, conditions: resolveConditions(state) });
}

export function initialEditorState(input: QuoteInput): QuoteEditorState {
  const generated = defaultQuoteConditions({
    depositPercent: input.deposit_percent,
    vatRates: vatRatesOf(input.items),
    validityDays: input.validity_days,
  });
  return {
    input,
    discountMode: input.discount_percent !== undefined ? "percent" : "amount",
    conditionsCustom: !!input.conditions && input.conditions !== generated,
    reasons: {},
    freshIds: [],
  };
}

const markFresh = (s: QuoteEditorState, ids: string[]): string[] => [...s.freshIds.filter((id) => !ids.includes(id)), ...ids].slice(-12);

/** État de travail de l'éditeur de devis : rien n'est écrit dans le store avant « Enregistrer ». */
export function useQuoteEditor(initial: QuoteInput) {
  const [state, setState] = useState(() => initialEditorState(initial));
  const [baseline, setBaseline] = useState(() => stateFingerprint(initialEditorState(initial)));
  // Miroir synchrone de l'état : les gestionnaires calculent leur résultat avant la mise à jour.
  const current = useRef(state);
  useEffect(() => {
    current.current = state;
  }, [state]);
  const commit = useCallback((next: QuoteEditorState) => {
    current.current = next;
    setState(next);
  }, []);
  const update = useCallback((recipe: (s: QuoteEditorState) => QuoteEditorState) => commit(recipe(current.current)), [commit]);

  const conditions = resolveConditions(state);

  /** Saisie prête à enregistrer (conditions résolues). */
  const resolved: QuoteInput = useMemo(() => ({ ...state.input, conditions }), [state.input, conditions]);
  const totals: DocumentTotals = useMemo(() => computeQuoteTotals(state.input.items, state.input), [state.input]);
  const dirty = fingerprint(resolved) !== baseline;

  const setField = useCallback(<K extends keyof QuoteInput>(key: K, value: QuoteInput[K]) => {
    update((s) => ({ ...s, input: { ...s.input, [key]: value } }));
  }, [update]);


  /** Ajoute un article du catalogue (ou +1 sur la ligne existante). Retourne l'id de la ligne. */
  const addItem = useCallback(
    (item: CatalogItem, vatRate: VatRate, qty = 1): string => {
      const s = current.current;
      const existing = s.input.items.find((l) => l.catalog_item_id === item.id);
      if (existing) {
        const items = s.input.items.map((l) =>
          l.id === existing.id ? { ...l, qty: round2(l.qty + qty), total_ht: lineTotal(l.qty + qty, l.unit_price_ht) } : l,
        );
        commit({ ...s, input: { ...s.input, items }, freshIds: markFresh(s, [existing.id]) });
        return existing.id;
      }
      const line = lineFromCatalogItem(item, qty, vatRate);
      commit({ ...s, input: { ...s.input, items: [...s.input.items, line] }, freshIds: markFresh(s, [line.id]) });
      return line.id;
    },
    [commit],
  );

  /** Insère les lignes proposées par l'IA (déjà au prix catalogue) ; les articles déjà présents sont conservés. */
  const insertLines = useCallback(
    (lines: DocumentLine[], reasons: Record<string, string>, meta?: { title?: string }): number => {
      const s = current.current;
      const present = new Set(s.input.items.map((l) => l.catalog_item_id));
      const additions = lines.filter((l) => !present.has(l.catalog_item_id));
      commit({
        ...s,
        input: {
          ...s.input,
          title: s.input.title.trim() ? s.input.title : (meta?.title ?? s.input.title),
          items: [...s.input.items, ...additions],
          ai_generated: s.input.ai_generated || additions.length > 0,
        },
        reasons: { ...s.reasons, ...Object.fromEntries(additions.map((l) => [l.id, reasons[l.id] ?? ""])) },
        freshIds: markFresh(s, additions.map((l) => l.id)),
      });
      return additions.length;
    },
    [commit],
  );

  const updateLine = useCallback((lineId: string, patch: Partial<Pick<DocumentLine, "qty" | "unit_price_ht" | "vat_rate">>) => {
    update((s) => ({
      ...s,
      input: {
        ...s.input,
        items: s.input.items.map((l) => {
          if (l.id !== lineId) return l;
          const next = { ...l, ...patch };
          // Un prix ajusté à la main n'est plus une proposition de l'IA.
          if (patch.unit_price_ht !== undefined && patch.unit_price_ht !== l.unit_price_ht) next.ai_suggested = undefined;
          return { ...next, total_ht: lineTotal(next.qty, next.unit_price_ht) };
        }),
      },
    }));
  }, [update]);

  const removeLine = useCallback((lineId: string) => {
    update((s) => ({ ...s, input: { ...s.input, items: s.input.items.filter((l) => l.id !== lineId) } }));
  }, [update]);

  /** Annulation d'un retrait : la ligne revient à sa place. */
  const restoreLine = useCallback(
    (line: DocumentLine, index: number) => {
      update((s) => {
        if (s.input.items.some((l) => l.id === line.id)) return s;
        const items = [...s.input.items];
        items.splice(Math.min(index, items.length), 0, line);
        return { ...s, input: { ...s.input, items }, freshIds: markFresh(s, [line.id]) };
      });
    },
    [update],
  );

  const setVatAll = useCallback((rate: VatRate) => {
    update((s) => ({ ...s, input: { ...s.input, items: s.input.items.map((l) => ({ ...l, vat_rate: rate })) } }));
  }, [update]);

  const setDiscount = useCallback((mode: DiscountMode, value: number) => {
    update((s) => ({
      ...s,
      discountMode: mode,
      input:
        mode === "percent"
          ? { ...s.input, discount_percent: value, discount_amount_ht: 0 }
          : { ...s.input, discount_percent: undefined, discount_amount_ht: value },
    }));
  }, [update]);

  const setConditions = useCallback((text: string | null) => {
    update((s) =>
      text === null
        ? { ...s, conditionsCustom: false, input: { ...s.input, conditions: undefined } }
        : { ...s, conditionsCustom: true, input: { ...s.input, conditions: text } },
    );
  }, [update]);

  /** Après enregistrement : la version courante devient la référence. */
  const markSaved = useCallback((saved: QuoteInput) => setBaseline(fingerprint(saved)), []);

  /** Recharge un devis (ex. après enregistrement ou changement de version dans un autre onglet). */
  const reset = useCallback(
    (input: QuoteInput) => {
      const next = initialEditorState(input);
      commit(next);
      setBaseline(stateFingerprint(next));
    },
    [commit],
  );

  return {
    state,
    input: state.input,
    resolved,
    conditions,
    totals,
    dirty,
    setField,
    addItem,
    insertLines,
    updateLine,
    removeLine,
    restoreLine,
    setVatAll,
    setDiscount,
    setConditions,
    markSaved,
    reset,
  };
}

export type QuoteEditor = ReturnType<typeof useQuoteEditor>;
