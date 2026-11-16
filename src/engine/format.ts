import type { Ingredient } from '../types';

const FRACTIONS: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' };

/** 1.5 → «1½», 0.25 → «¼», 2 → «2», 1.3 → «1,3» */
export function niceNumber(n: number): string {
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 100) / 100;
  const f = FRACTIONS[String(frac)];
  if (frac === 0) return String(whole);
  if (f) return whole ? `${whole}${f}` : f;
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

/** Округление веса до «человеческих» значений: 7 → 7, 43 → 45, 312 → 310, 1240 → 1250 */
export function roundAmount(v: number): number {
  if (v < 10) return Math.max(0.5, Math.round(v * 2) / 2);
  if (v < 100) return Math.round(v / 5) * 5;
  if (v < 1000) return Math.round(v / 10) * 10;
  return Math.round(v / 50) * 50;
}

/** Меру в штуках/ложках округляем до четвертей, чтобы не получалось «1,37 ст. л.». */
export function roundMeasure(q: number): number {
  return Math.max(0.25, Math.round(q * 4) / 4);
}

export function formatWeight(v: number, small: string, big: string): string {
  const r = roundAmount(v);
  if (r >= 1000) return `${String(Math.round(r / 100) / 10).replace('.', ',')} ${big}`;
  return `${String(r).replace('.', ',')} ${small}`;
}

export interface IngredientText {
  /** основная запись: «2 ст. л.» или «300 г» */
  main: string;
  /** уточнение в граммах: «≈ 30 г» */
  sub?: string;
}

/**
 * Количество ингредиента с пересчётом на нужное число порций.
 * @param factor выбранные порции / порции в рецепте
 * @param unit функция перевода единиц: unit('tbsp') → «ст. л.»
 */
export function formatIngredient(ing: Ingredient, factor: number, unit: (u: string) => string): IngredientText {
  const grams = formatWeight(ing.g * factor, unit('g'), unit('kg'));
  if (ing.m) {
    const [qty, u] = ing.m;
    const main = `${niceNumber(roundMeasure(qty * factor))} ${unit(u)}`;
    return u === 'pinch' ? { main } : { main, sub: `≈ ${grams}` };
  }
  if (ing.ml != null) return { main: formatWeight(ing.ml * factor, unit('ml'), unit('l')) };
  return { main: grams };
}

export function formatMinutes(min: number, m: string, h: string): string {
  if (min < 60) return `${min} ${m}`;
  const hours = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${hours} ${h} ${rest} ${m}` : `${hours} ${h}`;
}
