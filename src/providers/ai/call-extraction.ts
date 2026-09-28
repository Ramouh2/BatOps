/**
 * Extraction déterministe des informations d'un appel ou d'un message client (MockAIProvider / Nora V0).
 * Uniquement ce qui est explicitement dit : un champ absent reste vide.
 */
import type { CallIntent, Urgency } from "@/types/batops";
import { formatPhone } from "@/lib/domain/format";
import { capitalize, normalize } from "@/providers/text";
import type { CallExtraction } from "./ai.provider";

const UPPER = "A-ZÀ-ÖØ-Ý";
const WORD = "[\\p{L}'’-]+";
const NAME = `[${UPPER}]${WORD}(?:\\s+[${UPPER}]${WORD}){0,2}`;
const CITY = `[${UPPER}]${WORD}(?:[\\s-]+(?:[${UPPER}]${WORD}|lès|les|sur|sous|en|de|du|la|le))*`;

const NOT_A_NAME = /^(?:Bonjour|Bonsoir|Allô|Allo|Oui|Non|Merci|Madame|Monsieur|Plutôt|Environ|Au|En|Le|La|Les)\b/u;

const BRANDS = ["Daikin", "Atlantic", "Mitsubishi", "Fujitsu", "Toshiba", "Panasonic", "Samsung", "Hitachi", "Viessmann", "De Dietrich", "Saunier Duval", "Thermor", "Aldes", "Frico"];

const EQUIPMENT_KINDS: [RegExp, string][] = [
  [/pompe a chaleur air.?eau|pac air.?eau/, "Pompe à chaleur air/eau"],
  [/pompe a chaleur|\bpac\b/, "Pompe à chaleur"],
  [/gainable/, "Climatisation gainable"],
  [/(tri|bi|multi)[\s-]?split/, "Climatisation multi-split"],
  [/clim|climatisation|climatiseur|split/, "Climatisation"],
  [/chauffe[\s-]?eau thermo|ballon thermo/, "Chauffe-eau thermodynamique"],
  [/chauffe[\s-]?eau|ballon/, "Chauffe-eau"],
  [/chaudiere/, "Chaudière"],
  [/\bvmc\b|ventilation/, "VMC"],
  [/rideau d.?air/, "Rideau d'air"],
  [/tableau electrique|disjoncteur/, "Installation électrique"],
];

export function detectIntent(normalized: string): CallIntent {
  if (/panne|fuite|\bfuit\b|ne (marche|fonctionne|chauffe|refroidit) plus|plus d'eau chaude|plus de chauffage|bruit|\bcoule\b|code erreur|en erreur|\bhs\b/.test(normalized)) {
    return "depannage";
  }
  if (/devis|install|remplacer|remplacement|projet|\bposer\b|\bpose\b/.test(normalized)) return "devis_installation";
  if (/entretien|revision|contrat|visite annuelle/.test(normalized)) return "entretien";
  return "information";
}

