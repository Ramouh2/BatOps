/**
 * Moteur déterministe « Text-to-Quote » du MockAIProvider.
 *
 * Règle absolue : aucun prix n'est inventé. Le moteur ne fait que choisir des articles du catalogue
 * de l'entreprise et des quantités ; si un article nécessaire n'existe pas, il le signale.
 */
import type { CatalogItem, DocumentLine, VatRate } from "@/types/batops";
import { SECTION, defaultSectionFor } from "@/lib/domain/catalog";
import { createId } from "@/lib/domain/ids";
import { lineTotal } from "@/lib/domain/money";
import { formatNumber } from "@/lib/domain/format";
import { capitalize, normalize, parseNumber } from "@/providers/text";
import type { MissingItemSuggestion, QuoteDraft, QuoteDraftContext } from "./ai.provider";

interface Wanted {
  ref: string;
  qty: number;
  /** Libellé lisible pour les messages d'avertissement. */
  label: string;
}

const SECTION_ORDER: string[] = [
  SECTION.preparation,
  SECTION.equipment,
  SECTION.accessories,
  SECTION.labor,
  SECTION.travel,
  SECTION.maintenance,
  SECTION.extra,
];

const KNOWN_BRANDS = [
  "daikin",
  "atlantic",
  "mitsubishi",
  "fujitsu",
  "toshiba",
  "panasonic",
  "samsung",
  "hitachi",
  "lg",
  "viessmann",
  "de dietrich",
  "saunier duval",
  "thermor",
  "aldes",
  "frico",
  "sauermann",
  "grundfos",
];

const OUTDOOR_UNIT_REFS = ["CLIM-DAI-M35", "CLIM-DAI-M50", "CLIM-DAI-UE3", "PAC-ATL-8"];
const SPLIT_REFS = ["CLIM-DAI-M35", "CLIM-DAI-M50", "CLIM-DAI-UE3"];
const POWERED_EQUIPMENT_REFS = [...OUTDOOR_UNIT_REFS, "CET-THE-200", "RID-FRI-15", "VMC-ALD-250"];

interface Analysis {
  wanted: Wanted[];
  title: string;
  energyRenovation: boolean;
  warnings: string[];
}

