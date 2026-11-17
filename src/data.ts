// Загрузка базы рецептов и продуктов (файлы собирает scripts/build-data.mjs в public/data).
import { createContext, useContext } from 'react';
import { isSauce } from './engine/filters';
import type { PhotoCredit, Product, Recipe } from './types';

export interface Db {
  /** только самостоятельные блюда — на них работают «Сегодня», каталог, «У меня есть» и автоплан */
  recipes: Recipe[];
  /** соусы (type: 'sauce') — отдельно, чтобы не смешивались с блюдами */
  sauces: Recipe[];
  /** все рецепты по id, и блюда, и соусы: избранное, план, покупки, страница рецепта */
  byId: Map<string, Recipe>;
  products: Product[];
  productMap: Map<string, Product>;
}

export const BASE = import.meta.env.BASE_URL;

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(`${BASE}data/${file}`);
  if (!res.ok) throw new Error(`${file}: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function loadDb(): Promise<Db> {
  const [all, products] = await Promise.all([getJson<Recipe[]>('recipes.json'), getJson<Product[]>('products.json')]);
  return {
    recipes: all.filter((r) => !isSauce(r)), sauces: all.filter(isSauce), byId: new Map(all.map((r) => [r.id, r])),
    products, productMap: new Map(products.map((p) => [p.id, p])),
  };
}

let creditsPromise: Promise<PhotoCredit[]> | null = null;
/** Авторы фото — нужны только на странице рецепта и в «О приложении», поэтому грузятся отдельно. */
export function loadCredits(): Promise<PhotoCredit[]> {
  creditsPromise ??= getJson<PhotoCredit[]>('credits.json').catch(() => { creditsPromise = null; return []; });
  return creditsPromise;
}

export const DbContext = createContext<Db | null>(null);
export function useDb(): Db {
  const db = useContext(DbContext);
  if (!db) throw new Error('База ещё не загружена');
  return db;
}
