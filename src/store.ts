// Всё, что приложение помнит о пользователе, лежит здесь и сохраняется только на устройстве (localStorage).
import { useSyncExternalStore } from 'react';
import { emptyFilters, emptyPrefs, type Filters, type Prefs } from './engine/filters';
import { emptyAlways, type AlwaysPrefs } from './engine/pantry';
import { addToPlan, emptyPlan, normalizePlan, removeFromPlan, replaceInPlan, type ShoppingItem, type WeekPlan } from './engine/plan';

export type { ShoppingItem };


export interface TodayState {
  /** ключ: день + время суток + фильтры + профиль; если изменился, подборка собирается заново */
  key: string;
  /** сколько раз нажали «Показать другие» */
  n: number;
  ids: string[];
  /** что уже показывали сегодня в предыдущих подборках */
  prev: string[];
}

export interface State {
  onboarded: boolean;
  theme: 'auto' | 'light' | 'dark';
  lang: string;
  prefs: Prefs;
  /** цель по калориям в день; 0 — не задана */
  kcalGoal: number;
  filters: Filters;
  favorites: string[];
  hidden: string[];
  pantry: string[];
  /** «Есть всегда»: что добавлено к списку по умолчанию и что из него выключено */
  always: AlwaysPrefs;
  /** план на неделю: 7 дней (пн–вс), в каждом id блюд */
  plan: WeekPlan;
  shopping: ShoppingItem[];
  /** id рецепта → номер дня, когда он последний раз был в подборке «Сегодня» */
  shown: Record<string, number>;
  today: TodayState | null;
  installDismissed: boolean;
}

const KEY = 'chto-prigotovit:v1';

const defaults: State = {
  onboarded: false, theme: 'auto', lang: 'ru', prefs: emptyPrefs, kcalGoal: 0, filters: emptyFilters,
  favorites: [], hidden: [], pantry: [], always: emptyAlways, plan: emptyPlan(), shopping: [], shown: {}, today: null, installDismissed: false,
};

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const p = JSON.parse(raw) as Partial<State>;
    return { ...defaults, ...p, prefs: { ...emptyPrefs, ...p.prefs }, filters: { ...emptyFilters, ...p.filters }, always: { ...emptyAlways, ...p.always }, plan: normalizePlan(p.plan) };
  } catch {
    return defaults;
  }
}

let state: State = load();
const listeners = new Set<() => void>();

export const getState = (): State => state;

export function update(change: Partial<State> | ((s: State) => Partial<State>)): void {
  const patch = typeof change === 'function' ? change(state) : change;
  state = { ...state, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* хранилище недоступно — работаем без сохранения */ }
  listeners.forEach((l) => l());
}

export function resetAll(): void {
  state = { ...defaults, onboarded: true };
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  update({});
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export const useStore = (): State => useSyncExternalStore(subscribe, getState);

// ---------- действия ----------
const toggle = <T,>(arr: readonly T[], v: T): T[] => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
export { toggle };

export const toggleFavorite = (id: string) => update((s) => ({ favorites: toggle(s.favorites, id) }));
export const hideRecipe = (id: string) => update((s) => ({ hidden: s.hidden.includes(id) ? s.hidden : [...s.hidden, id], favorites: s.favorites.filter((x) => x !== id) }));
export const unhideRecipe = (id: string) => update((s) => ({ hidden: s.hidden.filter((x) => x !== id) }));
export const togglePantry = (id: string) => update((s) => ({ pantry: toggle(s.pantry, id) }));
/** Включает или выключает продукт в «Есть всегда». isDefault — входит ли он в список по умолчанию. */
export const toggleAlways = (id: string, isDefault: boolean) => update((s) => (isDefault
  ? { always: { ...s.always, off: toggle(s.always.off, id) } }
  : { always: { ...s.always, on: toggle(s.always.on, id) } }));
export const planAdd = (day: number, id: string) => update((s) => ({ plan: addToPlan(s.plan, day, id) }));
export const planRemove = (day: number, id: string) => update((s) => ({ plan: removeFromPlan(s.plan, day, id) }));
export const planReplace = (day: number, oldId: string, newId: string) => update((s) => ({ plan: replaceInPlan(s.plan, day, oldId, newId) }));
export const setFilters = (f: Filters) => update({ filters: f });
export const setPrefs = (p: Partial<Prefs>) => update((s) => ({ prefs: { ...s.prefs, ...p } }));

/** Добавляет продукты в список покупок; одинаковые продукты складываются. */
export function addToShopping(items: { p: string; g: number }[], recipeId?: string): void {
  update((s) => {
    const list = s.shopping.map((x) => ({ ...x }));
    for (const it of items) {
      const ex = list.find((x) => x.p === it.p);
      if (ex) {
        ex.g = ex.done ? it.g : ex.g + it.g;
        ex.done = false;
        if (recipeId && !ex.from.includes(recipeId)) ex.from.push(recipeId);
      } else {
        list.push({ p: it.p, g: it.g, done: false, from: recipeId ? [recipeId] : [] });
      }
    }
    return { shopping: list };
  });
}
export const toggleShopping = (p: string) => update((s) => ({ shopping: s.shopping.map((x) => (x.p === p ? { ...x, done: !x.done } : x)) }));
export const removeBought = () => update((s) => ({ shopping: s.shopping.filter((x) => !x.done) }));
export const clearShopping = () => update({ shopping: [] });
