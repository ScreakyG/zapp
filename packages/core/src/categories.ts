import type { Category } from './model';

/** Keywords looked for in a provider's group name ("FR | SPORTS HD") to pick a category. */
export type CategoryKeywords = Record<Exclude<Category, 'divert'>, string[]>;

export const DEFAULT_CATEGORY_KEYWORDS: CategoryKeywords = {
  sport: ['sport', 'foot', 'rugby', 'tennis', 'basket', 'golf', 'moto', 'f1', 'bein', 'eurosport'],
  cinema: ['cinema', 'film', 'movie', 'serie', 'series', 'ocs', 'paramount', 'tcm'],
  info: ['info', 'news', 'actu', 'doc', 'decouverte', 'discovery', 'histoire', 'science', 'geo'],
  jeunesse: ['jeunesse', 'enfant', 'kid', 'junior', 'cartoon', 'disney', 'nickelodeon', 'gulli'],
  musique: ['musique', 'music', 'mtv', 'mezzo', 'trace', 'radio'],
};

/** Lowercase, accents stripped: "Cinéma & Séries" → "cinema & series". */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
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
  const words = foldText(group)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  for (const [category, list] of Object.entries(keywords) as [Category, string[]][]) {
    if (list.some((k) => words.some((w) => w.startsWith(k)))) return category;
  }
  return 'divert';
}

/**
 * Whether a provider group passes the user's filter: kept when the filter is empty or one of its
 * entries appears in the group name ("FR" keeps "FR | SPORTS").
 */
export function keepGroup(group: string, filter: readonly string[]): boolean {
  if (filter.length === 0) return true;
  const folded = foldText(group);
  return filter.some((f) => folded.includes(foldText(f)));
}
