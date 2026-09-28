/**
 * Mutations du catalogue. Les devis et factures déjà émis conservent leurs prix (copiés dans leurs lignes) ;
 * tout nouveau chiffrage (éditeur, assistant IA) lit le catalogue du store et utilise immédiatement les nouveaux prix.
 */
import type { BatopsData, CatalogItem } from "@/types/batops";
import { createId } from "@/lib/domain/ids";
import { normalizeCatalogItemInput, type CatalogItemInput } from "@/lib/domain/validation";
import type { MutationContext } from "./context";

export interface CatalogItemUsage {
  quotes: number;
  invoices: number;
  interventions: number;
  contracts: number;
  total: number;
}

export function catalogItemUsage(
  data: Pick<BatopsData, "quotes" | "invoices" | "interventions" | "contracts">,
  itemId: string,
): CatalogItemUsage {
  const quotes = data.quotes.filter((q) => q.items.some((l) => l.catalog_item_id === itemId)).length;
  const invoices = data.invoices.filter((i) => i.items.some((l) => l.catalog_item_id === itemId)).length;
  const interventions = data.interventions.filter((i) => i.parts_used.some((p) => p.catalog_item_id === itemId)).length;
  const contracts = data.contracts.filter((c) => c.catalog_item_id === itemId).length;
  return { quotes, invoices, interventions, contracts, total: quotes + invoices + interventions + contracts };
}

export function createCatalogItem(draft: BatopsData, input: CatalogItemInput, ctx: MutationContext): string {
  const item: CatalogItem = {
    ...normalizeCatalogItemInput(input),
    id: createId("cat"),
    organization_id: draft.organization.id,
    is_active: true,
    created_at: ctx.now.toISOString(),
    updated_at: ctx.now.toISOString(),
  };
  draft.catalog.push(item);
  return item.id;
}

export interface PriceChange {
  buying_before: number;
  selling_before: number;
  buying_after: number;
  selling_after: number;
}

export function updateCatalogItem(
  draft: BatopsData,
  itemId: string,
  input: CatalogItemInput,
  ctx: MutationContext,
): PriceChange | null {
  const item = draft.catalog.find((c) => c.id === itemId);
  if (!item) return null;
  const clean = normalizeCatalogItemInput(input);
  const change: PriceChange = {
    buying_before: item.buying_price_ht,
    selling_before: item.selling_price_ht,
    buying_after: clean.buying_price_ht,
    selling_after: clean.selling_price_ht,
  };
  Object.assign(item, clean);
  // Les champs optionnels vidés doivent disparaître.
  if (!clean.description) delete item.description;
  if (!clean.supplier_name) delete item.supplier_name;
  item.updated_at = ctx.now.toISOString();
  return change;
}

export function setCatalogItemActive(draft: BatopsData, itemId: string, active: boolean, ctx: MutationContext): boolean {
  const item = draft.catalog.find((c) => c.id === itemId);
  if (!item || item.is_active === active) return false;
  item.is_active = active;
  item.updated_at = ctx.now.toISOString();
  return true;
}

/** Suppression définitive réservée aux articles jamais utilisés ; sinon, archiver. */
export function deleteCatalogItem(draft: BatopsData, itemId: string): boolean {
  const index = draft.catalog.findIndex((c) => c.id === itemId);
  if (index === -1 || catalogItemUsage(draft, itemId).total > 0) return false;
  draft.catalog.splice(index, 1);
  return true;
}
