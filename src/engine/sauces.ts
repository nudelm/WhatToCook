// Соусы: выбор по основе («к чему соус?») и подсказка соуса к обычному блюду. Чистые функции — их удобно тестировать.
import type { Product, Recipe } from '../types';
import { isSauce, passesProfile, violations, type FilterGroup, type Filters, type Prefs } from './filters';
import { matchRecipe, rankByPantry, type Ranked } from './pantry';
import { rng } from './today';

/** Основы, к которым подбирается соус (порядок чипов на экране). Те же теги — в поле base у блюд. */
export const PAIRS = ['meat', 'chicken', 'fish', 'seafood', 'rice', 'pasta', 'noodles', 'potato', 'grains', 'dumplings', 'veg', 'eggs', 'bread'];

/** Какие фильтры каталога имеют смысл для соусов (кухня, тип блюда, сложность и оборудование — нет). */
export const SAUCE_FILTER_GROUPS: FilterGroup[] = ['time', 'kcal', 'protein', 'diets'];

export const sauceViolations = (r: Recipe, f: Filters): FilterGroup[] => violations(r, f).filter((g) => SAUCE_FILTER_GROUPS.includes(g));

/** Сколько выбранных основ подходит соусу. */
export const pairOverlap = (sauce: Recipe, bases: readonly string[]): number => bases.filter((b) => sauce.pairs?.includes(b)).length;

export interface SauceQuery {
  /** выбранные основы; пусто — все соусы */
  bases: readonly string[];
  /** только соусы без готовки */
  noCookOnly?: boolean;
}

/**
 * Соусы под выбранные основы с учётом профиля (диеты, аллергии, «не ем», скрытые) и подходящих фильтров.
 * Сначала те, что подходят к большему числу выбранных основ, затем без готовки, затем быстрые.
 */
export function selectSauces(recipes: readonly Recipe[], prefs: Prefs, f: Filters, q: SauceQuery, hidden?: ReadonlySet<string>): Recipe[] {
  return recipes
    .filter((r) => isSauce(r) && passesProfile(r, prefs, hidden) && sauceViolations(r, f).length === 0)
    .filter((r) => (!q.noCookOnly || r.nocook) && (q.bases.length === 0 || pairOverlap(r, q.bases) > 0))
    .sort((a, b) => pairOverlap(b, q.bases) - pairOverlap(a, q.bases) || Number(!!b.nocook) - Number(!!a.nocook) || a.total - b.total || a.id.localeCompare(b.id));
}

/** Режим «У меня есть» для соусов: те же правила совпадения, что и для блюд. */
export function rankSaucesByPantry(sauces: readonly Recipe[], pantry: ReadonlySet<string>, products: ReadonlyMap<string, Product>, always?: ReadonlySet<string>): Ranked[] {
  return rankByPantry(sauces.filter(isSauce), pantry, products, always);
}

export interface SuggestOptions {
  prefs: Prefs;
  hidden?: ReadonlySet<string>;
  /** продукты пользователя — соусы, которые из них получаются, идут выше */
  pantry?: ReadonlySet<string>;
  products?: ReadonlyMap<string, Product>;
  always?: ReadonlySet<string>;
  limit?: number;
}

/**
 * «Какой соус подойдёт» к обычному блюду. Основа блюда (base: мясо, рис, паста…) сопоставляется с тегами соуса «подходит к».
 * Выше — соусы, подходящие к большему числу основ, без готовки и те, что получаются из продуктов пользователя.
 * Блюдо, которое уже с соусом (sauced), суп, салат или десерт (пустая base) — пустой список.
 */
export function suggestSauces(dish: Recipe, recipes: readonly Recipe[], opts: SuggestOptions): Recipe[] {
  if (isSauce(dish) || dish.sauced || !dish.base?.length) return [];
  const base = dish.base;
  const usePantry = !!(opts.pantry?.size && opts.products);
  const scored: { r: Recipe; score: number; tie: number }[] = [];
  for (const r of recipes) {
    if (!isSauce(r) || !passesProfile(r, opts.prefs, opts.hidden)) continue;
    const ov = pairOverlap(r, base);
    if (!ov) continue;
    let score = Math.min(ov, 2) * 6 + (r.nocook ? 4 : 0);
    if (usePantry) {
      const m = matchRecipe(r, opts.pantry!, opts.products!, opts.always);
      score += m.pct / 16 + (m.missing.length === 0 ? 2 : 0);
    }
    // к вегетарианскому или веганскому блюду лучше соус той же диеты
    if (dish.diets.includes('vegan') && !r.diets.includes('vegan')) score -= 3;
    else if (dish.diets.includes('vegetarian') && !r.diets.includes('vegetarian')) score -= 3;
    // при равенстве порядок свой у каждого блюда, чтобы везде не предлагались одни и те же соусы
    scored.push({ r, score, tie: rng(`${dish.id}|${r.id}`)() });
  }
  return scored.sort((a, b) => b.score - a.score || a.tie - b.tie).slice(0, opts.limit ?? 3).map((x) => x.r);
}
