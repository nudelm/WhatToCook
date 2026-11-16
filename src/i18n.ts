// Все тексты интерфейса лежат в src/locales/<язык>.json. Чтобы добавить язык:
// 1) скопируйте ru.json в, например, de.json и переведите; 2) добавьте его в dictionaries и LANGS ниже.
import ru from './locales/ru.json';
import type { L10n } from './types';

type Dict = { [key: string]: string | Dict };
const dictionaries: Record<string, Dict> = { ru };

export const LANGS: { id: string; label: string }[] = [{ id: 'ru', label: 'Русский' }];

let lang = 'ru';
export function setLang(l: string): void {
  lang = dictionaries[l] ? l : 'ru';
  document.documentElement.lang = lang;
}
export const getLang = (): string => lang;

function lookup(key: string): string | Dict | undefined {
  let node: string | Dict | undefined = dictionaries[lang];
  for (const part of key.split('.')) {
    if (typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}

function fill(s: string, params?: Record<string, string | number>): string {
  return params ? s.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? '')) : s;
}

/** Перевод по ключу: t('today.title'). Параметры подставляются в {фигурные скобки}. */
export function t(key: string, params?: Record<string, string | number>): string {
  const v = lookup(key);
  return typeof v === 'string' ? fill(v, params) : key;
}

/** Перевод с числом: «1 рецепт», «2 рецепта», «5 рецептов». В JSON — объект { one, few, many, other }. */
export function tn(key: string, n: number, params?: Record<string, string | number>): string {
  const v = lookup(key);
  if (typeof v !== 'object') return key;
  const form = new Intl.PluralRules(lang).select(n);
  const s = v[form] ?? v.other ?? v.many;
  return typeof s === 'string' ? fill(s, { n, ...params }) : key;
}

/** Текст из базы (название рецепта, шаг, продукт) на текущем языке, с запасным русским. */
export const L = (v: L10n | undefined): string => v?.[lang] ?? v?.ru ?? '';
