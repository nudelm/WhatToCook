// Загрузка базы рецептов и продуктов (файлы собирает scripts/build-data.mjs в public/data).
import { createContext, useContext } from 'react';
import type { PhotoCredit, Product, Recipe } from './types';

export interface Db {
  recipes: Recipe[];
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
  const [recipes, products] = await Promise.all([getJson<Recipe[]>('recipes.json'), getJson<Product[]>('products.json')]);
  return { recipes, byId: new Map(recipes.map((r) => [r.id, r])), products, productMap: new Map(products.map((p) => [p.id, p])) };
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
