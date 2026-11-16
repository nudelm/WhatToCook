import type { Product, Recipe } from '../types';

export interface Match {
  /** процент найденных обязательных ингредиентов, 0–100 */
  pct: number;
  /** сколько обязательных ингредиентов есть (включая базовые и замены) */
  have: number;
  /** сколько всего обязательных ингредиентов */
  total: number;
  /** сколько совпало с тем, что отметил пользователь (без базовых) */
  matched: number;
  /** id недостающих продуктов */
  missing: string[];
  /** чем заменили: «сливки → сметана» */
  subs: { missing: string; with: string }[];
  status: 'ready' | 'almost' | 'partial';
}

export const isStaple = (p: Product | undefined): boolean => !!p?.flags?.includes('staple');

/**
 * Сравнивает рецепт с продуктами пользователя.
 * Необязательные ингредиенты не учитываются; базовые (соль, вода, масло…) считаются имеющимися;
 * если продукта нет, но есть его замена — он тоже считается найденным.
 */
export function matchRecipe(r: Recipe, pantry: ReadonlySet<string>, products: ReadonlyMap<string, Product>): Match {
  let total = 0, have = 0, matched = 0;
  const missing: string[] = [];
  const subs: Match['subs'] = [];
  for (const i of r.ing) {
    if (i.opt) continue;
    total++;
    const p = products.get(i.p);
    if (pantry.has(i.p)) { have++; matched++; continue; }
    if (isStaple(p)) { have++; continue; }
    const sub = p?.subs?.find((s) => pantry.has(s));
    if (sub) { have++; matched++; subs.push({ missing: i.p, with: sub }); continue; }
    missing.push(i.p);
  }
  return {
    pct: total ? Math.round((have / total) * 100) : 0,
    have, total, matched, missing, subs,
    status: missing.length === 0 ? 'ready' : missing.length <= 2 ? 'almost' : 'partial',
  };
}

export interface Ranked { recipe: Recipe; match: Match }

/** Рецепты по убыванию совпадения, затем по числу недостающих продуктов, затем по времени. */
export function rankByPantry(recipes: readonly Recipe[], pantry: ReadonlySet<string>, products: ReadonlyMap<string, Product>): Ranked[] {
  if (pantry.size === 0) return [];
  return recipes
    .map((recipe) => ({ recipe, match: matchRecipe(recipe, pantry, products) }))
    .filter((x) => x.match.matched > 0)
    .sort((a, b) => b.match.pct - a.match.pct || a.match.missing.length - b.match.missing.length || a.recipe.total - b.recipe.total || a.recipe.id.localeCompare(b.recipe.id));
}
