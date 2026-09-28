/**
 * Nora V0 — réceptionniste IA simulée, déterministe et gratuite.
 * Pose les questions de qualification (besoin, nom, adresse, téléphone, créneau) jusqu'à obtenir
 * une fiche complète, prête à créer le prospect et l'intervention.
 */
import type { TranscriptTurn } from "@/types/batops";
import type { CallExtraction } from "@/providers/ai/ai.provider";
import { extractAddress, extractCallData, extractPhone, extractSlot } from "@/providers/ai/call-extraction";
import { capitalize, normalize } from "@/providers/text";
import { wait } from "@/providers/types";
import type { NoraCallState, NoraContext, NoraStep, VoiceProvider } from "./voice.provider";

const ACCEPT = /\b(oui|ok|d'accord|parfait|ca me va|ça me va|tres bien|très bien|volontiers|entendu|c'est bon)\b/i;

function merge(previous: CallExtraction, next: CallExtraction): CallExtraction {
  return {
    caller_name: previous.caller_name ?? next.caller_name,
    caller_phone: previous.caller_phone ?? next.caller_phone,
    caller_address: previous.caller_address ?? next.caller_address,
    caller_postal_code: previous.caller_postal_code ?? next.caller_postal_code,
    caller_city: previous.caller_city ?? next.caller_city,
    equipment_mentioned: next.equipment_mentioned ?? previous.equipment_mentioned,
    need: previous.need ?? next.need,
    urgency: next.urgency,
    intent: next.intent,
    preferred_slot: previous.preferred_slot ?? next.preferred_slot,
  };
}

function cleanAnswer(text: string): string {
  return text
    .replace(/^(?:c'est|je suis|je m'appelle|mon nom est|oui|alors)[,\s]+/iu, "")
    .replace(/[.!?]+$/u, "")
    .trim();
}

/** Réponse à la question posée : on l'interprète dans le contexte de cette question. */
function applyContextualAnswer(step: NoraStep, text: string, extraction: CallExtraction, proposedSlot?: string): CallExtraction {
  const next = { ...extraction };
  switch (step) {
    case "name":
      if (!next.caller_name) {
        const answer = cleanAnswer(text);
        if (answer && answer.split(/\s+/).length <= 5 && !/\d/.test(answer)) {
          next.caller_name = answer.replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, letter: string) => sep + letter.toUpperCase());
        }
      }
      break;
    case "address":
      if (!next.caller_address) {
        const found = extractAddress(text);
        next.caller_address = found.caller_address ?? (/\d/.test(text) ? cleanAnswer(text) : undefined);
        next.caller_postal_code = next.caller_postal_code ?? found.caller_postal_code;
        next.caller_city = next.caller_city ?? found.caller_city;
      }
      break;
    case "phone":
      next.caller_phone = next.caller_phone ?? extractPhone(text);
      break;
    case "slot":
      if (!next.preferred_slot) {
        next.preferred_slot = ACCEPT.test(text) && proposedSlot ? proposedSlot : (extractSlot(text) ?? capitalize(cleanAnswer(text)));
      }
      break;
    default:
      break;
  }
  return next;
}

function nextStep(extraction: CallExtraction): NoraStep {
  if (!extraction.need && extraction.intent === "information") return "need";
  if (!extraction.caller_name) return "name";
  if (!extraction.caller_address) return "address";
  if (!extraction.caller_phone) return "phone";
  if (!extraction.preferred_slot) return "slot";
  return "done";
}

function question(step: NoraStep, extraction: CallExtraction, ctx: NoraContext, firstQuestion: boolean): { text: string; proposed?: string } {
  const lead =
    firstQuestion && extraction.intent === "depannage"
      ? extraction.urgency === "urgente"
        ? "Je comprends, c'est une urgence : je vous fais passer en priorité. "
        : "Je comprends, nous allons organiser une intervention. "
      : firstQuestion && extraction.intent === "devis_installation"
        ? "Avec plaisir, nous allons préparer votre devis. "
        : firstQuestion && extraction.intent === "entretien"
          ? "Très bien, je planifie votre visite d'entretien. "
          : "";
  const lastName = extraction.caller_name?.split(" (")[0];
  switch (step) {
    case "need":
      return { text: "Pouvez-vous me décrire votre besoin ou la panne constatée ?" };
    case "name":
      return { text: `${lead}Puis-je avoir votre nom, s'il vous plaît ?` };
    case "address":
      return { text: `${lead}${lastName ? `Merci ${lastName}. ` : ""}Quelle est l'adresse de l'intervention ?` };
    case "phone":
      return { text: `${lead}À quel numéro pouvons-nous vous rappeler ?` };
    case "slot": {
      const proposed = ctx.availableSlots[0];
      const visit = extraction.intent === "devis_installation" ? "pour la visite technique" : "";
      return proposed
        ? { text: `${lead}Je peux vous proposer ${proposed}${visit ? ` ${visit}` : ""}. Cela vous convient-il ?`, proposed }
        : { text: `${lead}Quelles sont vos disponibilités${visit ? ` ${visit}` : ""} ?` };
    }
    default:
      return { text: "" };
  }
}

function closing(extraction: CallExtraction, ctx: NoraContext): string {
  const where = [extraction.caller_address, extraction.caller_city].filter(Boolean).join(", ");
  const what = extraction.need ? extraction.need.charAt(0).toLowerCase() + extraction.need.slice(1) : "votre demande";
  return `C'est noté : ${what}${where ? `, au ${where}` : ""}. Créneau retenu : ${extraction.preferred_slot?.toLowerCase()}. ${ctx.orgName} vous envoie une confirmation par SMS. Bonne journée !`;
}

export class MockVoiceProvider implements VoiceProvider {
  readonly mode = "mock" as const;

  constructor(private readonly latencyMs = 0) {}

  startCall(context: NoraContext): NoraCallState {
    return {
      step: "need",
      transcript: [
        {
          speaker: "nora",
          text: `Bonjour, ${context.orgName}, je suis Nora, l'assistante de l'entreprise. Que puis-je faire pour vous ?`,
        },
      ],
      extraction: { urgency: "normale", intent: "information" },
      done: false,
    };
  }

  async processTurn(state: NoraCallState, callerText: string, context: NoraContext): Promise<NoraCallState> {
    await wait(this.latencyMs);
    if (state.done || !callerText.trim()) return state;

    const transcript: TranscriptTurn[] = [...state.transcript, { speaker: "caller", text: callerText.trim() }];
    const callerSpeech = transcript.filter((t) => t.speaker === "caller").map((t) => t.text).join("\n");

    let extraction = merge(state.extraction, extractCallData(callerSpeech));
    extraction = applyContextualAnswer(state.step, callerText, extraction, state.proposed_slot);
    if (state.step === "need" && !extraction.need && normalize(callerText).length > 0) {
      extraction.need = capitalize(cleanAnswer(callerText));
    }

    const step = nextStep(extraction);
    if (step === "done") {
      return {
        step,
        transcript: [...transcript, { speaker: "nora", text: closing(extraction, context) }],
        extraction,
        done: true,
      };
    }
    const firstQuestion = !state.transcript.some((t, index) => t.speaker === "nora" && index > 0);
    const q = question(step, extraction, context, firstQuestion);
    return {
      step,
      transcript: [...transcript, { speaker: "nora", text: q.text }],
      extraction,
      proposed_slot: q.proposed ?? state.proposed_slot,
      done: false,
    };
  }
}
