import type { TranscriptTurn } from "@/types/batops";
import type { CallExtraction } from "@/providers/ai/ai.provider";
import type { ProviderMode } from "@/providers/types";

/** Étape de qualification en cours (la question que Nora vient de poser). */
export type NoraStep = "need" | "name" | "address" | "phone" | "slot" | "done";

export interface NoraCallState {
  step: NoraStep;
  transcript: TranscriptTurn[];
  extraction: CallExtraction;
  /** Créneau proposé par Nora, en attente d'acceptation. */
  proposed_slot?: string;
  done: boolean;
}

export interface NoraContext {
  orgName: string;
  /** Créneaux libres présentés par Nora (calculés depuis le planning par l'appelant). */
  availableSlots: string[];
}

/**
 * Standard vocal. V0 : conversation simulée dans le navigateur (voix via Web Speech API côté UI).
 * V2 : LiveVoiceProvider branché sur la téléphonie réelle, même interface.
 */
export interface VoiceProvider {
  readonly mode: ProviderMode;
  startCall(context: NoraContext): NoraCallState;
  processTurn(state: NoraCallState, callerText: string, context: NoraContext): Promise<NoraCallState>;
}
