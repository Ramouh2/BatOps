/**
 * Reformulation déterministe des notes terrain (MockAIProvider).
 * Transforme « pompe hs changée sauermann test ok » en phrases professionnelles,
 * sans jamais ajouter un fait absent des notes (pas de modèle, pas de mesure inventés).
 */
import { capitalize, normalize } from "@/providers/text";

const BRANDS: Record<string, string> = {
  sauermann: "Sauermann",
  daikin: "Daikin",
  atlantic: "Atlantic",
  mitsubishi: "Mitsubishi Electric",
  fujitsu: "Fujitsu",
  thermor: "Thermor",
  viessmann: "Viessmann",
  grundfos: "Grundfos",
  aldes: "Aldes",
  frico: "Frico",
  wilo: "Wilo",
};

/** Mots qui ouvrent une nouvelle proposition dans une note télégraphique. */
const CLAUSE_STARTERS = ["test", "tests", "essai", "essais", "filtre", "filtres", "nettoy", "fuite", "sonde", "recharge", "complement", "purge", "bac", "pression", "pressions", "mise en service", "prevoir", "a prevoir"];

const ABBREVIATIONS: [RegExp, string][] = [
  [/\bhs\b/g, "hors service"],
  [/\bok\b/g, "conforme"],
  [/\bchgt\b/g, "changement"],
  [/\brempl\b/g, "remplacement"],
  [/\bue\b/g, "unité extérieure"],
  [/\bui\b/g, "unité intérieure"],
  [/\bclim\b/g, "climatisation"],
  [/\bpac\b/g, "pompe à chaleur"],
  [/\brdv\b/g, "rendez-vous"],
  [/\btjs\b/g, "toujours"],
  [/\bpb\b/g, "problème"],
  [/\bbcp\b/g, "beaucoup"],
  [/\bds\b/g, "dans"],
  [/\bpr\b/g, "pour"],
];

const ACCENTS: [RegExp, string][] = [
  [/\bchangee\b/g, "changée"],
  [/\bchange\b/g, "changé"],
  [/\bnettoyee?s?\b/g, "nettoyé"],
  [/\breparee?\b/g, "réparé"],
  [/\bverifiee?\b/g, "vérifié"],
  [/\bremplacee?\b/g, "remplacé"],
  [/\bcontrole\b/g, "contrôle"],
  [/\becoulement\b/g, "écoulement"],
  [/\belectrique\b/g, "électrique"],
  [/\bunite\b/g, "unité"],
  [/\bexterieure?\b/g, "extérieure"],
  [/\binterieure?\b/g, "intérieure"],
  [/\bdegivrage\b/g, "dégivrage"],
  [/\bprevoir\b/g, "prévoir"],
  [/\bdeja\b/g, "déjà"],
  [/\btres\b/g, "très"],
  [/\bchaudiere\b/g, "chaudière"],
  [/\bdefectueuse?\b/g, "défectueuse"],
];

interface ReportContext {
  brand?: string;
  model?: string;
  climate: boolean;
}

