import type { Recipe } from '../types';

/** Профиль: задаётся один раз и действует везде. */
export interface Prefs {
  diets: string[];
  allergens: string[];
  /** id продуктов, которые пользователь не ест */
  excluded: string[];
}

/** Фильтры каталога и подборки. 0 / пустой массив / false = фильтр выключен. */
export interface Filters {
  maxTime: number;
  maxKcal: number;
  highProtein: boolean;
  diets: string[];
  cuisines: string[];
  types: string[];
  difficulty: number[];
  noOven: boolean;
  onePan: boolean;
  multicooker: boolean;
}

export const HIGH_PROTEIN_G = 30;

export const emptyFilters: Filters = {
  maxTime: 0, maxKcal: 0, highProtein: false, diets: [], cuisines: [], types: [], difficulty: [],
  noOven: false, onePan: false, multicooker: false,
};
export const emptyPrefs: Prefs = { diets: [], allergens: [], excluded: [] };

export type FilterGroup = 'time' | 'kcal' | 'protein' | 'diets' | 'cuisine' | 'type' | 'difficulty' | 'equipment';

/** Профиль — жёсткое ограничение: блюда, которые его нарушают, не показываются нигде. */
export function passesProfile(r: Recipe, prefs: Prefs, hidden?: ReadonlySet<string>): boolean {
  if (hidden?.has(r.id)) return false;
  for (const d of prefs.diets) if (!r.diets.includes(d)) return false;
  for (const a of prefs.allergens) if (r.allergens.includes(a)) return false;
  if (prefs.excluded.length) for (const i of r.ing) if (prefs.excluded.includes(i.p)) return false;
  return true;
}

/** Какие группы фильтров рецепт не проходит. Пустой массив = подходит. */
export function violations(r: Recipe, f: Filters): FilterGroup[] {
  const v: FilterGroup[] = [];
  if (f.maxTime > 0 && r.total > f.maxTime) v.push('time');
  if (f.maxKcal > 0 && r.kcal > f.maxKcal) v.push('kcal');
  if (f.highProtein && r.protein < HIGH_PROTEIN_G) v.push('protein');
  if (f.diets.some((d) => !r.diets.includes(d))) v.push('diets');
  if (f.cuisines.length && !f.cuisines.includes(r.cuisine)) v.push('cuisine');
  if (f.types.length && !f.types.includes(r.type)) v.push('type');
  if (f.difficulty.length && !f.difficulty.includes(r.diff)) v.push('difficulty');
  if ((f.noOven && r.equip.includes('oven')) || (f.onePan && !r.equip.includes('onepan')) || (f.multicooker && !r.equip.includes('multicooker'))) v.push('equipment');
  return v;
}

export const passesFilters = (r: Recipe, f: Filters): boolean => violations(r, f).length === 0;

export function activeGroups(f: Filters): FilterGroup[] {
  const g: FilterGroup[] = [];
  if (f.maxTime > 0) g.push('time');
  if (f.maxKcal > 0) g.push('kcal');
  if (f.highProtein) g.push('protein');
  if (f.diets.length) g.push('diets');
  if (f.cuisines.length) g.push('cuisine');
  if (f.types.length) g.push('type');
  if (f.difficulty.length) g.push('difficulty');
  if (f.noOven || f.onePan || f.multicooker) g.push('equipment');
  return g;
}

export function clearGroup(f: Filters, g: FilterGroup): Filters {
  switch (g) {
    case 'time': return { ...f, maxTime: 0 };
    case 'kcal': return { ...f, maxKcal: 0 };
    case 'protein': return { ...f, highProtein: false };
    case 'diets': return { ...f, diets: [] };
    case 'cuisine': return { ...f, cuisines: [] };
    case 'type': return { ...f, types: [] };
    case 'difficulty': return { ...f, difficulty: [] };
    case 'equipment': return { ...f, noOven: false, onePan: false, multicooker: false };
  }
}

/** Все рецепты, которые проходят и профиль, и фильтры. */
export function selectRecipes(recipes: readonly Recipe[], prefs: Prefs, f: Filters, hidden?: ReadonlySet<string>): Recipe[] {
  return recipes.filter((r) => passesProfile(r, prefs, hidden) && passesFilters(r, f));
}

/** Что будет, если снять одну группу фильтров: сколько блюд появится. Для экрана «ничего не найдено». */
export function relaxOptions(recipes: readonly Recipe[], prefs: Prefs, f: Filters, hidden?: ReadonlySet<string>): { group: FilterGroup; count: number }[] {
  return activeGroups(f)
    .map((group) => ({ group, count: selectRecipes(recipes, prefs, clearGroup(f, group), hidden).length }))
    .filter((o) => o.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** Ближайшие варианты: проходят профиль, нарушают как можно меньше фильтров. */
export function nearest(recipes: readonly Recipe[], prefs: Prefs, f: Filters, hidden?: ReadonlySet<string>, limit = 6): Recipe[] {
  return recipes
    .filter((r) => passesProfile(r, prefs, hidden))
    .map((r) => ({ r, v: violations(r, f).length }))
    .filter((x) => x.v > 0)
    .sort((a, b) => a.v - b.v || a.r.total - b.r.total)
    .slice(0, limit)
    .map((x) => x.r);
}
