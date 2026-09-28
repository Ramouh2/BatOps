/** Recherche textuelle partagée (palette de commandes). */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae");

/**
 * Recherche métier prévisible : chaque mot saisi doit apparaître tel quel (accents et casse ignorés),
 * avec un bonus quand il commence un mot. Évite les correspondances floues (« marc » ≠ « Thomas Mercier »).
 */
export function wordFilter(value: string, search: string, keywords?: string[]): number {
  const haystack = fold([value, ...(keywords ?? [])].join(" "));
  const terms = fold(search).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 1;
  let score = 0;
  for (const term of terms) {
    const index = haystack.indexOf(term);
    if (index === -1) return 0;
    const wordStart = index === 0 || /[\s\-/'(]/.test(haystack[index - 1]);
    score += wordStart ? 1 : 0.4;
  }
  return score / terms.length;
}
