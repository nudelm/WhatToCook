/** Текст по языкам: { ru: "...", de: "..." } */
export type L10n = Record<string, string>;

export interface Product {
  id: string;
  name: L10n;
  syn?: Record<string, string[]>;
  /** отдел магазина */
  cat: string;
  /** естественная счётная единица и её вес: ["pc", 110] */
  piece?: [string, number];
  flags?: string[];
  /** плотность, г/мл */
  density?: number;
  /** в рецептах измеряется в миллилитрах */
  liq?: boolean;
  /** чем можно заменить */
  subs?: string[];
}

export interface Ingredient {
  /** id продукта */
  p: string;
  /** граммы на весь рецепт */
  g: number;
  /** миллилитры (для жидкостей) */
  ml?: number;
  /** удобная мера: [2, "tbsp"] */
  m?: [number, string];
  opt?: boolean;
}

export interface Step {
  t: L10n;
  /** таймер в минутах */
  timer?: number;
}

export interface Recipe {
  id: string;
  cuisine: string;
  type: string;
  name: L10n;
  desc: L10n;
  active: number;
  total: number;
  diff: 1 | 2 | 3;
  servings: number;
  equip: string[];
  emoji: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  diets: string[];
  allergens: string[];
  ing: Ingredient[];
  steps: Step[];
  photo?: string;
  // ---- только у соусов (type: 'sauce'); калории и БЖУ — на порцию соуса ----
  /** к чему подходит: meat, chicken, rice, pasta… */
  pairs?: string[];
  /** без готовки: смешать за 10 минут */
  nocook?: boolean;
  /** вес порции соуса, г */
  portion?: number;
  // ---- только у обычных блюд ----
  /** основа блюда в тех же тегах (мясо, рис, паста…) — для подсказки соуса */
  base?: string[];
  /** блюдо уже с соусом — соус не предлагаем */
  sauced?: boolean;
}

export interface PhotoCredit {
  id: string;
  author: string;
  license: string;
  licenseUrl: string;
  source: string;
}
