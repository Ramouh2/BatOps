import type { DocumentLine } from "@/types/batops";
import { wait } from "@/providers/types";
import type { AIProvider, CallExtraction, MissingItemSuggestion, QuoteDraft, QuoteDraftContext } from "./ai.provider";
import { extractCallData } from "./call-extraction";
import { buildQuoteDraft, findMissingItems } from "./quote-engine";
import { rewriteReportText } from "./report-engine";

/**
 * IA de démonstration, 100 % locale et gratuite : moteur de règles métier CVC / plomberie français.
 * Même interface que le futur LiveAIProvider (Gemini) : l'UI ne changera pas.
 */
export class MockAIProvider implements AIProvider {
  readonly mode = "mock" as const;

  constructor(private readonly latencyMs = 0) {}

  async generateQuoteDraft(prompt: string, context: QuoteDraftContext): Promise<QuoteDraft> {
    await wait(this.latencyMs);
    return buildQuoteDraft(prompt, context);
  }

  async detectMissingItems(
    lines: Pick<DocumentLine, "catalog_item_id">[],
    context: QuoteDraftContext & { prompt?: string },
  ): Promise<MissingItemSuggestion[]> {
    return findMissingItems(lines, context.catalog, context.prompt);
  }

  async rewriteReport(rawNotes: string): Promise<string> {
    await wait(this.latencyMs);
    return rewriteReportText(rawNotes);
  }

  async analyzeCall(text: string): Promise<CallExtraction> {
    await wait(this.latencyMs);
    return extractCallData(text);
  }
}
