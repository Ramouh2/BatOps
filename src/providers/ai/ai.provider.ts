import type {
  CallIntent,
  CatalogItem,
  ClientType,
  DocumentLine,
  Urgency,
  VatRate,
} from "@/types/batops";
import type { ProviderMode } from "@/providers/types";

export interface QuoteDraftContext {
  /** Catalogue de l'entreprise : SEULE source de prix autorisée. */
  catalog: CatalogItem[];
  clientType?: ClientType;
  /** Logement achevé depuis plus de 2 ans (TVA réduite). */
  housingOver2Years?: boolean;
}

export interface MissingItemSuggestion {
  rule_id: string;
  catalog_item_id: string;
  reference: string;
  name: string;
  reason: string;
  qty: number;
  /** Prix issu du catalogue (jamais inventé). */
  unit_price_ht: number;
}

export interface QuoteDraft {
  title: string;
  vat_rate: VatRate;
  vat_reason: string;
  /** Lignes marquées `ai_suggested`, prix copiés du catalogue. */
  lines: DocumentLine[];
  /** Explication de chaque ligne proposée (clé : `line.id`). */
  reasons: Record<string, string>;
  /** Éléments compris dans la demande (équipement, puissance, prestations), affichés pendant l'analyse. */
  detected: string[];
  suggestions: MissingItemSuggestion[];
  /** Points à vérifier (quantités estimées, articles absents du catalogue…). */
  warnings: string[];
}

export interface CallExtraction {
  caller_name?: string;
  caller_phone?: string;
  caller_address?: string;
  caller_postal_code?: string;
  caller_city?: string;
  equipment_mentioned?: string;
  need?: string;
  urgency: Urgency;
  intent: CallIntent;
  preferred_slot?: string;
}

export interface AIProvider {
  readonly mode: ProviderMode;
  /** Text-to-Quote : brouillon structuré à partir d'une note libre et du catalogue. */
  generateQuoteDraft(prompt: string, context: QuoteDraftContext): Promise<QuoteDraft>;
  /** Détection d'oublis techniques sur des lignes existantes (règles métier CVC / plomberie). */
  detectMissingItems(lines: Pick<DocumentLine, "catalog_item_id">[], context: QuoteDraftContext & { prompt?: string }): Promise<MissingItemSuggestion[]>;
  /** Reformule des notes terrain télégraphiques en compte-rendu professionnel, sans inventer de faits. */
  rewriteReport(rawNotes: string): Promise<string>;
  /** Extrait les informations structurées d'un appel ou d'un message client. */
  analyzeCall(text: string): Promise<CallExtraction>;
}