export function detectUrgency(normalized: string, intent: CallIntent): Urgency {
  if (/urgent|urgence|plus d'eau chaude|plus de chauffage|inond|degat des eaux|coule partout/.test(normalized)) return "urgente";
  if (intent === "depannage") return "haute";
  return "normale";
}

export function extractPhone(text: string): string | undefined {
  const match = /(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/.exec(text);
  if (!match) return undefined;
  const digits = match[0].replace(/\D/g, "").replace(/^33/, "0");
  return formatPhone(digits.length === 9 ? `0${digits}` : digits);
}

export function extractName(text: string): string | undefined {
  const patterns = [
    new RegExp(`(?:je m'appelle|je suis|mon nom est|c'est|ici)\\s+(?:(?:madame|monsieur|mme|m\\.)\\s+)?(${NAME})`, "iu"),
    new RegExp(`\\b(?:Madame|Monsieur|Mme|M\\.)\\s+(${NAME})`, "u"),
    new RegExp(`^(?:bonjour|bonsoir|allô|allo)[,!]?\\s+(${NAME})`, "iu"),
  ];
  for (const re of patterns) {
    const match = re.exec(text);
    if (match && /^[A-ZÀ-ÖØ-Ý]/u.test(match[1])) return match[1].replace(/\s+(?:du|de|de la|de chez)$/u, "").trim();
  }
  // Réponse directe en début de réplique : « Nadia Mansouri, 14 rue des Jardins… ».
  const leading = new RegExp(`(?:^|\\n)\\s*([${UPPER}]${WORD}(?:\\s+[${UPPER}]${WORD}){1,2})\\s*(?:[,.]|$)`, "mu").exec(text);
  if (leading && !NOT_A_NAME.test(leading[1])) return leading[1];
  return undefined;
}

export function extractCompany(text: string): string | undefined {
  const match = /\b(?:du|de la|de l'|de chez)\s+((?:Restaurant|Boulangerie|Pharmacie|Syndic|Cabinet|Hôtel|Hotel|Société|Garage|Boucherie|Café|Brasserie|Résidence)\b[^,.!?\n]*)/u.exec(text);
  return match?.[1].trim();
}

export function extractAddress(text: string): Pick<CallExtraction, "caller_address" | "caller_postal_code" | "caller_city"> {
  const street = /(\d{1,4}(?:\s?(?:bis|ter))?,?\s+(?:rue|avenue|av\.|boulevard|bd|place|allée|allee|impasse|chemin|route|quai|cours|square)\b[^,.!?\n]*?)(?=\s*,|\.|!|\?|\s+à\s|\s+a\s|\s+\d{5}|\n|$)/iu.exec(text);
  const postal = new RegExp(`\\b(\\d{5})\\s+(${CITY})`, "u").exec(text);
  const cityAfterA = new RegExp(`\\s(?:à|a)\\s+(${CITY})`, "u").exec(text);
  const postalOnly = /\b(\d{5})\b/.exec(text);
  return {
    caller_address: street?.[1].replace(/\s+/g, " ").trim(),
    caller_postal_code: postal?.[1] ?? postalOnly?.[1],
    caller_city: postal?.[2] ?? cityAfterA?.[1],
  };
}

export function extractEquipment(text: string, normalized: string): string | undefined {
  const kind = EQUIPMENT_KINDS.find(([re]) => re.test(normalized))?.[1];
  const brand = BRANDS.find((b) => new RegExp(`\\b${normalize(b)}\\b`).test(normalized));
  if (!kind && !brand) return undefined;
  return [kind ?? "Équipement", brand].filter(Boolean).join(" ");
}

export function extractSlot(text: string): string | undefined {
  const match =
    /\b(aujourd'hui|demain|après-demain|apres-demain|lundi|mardi|mercredi|jeudi|vendredi|samedi)(?:\s+(?:matin|après-midi|apres-midi|soir))?\b/iu.exec(text) ??
    /\b(?:en semaine|le matin|l'après-midi|en fin de journée|en fin de journee)\b(?:[^.!?\n]{0,30}?\b(?:après|apres|avant)\s+\d{1,2}\s*(?:h|heures)(?:\s*\d{2})?)?/iu.exec(text) ??
    /\b(?:après|apres|avant)\s+\d{1,2}\s*(?:h|heures)(?:\s*\d{2})?/iu.exec(text);
  return match ? capitalize(match[0].trim()) : undefined;
}

function extractNeed(text: string, intent: CallIntent): string | undefined {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^(?:bonjour|bonsoir|allô|allo)[,!]?\s*/iu, "").trim())
    .filter(Boolean);
  const keyword =
    intent === "depannage"
      ? /panne|fuite|fuit|ne (marche|fonctionne|chauffe|refroidit)|plus d'eau|plus de chauffage|coule|bruit/i
      : intent === "devis_installation"
        ? /devis|install|remplac|projet|pose/i
        : intent === "entretien"
          ? /entretien|révision|revision|contrat|visite/i
          : /./;
  const sentence = sentences.find((s) => keyword.test(normalize(s)));
  return sentence ? capitalize(sentence.replace(/[.!?]+$/, "")) : undefined;
}

export function extractCallData(text: string): CallExtraction {
  const normalized = normalize(text);
  const intent = detectIntent(normalized);
  const name = extractName(text);
  const company = extractCompany(text);
  return {
    caller_name: name && company ? `${name} (${company})` : name ?? company,
    caller_phone: extractPhone(text),
    ...extractAddress(text),
    equipment_mentioned: extractEquipment(text, normalized),
    need: extractNeed(text, intent),
    urgency: detectUrgency(normalized, intent),
    intent,
    preferred_slot: extractSlot(text),
  };
}