function analyze(prompt: string): Analysis {
  const t = normalize(prompt);
  const has = (re: RegExp) => re.test(t);
  const wanted = new Map<string, Wanted>();
  const warnings: string[] = [];
  const add = (ref: string, qty: number, label: string) => {
    const existing = wanted.get(ref);
    if (existing) existing.qty += qty;
    else wanted.set(ref, { ref, qty, label });
  };

  const titles: string[] = [];
  const kwMatch = /(\d+(?:\.\d+)?)\s*kw/.exec(t);
  const requestedKw = kwMatch ? parseNumber(kwMatch[1]) : undefined;

  const isPacAirEau =
    (has(/\b(pac|pompe a chaleur)\b/) && has(/air\s*[/-]?\s*eau|\balfea\b/)) || has(/\balfea\b/);
  const multiMatch = /\b(bi|tri|quadri|multi)[\s-]?splits?\b/.exec(t);
  const mentionsClim =
    has(/\b(clim|climatisation|climatiseur|splits?|mono[\s-]?split|reversible)\b|pac air\s*[/-]?\s*air/) || !!multiMatch;
  const isClim = mentionsClim && (!isPacAirEau || has(/\bsplits?\b/));
  const isCet = has(/chauffe[\s-]?eau thermo|\bcet\b|aeromax|ballon thermo/);
  const isGasBoiler = !isPacAirEau && has(/chaudiere (gaz|a condensation)|condensation gaz|vitodens/);
  const isAirCurtain = has(/rideau d.?air/);
  const isVmc = has(/\bvmc\b|caisson (de )?(ventilation|vmc)|extracteur/);
  const isInstallation = isPacAirEau || isClim || isCet || isGasBoiler || isAirCurtain || isVmc;
  const isRepair = has(/depann|\bpanne\b|fuite|ne (refroidit|chauffe|marche|fonctionne) plus|diagnostic|hors service|\bhs\b/);
  const isMaintenance = has(/entretien|contrat de maintenance|visite annuelle/);

  let laborRef: string | undefined;
  let laborHours = 0;

  // ---- PAC Air/Eau -------------------------------------------------------
  if (isPacAirEau) {
    add("PAC-ATL-8", 1, "PAC Air/Eau");
    add("ACC-KIT-HYD", 1, "kit de raccordement hydraulique");
    add("FOR-MES-PAC", 1, "mise en service PAC");
    laborRef = "MO-FRIG";
    laborHours += 16;
    if (requestedKw !== undefined && Math.abs(requestedKw - 8) > 0.5) {
      warnings.push(`Puissance demandée ${formatNumber(requestedKw)} kW : votre catalogue contient une PAC 8 kW, à valider par une étude thermique.`);
    }
    titles.push("Installation PAC Air/Eau Atlantic 8 kW");
  }
  if (has(/fioul/)) {
    add("FOR-DEP-FIOUL", 1, "dépose chaudière fioul");
    laborHours += isPacAirEau ? 5 : 0;
    titles.push(isPacAirEau ? "en remplacement de la chaudière fioul" : "Dépose chaudière fioul");
  }

  // ---- Climatisation -----------------------------------------------------
  if (isClim) {
    const units: number[] = [];
    const unitRe = /(?:(\d+)\s*)?(?:unites?|ui|splits?)\s+(?:interieures?\s+)?(?:[a-z']+\s+){0,3}?(\d+(?:\.\d+)?)\s*kw/g;
    for (const match of t.matchAll(unitRe)) {
      const qty = match[1] ? Number(match[1]) : 1;
      for (let i = 0; i < qty; i += 1) units.push(parseNumber(match[2]));
    }
    const multiKind = multiMatch?.[1];
    if (units.length === 0 && multiKind) {
      const defaults: Record<string, number[]> = { bi: [3.5, 2], tri: [3.5, 2, 2], quadri: [3.5, 2, 2, 2], multi: [3.5, 2] };
      units.push(...defaults[multiKind]);
      warnings.push("Puissance des unités intérieures estimée (séjour 3,5 kW, chambres 2,0 kW) : à confirmer à la visite technique.");
    }

    const isMulti = units.length >= 2 || !!multiKind;
    if (isMulti) {
      add("CLIM-DAI-UE3", 1, "groupe extérieur multi-split");
      for (const kw of units) {
        if (kw > 3.5) warnings.push(`Unité intérieure de ${formatNumber(kw)} kW absente du catalogue multi-split : 3,5 kW proposée.`);
        add(kw <= 2.5 ? "CLIM-DAI-UI20" : "CLIM-DAI-UI35", 1, "unité intérieure murale");
      }
      if (units.length > 3) warnings.push("Le groupe extérieur du catalogue accepte 3 unités intérieures maximum.");
      laborHours += 5 + 4 * (Math.max(units.length, 2) - 1);
      const prefix = units.length === 2 ? "bi" : units.length === 3 ? "tri" : "multi";
      titles.push(`Climatisation réversible ${prefix}-split Daikin (${units.length} unités intérieures)`);
    } else {
      const kw = units[0] ?? requestedKw ?? 3.5;
      add(kw >= 4.5 ? "CLIM-DAI-M50" : "CLIM-DAI-M35", 1, "climatisation mono-split");
      laborHours += 5;
      titles.push(`Climatisation réversible mono-split Daikin ${kw >= 4.5 ? "5,0" : "3,5"} kW`);
    }
    laborRef = laborRef ?? "MO-FRIG";

    const lengthMatch =
      /(\d+(?:\.\d+)?)\s*(?:m|ml|metres?)\b\s*(?:de\s+)?liaisons?/.exec(t) ??
      /liaisons?\s+(?:frigorifiques?\s+)?(?:de\s+|sur\s+)?(\d+(?:\.\d+)?)\s*(?:m|ml|metres?)\b/.exec(t);
    const unitCount = isMulti ? Math.max(units.length, 2) : 1;
    const length = lengthMatch ? parseNumber(lengthMatch[1]) : 5 * unitCount;
    if (!lengthMatch) warnings.push(`Longueur de liaisons frigorifiques estimée à ${length} m : à confirmer à la visite technique.`);
    const bigUnit = wanted.has("CLIM-DAI-M50");
    add(bigUnit ? "ACC-LIAIS-12" : "ACC-LIAIS-38", length, "liaisons frigorifiques");
    if (has(/goulotte/)) add("ACC-GOUL", length, "goulotte de finition");
    add("FOR-MES-R32", 1, "mise en service R32");
  }

  // ---- Eau chaude, chauffage, ventilation --------------------------------
  if (isCet) {
    add("CET-THE-200", 1, "chauffe-eau thermodynamique");
    add("ACC-GS", 1, "groupe de sécurité");
    if (has(/remplac|depose|ancien/)) add("FOR-DEP-CE", 1, "dépose de l'ancien chauffe-eau");
    laborRef = laborRef ?? "MO-CHAU";
    laborHours += 6;
    titles.push("Pose d'un chauffe-eau thermodynamique Thermor 200 L");
  }
  if (isGasBoiler) {
    add("CHAU-VIE-25", 1, "chaudière gaz à condensation");
    add("ACC-VENT", 1, "kit ventouse");
    laborRef = laborRef ?? "MO-CHAU";
    laborHours += 10;
    titles.push("Remplacement par une chaudière gaz à condensation");
  }
  if (isAirCurtain) {
    add("RID-FRI-15", 1, "rideau d'air");
    laborRef = laborRef ?? "MO-ELEC";
    laborHours += 4;
    titles.push("Remplacement du rideau d'air");
  }
  if (isVmc) {
    add("VMC-ALD-250", 1, "caisson VMC");
    add("FOR-MES-VMC", 1, "mise en service VMC");
    laborRef = laborRef ?? "MO-ELEC";
    laborHours += 6;
    titles.push("Remplacement du caisson VMC collective");
  }

  // ---- Mentions explicites ------------------------------------------------
  if (has(/desembou/)) {
    add("FOR-DESEMB", 1, "désembouage");
    titles.push("désembouage");
  }
  if (has(/relevage|sauermann/)) add("ACC-POMPE-SI27", 1, "pompe de relevage");
  if (has(/anti.?vibra/)) add("ACC-SUPP-AV", 1, "supports anti-vibratiles");
  if (has(/disjoncteur|protection electrique|ligne (electrique )?dediee/)) add("ACC-DISJ", 1, "protection électrique dédiée");
  if (has(/pot a boue|filtre magnetique/)) add("ACC-POT-BOUE", 1, "pot à boue");

  // ---- Dépannage / entretien seuls ---------------------------------------
  if (isRepair && !isInstallation) {
    add("DEP-DIAG", 1, "déplacement & diagnostic");
    if (has(/urgen|week-end|weekend|soir|nuit|dimanche/)) add("DEP-URG", 1, "majoration urgence");
    const climContext = has(/clim|split|climatisation|condensat|relevage/);
    laborRef = climContext ? "MO-FRIG" : "MO-CHAU";
    laborHours += 1;
    titles.push(climContext ? "Dépannage climatisation" : "Dépannage chauffage / plomberie");
  }
  if (isMaintenance && !isInstallation && !isRepair) {
    const ref = has(/vmc/) ? "MAINT-VMC" : has(/\bpac\b|pompe a chaleur/) ? "MAINT-PAC" : has(/gainable|rideau|restaurant|commerce/) ? "MAINT-PRO" : "MAINT-CLIM";
    add(ref, 1, "contrat d'entretien annuel");
    titles.push("Contrat d'entretien annuel");
  }

  // ---- Main-d'œuvre -------------------------------------------------------
  const hoursMatch = /(\d+(?:\.\d+)?)\s*h(?:eures?)?\s+(?:de\s+)?(?:main[\s-]d.?oeuvre|mo\b|pose|travail)/.exec(t);
  if (hoursMatch) laborHours = parseNumber(hoursMatch[1]);
  if (laborRef && laborHours > 0) add(laborRef, laborHours, "main-d'œuvre");

  // ---- Marques absentes du catalogue --------------------------------------
  const catalogBrands = ["daikin", "atlantic", "thermor", "viessmann", "frico", "aldes", "sauermann", "grundfos"];
  for (const brand of KNOWN_BRANDS) {
    if (!catalogBrands.includes(brand) && new RegExp(`\\b${brand}\\b`).test(t)) {
      warnings.push(`Marque « ${capitalize(brand)} » absente de votre catalogue : équivalent du catalogue proposé, à valider.`);
    }
  }

  if (wanted.size === 0) {
    warnings.push(
      "Aucune prestation de votre catalogue n'a été reconnue. Précisez l'équipement (PAC, climatisation, chauffe-eau, chaudière…) ou ajoutez les lignes manuellement.",
    );
  }

  const title = titles.length
    ? capitalize(titles.reduce((acc, part, i) => (i === 0 ? part : `${acc}${part.startsWith("en ") ? " " : " + "}${part}`), ""))
    : capitalize(prompt.trim().slice(0, 80));

  return {
    wanted: [...wanted.values()],
    title,
    energyRenovation: isPacAirEau || isCet,
    warnings,
  };
}

function recommendVat(context: QuoteDraftContext, energyRenovation: boolean): { rate: VatRate; reason: string } {
  if (context.clientType === "professionnel") return { rate: 20, reason: "Client professionnel : TVA à 20 %." };
  if (context.housingOver2Years === false) return { rate: 20, reason: "Logement achevé depuis moins de 2 ans : TVA à 20 %." };
  if (energyRenovation) {
    return {
      rate: 5.5,
      reason: "Travaux d'amélioration de la performance énergétique dans un logement de plus de 2 ans : TVA à 5,5 %.",
    };
  }
  return { rate: 10, reason: "Travaux de rénovation dans un logement de plus de 2 ans : TVA à 10 %." };
}

function toLine(item: CatalogItem, qty: number, vat: VatRate): DocumentLine {
  return {
    id: createId("line"),
    catalog_item_id: item.id,
    section: defaultSectionFor(item),
    item_category: item.category,
    name: item.name,
    description: item.description,
    qty,
    unit: item.unit,
    buying_price_ht: item.buying_price_ht,
    unit_price_ht: item.selling_price_ht,
    vat_rate: vat,
    total_ht: lineTotal(qty, item.selling_price_ht),
    ai_suggested: true,
  };
}

export function buildQuoteDraft(prompt: string, context: QuoteDraftContext): QuoteDraft {
  const analysis = analyze(prompt);
  const vat = recommendVat(context, analysis.energyRenovation);
  const byRef = new Map(context.catalog.filter((c) => c.is_active).map((c) => [c.reference, c]));
  const warnings = [...analysis.warnings];

  const lines: DocumentLine[] = [];
  for (const w of analysis.wanted) {
    const item = byRef.get(w.ref);
    if (!item) {
      warnings.push(`Article « ${w.label} » introuvable dans votre catalogue : ligne non ajoutée (aucun prix inventé).`);
      continue;
    }
    lines.push(toLine(item, w.qty, vat.rate));
  }
  lines.sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section));

  return {
    title: analysis.title,
    vat_rate: vat.rate,
    vat_reason: vat.reason,
    lines,
    suggestions: findMissingItems(lines, context.catalog, prompt),
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Détection d'oublis techniques                                       */
/* ------------------------------------------------------------------ */

interface MissingRule {
  id: string;
  ref: string;
  reason: string;
  applies: (refs: Set<string>, text: string) => boolean;
  qty?: (refs: Set<string>, lines: { catalog_item_id?: string; qty?: number }[], byId: Map<string, CatalogItem>) => number;
}

const anyOf = (refs: Set<string>, list: string[]) => list.some((r) => refs.has(r));
const hasMaintenance = (refs: Set<string>) => [...refs].some((r) => r.startsWith("MAINT-"));

const MISSING_RULES: MissingRule[] = [
  {
    id: "supports-anti-vibratiles",
    ref: "ACC-SUPP-AV",
    reason: "Limite vibrations et nuisances sonores du groupe extérieur (voisinage).",
    applies: (refs) => anyOf(refs, OUTDOOR_UNIT_REFS) && !refs.has("ACC-SUPP-AV"),
  },
  {
    id: "protection-electrique",
    ref: "ACC-DISJ",
    reason: "Alimentation dédiée avec protection obligatoire (NF C 15-100).",
    applies: (refs) => anyOf(refs, POWERED_EQUIPMENT_REFS) && !refs.has("ACC-DISJ"),
  },
  {
    id: "pompe-relevage",
    ref: "ACC-POMPE-SI27",
    reason: "À prévoir si l'évacuation gravitaire des condensats est impossible.",
    applies: (refs, text) => anyOf(refs, SPLIT_REFS) && !refs.has("ACC-POMPE-SI27") && !/gravitaire/.test(text),
  },
  {
    id: "mise-en-service-r32",
    ref: "FOR-MES-R32",
    reason: "Tirage au vide et test d'étanchéité obligatoires (attestation de capacité fluides).",
    applies: (refs) => anyOf(refs, SPLIT_REFS) && !refs.has("FOR-MES-R32"),
  },
  {
    id: "mise-en-service-pac",
    ref: "FOR-MES-PAC",
    reason: "Mise en service et paramétrage de la loi d'eau indispensables à la garantie.",
    applies: (refs) => refs.has("PAC-ATL-8") && !refs.has("FOR-MES-PAC"),
  },
  {
    id: "desembouage",
    ref: "FOR-DESEMB",
    reason: "Recommandé avant raccordement d'un générateur neuf sur un réseau existant.",
    applies: (refs) => anyOf(refs, ["PAC-ATL-8", "CHAU-VIE-25"]) && !refs.has("FOR-DESEMB"),
  },
  {
    id: "pot-a-boue",
    ref: "ACC-POT-BOUE",
    reason: "Protège l'échangeur de la PAC ou de la chaudière contre les boues du réseau.",
    applies: (refs) => anyOf(refs, ["PAC-ATL-8", "CHAU-VIE-25", "FOR-DESEMB"]) && !refs.has("ACC-POT-BOUE"),
  },
  {
    id: "goulotte",
    ref: "ACC-GOUL",
    reason: "Finition propre des liaisons apparentes.",
    applies: (refs) => anyOf(refs, ["ACC-LIAIS-38", "ACC-LIAIS-12"]) && !refs.has("ACC-GOUL"),
    qty: (_refs, lines, byId) =>
      lines
        .filter((l) => {
          const ref = l.catalog_item_id ? byId.get(l.catalog_item_id)?.reference : undefined;
          return ref === "ACC-LIAIS-38" || ref === "ACC-LIAIS-12";
        })
        .reduce((s, l) => s + (l.qty ?? 0), 0) || 1,
  },
  {
    id: "contrat-entretien-clim",
    ref: "MAINT-CLIM",
    reason: "Proposé en option : entretien annuel, fidélisation et revenu récurrent.",
    applies: (refs) => anyOf(refs, SPLIT_REFS) && !hasMaintenance(refs),
  },
  {
    id: "contrat-entretien-pac",
    ref: "MAINT-PAC",
    reason: "Entretien annuel obligatoire pour une PAC — proposé en option.",
    applies: (refs) => refs.has("PAC-ATL-8") && !hasMaintenance(refs),
  },
];

/** Suggestions d'oublis : uniquement des articles présents et actifs dans le catalogue, au prix catalogue. */
export function findMissingItems(
  lines: { catalog_item_id?: string; qty?: number }[],
  catalog: CatalogItem[],
  prompt = "",
): MissingItemSuggestion[] {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const byRef = new Map(catalog.filter((c) => c.is_active).map((c) => [c.reference, c]));
  const refs = new Set(
    lines.map((l) => (l.catalog_item_id ? byId.get(l.catalog_item_id)?.reference : undefined)).filter((r): r is string => !!r),
  );
  const text = normalize(prompt);

  return MISSING_RULES.filter((rule) => rule.applies(refs, text) && byRef.has(rule.ref)).map((rule) => {
    const item = byRef.get(rule.ref)!;
    return {
      rule_id: rule.id,
      catalog_item_id: item.id,
      reference: item.reference,
      name: item.name,
      reason: rule.reason,
      qty: rule.qty ? rule.qty(refs, lines, byId) : 1,
      unit_price_ht: item.selling_price_ht,
    };
  });
}
