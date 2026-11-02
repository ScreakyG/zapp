import type { Category } from './model';

/** Keywords looked for in a provider's group name ("FR | SPORTS HD") to pick a category. */
export type CategoryKeywords = Record<Exclude<Category, 'divert'>, string[]>;

export const DEFAULT_CATEGORY_KEYWORDS: CategoryKeywords = {
  sport: ['sport', 'foot', 'rugby', 'tennis', 'basket', 'golf', 'moto', 'f1', 'bein', 'eurosport'],
  // "=" marks exact words: "SERIE A" is football, "GEORGIA" a country.
  cinema: ['cinema', 'film', 'movie', '=series', 'ocs', 'paramount', 'tcm'],
  info: ['info', 'news', 'actu', 'doc', 'decouverte', 'discovery', 'histoire', 'science', '=geo'],
  jeunesse: ['jeunesse', 'enfant', 'kid', 'junior', 'cartoon', 'disney', 'nickelodeon', 'gulli'],
  musique: ['musique', 'music', 'mtv', 'mezzo', 'trace', 'radio'],
};

/** Lowercase, accents stripped: "Cinéma & Séries" → "cinema & series". */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function words(text: string): string[] {
  return foldText(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Category of a provider group, by keyword at the start of a word ("doc" matches
 * "Documentaires", "sport" matches "SPORTS" but not "Transport"). Anything unrecognised is
 * entertainment (`divert`).
 */
export function categorize(
  group: string,
  keywords: CategoryKeywords = DEFAULT_CATEGORY_KEYWORDS,
): Category {
  const groupWords = words(group);
  for (const [category, list] of Object.entries(keywords) as [Category, string[]][]) {
    const hit = (k: string) =>
      k.startsWith('=') ? groupWords.includes(k.slice(1)) : groupWords.some((w) => w.startsWith(k));
    if (list.some(hit)) return category;
  }
  return 'divert';
}

/**
 * Whether a provider group passes the user's filter: kept when the filter is empty or all the
 * words of one of its entries are words of the group ("FR" keeps "FR | SPORTS" but not "AFRICA").
 */
export function keepGroup(group: string, filter: readonly string[]): boolean {
  if (filter.length === 0) return true;
  const groupWords = new Set(words(group));
  return filter.some((f) => {
    const wanted = words(f);
    return wanted.length > 0 && wanted.every((w) => groupWords.has(w));
  });
}
