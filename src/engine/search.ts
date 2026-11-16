import type { Product, Recipe } from '../types';

/** Приводим к нижнему регистру, «ё» → «е», убираем лишние пробелы. */
export const norm = (s: string): string => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

function productNames(p: Product, lang: string): string[] {
  return [p.name[lang] ?? p.name.ru, ...(p.syn?.[lang] ?? p.syn?.ru ?? [])];
}

/**
 * Подсказки при вводе продукта. Понимает синонимы («картошка» → картофель) и начало любого слова.
 * Чем точнее совпадение, тем выше в списке.
 */
export function searchProducts(products: readonly Product[], query: string, lang = 'ru', limit = 8): Product[] {
  const q = norm(query);
  if (!q) return [];
  const scored: { p: Product; score: number }[] = [];
  for (const p of products) {
    let best = 0;
    for (const [i, raw] of productNames(p, lang).entries()) {
      const n = norm(raw);
      let s = 0;
      if (n === q) s = 100;
      else if (n.startsWith(q)) s = 80;
      else if (n.split(/[\s-]/).some((w) => w.startsWith(q))) s = 60;
      else if (q.length >= 3 && n.includes(q)) s = 40;
      if (s && i > 0) s -= 5; // синоним чуть ниже основного названия
      if (s > best) best = s;
    }
    if (best) scored.push({ p, score: best });
  }
  return scored
    .sort((a, b) => b.score - a.score || (a.p.name[lang] ?? a.p.name.ru).length - (b.p.name[lang] ?? b.p.name.ru).length)
    .slice(0, limit)
    .map((x) => x.p);
}

/** Поиск по каталогу: по названию блюда и по названиям ингредиентов (с синонимами). */
export function searchRecipes(recipes: readonly Recipe[], products: ReadonlyMap<string, Product>, query: string, lang = 'ru'): Recipe[] {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return [...recipes];
  const scored: { r: Recipe; score: number }[] = [];
  for (const r of recipes) {
    const name = norm(r.name[lang] ?? r.name.ru);
    let score = 0;
    let ok = true;
    for (const w of words) {
      if (name.includes(w)) { score += name.startsWith(w) ? 3 : 2; continue; }
      const inIng = r.ing.some((i) => {
        const p = products.get(i.p);
        return !!p && productNames(p, lang).some((n) => norm(n).split(/[\s-]/).some((x) => x.startsWith(w)));
      });
      if (inIng) { score += 1; continue; }
      ok = false;
      break;
    }
    if (ok) scored.push({ r, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((x) => x.r);
}
