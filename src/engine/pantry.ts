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

/** Настройка «Есть всегда» из профиля: что добавлено к списку по умолчанию и что из него выключено. */
export interface AlwaysPrefs { on: string[]; off: string[] }
export const emptyAlways: AlwaysPrefs = { on: [], off: [] };

/**
 * Продукты, которые считаются имеющимися всегда: список по умолчанию (флаг staple в справочнике —
 * соль, перец, сахар, вода, растительное и оливковое масло) плюс добавленные пользователем, минус выключенные.
 */
export function alwaysHave(products: Iterable<Product>, prefs: AlwaysPrefs = emptyAlways): Set<string> {
  const set = new Set<string>(prefs.on);
  for (const p of products) if (isStaple(p)) set.add(p.id);
  for (const id of prefs.off) set.delete(id);
  return set;
}

/**
 * Сравнивает рецепт с продуктами пользователя.
 * Необязательные ингредиенты не учитываются; продукты из «Есть всегда» (always) считаются имеющимися —
 * если список не передан, берётся список по умолчанию из справочника;
 * если продукта нет, но есть его замена — он тоже считается найденным.
 */
export function matchRecipe(r: Recipe, pantry: ReadonlySet<string>, products: ReadonlyMap<string, Product>, always?: ReadonlySet<string>): Match {
  let total = 0, have = 0, matched = 0;
  const missing: string[] = [];
  const subs: Match['subs'] = [];
  for (const i of r.ing) {
    if (i.opt) continue;
    total++;
    const p = products.get(i.p);
    if (pantry.has(i.p)) { have++; matched++; continue; }
    if (always ? always.has(i.p) : isStaple(p)) { have++; continue; }
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
export function rankByPantry(recipes: readonly Recipe[], pantry: ReadonlySet<string>, products: ReadonlyMap<string, Product>, always?: ReadonlySet<string>): Ranked[] {
  if (pantry.size === 0) return [];
  return recipes
    .map((recipe) => ({ recipe, match: matchRecipe(recipe, pantry, products, always) }))
    .filter((x) => x.match.matched > 0)
    .sort((a, b) => b.match.pct - a.match.pct || a.match.missing.length - b.match.missing.length || a.recipe.total - b.recipe.total || a.recipe.id.localeCompare(b.recipe.id));
}