function rewriteClause(clause: string, ctx: ReportContext): string | null {
  const c = clause;
  const has = (re: RegExp) => re.test(c);
  const replaced = has(/chang|remplac|neuve?\b|posee?\b/);
  const faulty = has(/\bhs\b|hors service|morte|en panne|defectueu|grille|bloque/);
  const withBrand = ctx.brand ? ` par un modèle neuf ${ctx.brand}${ctx.model ? ` ${ctx.model}` : ""}` : " par un modèle neuf";

  if (has(/circulateur/) && (replaced || faulty)) {
    return replaced ? `Remplacement du circulateur${faulty ? " défectueux" : ""}${withBrand}.` : "Circulateur constaté hors service.";
  }
  if (has(/pompe/) && (replaced || faulty)) {
    const subject = ctx.climate || has(/relevage/) ? "la pompe de relevage des condensats" : "la pompe";
    return replaced ? `Remplacement de ${subject}${faulty ? " défectueuse" : ""}${withBrand}.` : `Constat : ${subject} est hors service.`;
  }
  if (has(/sonde/) && replaced) return "Remplacement de la sonde de température défectueuse.";
  if (has(/\b(tests?|essais?)\b/) && has(/ecoulement|evacuation/)) {
    return has(/\bok\b|bon|valide|conforme|concluant/) ? "Test d'écoulement des condensats validé." : "Test d'écoulement des condensats réalisé.";
  }
  if (has(/\b(tests?|essais?)\b/) && has(/\bok\b|bon|valide|conforme|concluant/)) {
    return "Essais de fonctionnement réalisés : installation conforme.";
  }
  if (has(/filtres?/) && has(/nettoy/)) {
    return ctx.climate ? "Nettoyage des filtres de l'unité intérieure." : "Nettoyage des filtres.";
  }
  if (has(/\bbac\b/) && has(/nettoy/)) return "Nettoyage du bac à condensats.";
  if (has(/fuite/)) {
    return has(/repar|colmat|supprim|\bok\b|resolu/) ? "Recherche et réparation de la fuite : étanchéité rétablie." : "Présence d'une fuite constatée.";
  }
  if (has(/recharge|complement|appoint/) && has(/gaz|fluide|r32|r410/)) {
    const fluid = /r32/.test(c) ? " (R32)" : /r410/.test(c) ? " (R410A)" : "";
    return `Complément de charge en fluide frigorigène${fluid}.`;
  }
  if (has(/purge/)) return "Purge du circuit réalisée.";
  if (has(/pressions?/) && has(/\bok\b|bon|conforme|controle/)) return "Pressions de fonctionnement contrôlées : conformes.";
  if (has(/mise en service/)) return "Mise en service réalisée.";

  // Repli : développement des abréviations et remise en forme, sans ajout de contenu.
  let text = c;
  for (const [re, value] of ABBREVIATIONS) text = text.replace(re, value);
  for (const [re, value] of ACCENTS) text = text.replace(re, value);
  for (const [key, brand] of Object.entries(BRANDS)) text = text.replace(new RegExp(`\\b${key}\\b`, "g"), brand);
  text = text.trim();
  return text ? `${capitalize(text)}.` : null;
}

export function rewriteReportText(rawNotes: string): string {
  const t = normalize(rawNotes);
  if (!t) return "";

  let prepared = t.replace(/\s*[.;!\n]+\s*/g, " | ").replace(/\s*,\s*/g, " | ").replace(/\s+\+\s+/g, " | ").replace(/\s+et\s+/g, " | ");
  for (const starter of CLAUSE_STARTERS) {
    prepared = prepared.replace(new RegExp(`\\s(?=${starter}\\b)`, "g"), " | ");
  }
  const clauses = prepared
    .split("|")
    .map((c) => c.trim())
    .filter(Boolean);

  const brandKey = Object.keys(BRANDS).find((key) => new RegExp(`\\b${key}\\b`).test(t));
  const modelMatch = /\bsi[\s-]?(\d{2,3})\b/.exec(t);
  const ctx: ReportContext = {
    brand: brandKey ? BRANDS[brandKey] : undefined,
    model: brandKey === "sauermann" && modelMatch ? `Si-${modelMatch[1]}` : undefined,
    climate: /clim|split|condensat|relevage|sauermann|r32|r410|\bui\b|\bue\b|frigo/.test(t),
  };

  const sentences: string[] = [];
  for (const clause of clauses) {
    // Un nom de marque seul (« sauermann ») a déjà été intégré à la phrase de remplacement.
    if (brandKey && clause === brandKey) continue;
    const sentence = rewriteClause(clause, ctx);
    if (sentence && !sentences.includes(sentence)) sentences.push(sentence);
  }
  return sentences.join(" ");
}
