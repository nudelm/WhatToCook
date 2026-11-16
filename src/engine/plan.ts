// План на неделю: автозаполнение и сбор списка покупок. Чистые функции без React и хранилища — их удобно тестировать.
import type { Recipe } from '../types';
import { rng, shuffle } from './today';

export interface ShoppingItem {
  /** id продукта */
  p: string;
  /** граммы; 0 — количество не указано */
  g: number;
  done: boolean;
  /** из каких рецептов добавлено вручную (кнопкой в рецепте) */
  from: string[];
  /** сколько граммов из g добавил план на неделю — чтобы повторный сбор покупок не удваивал количество */
  plan?: number;
  /** блюда плана, для которых нужен продукт */
  planFrom?: string[];
}

/** 7 дней с понедельника по воскресенье; в каждом — id блюд. */
export type WeekPlan = string[][];

export const DAYS = 7;
export const emptyPlan = (): WeekPlan => Array.from({ length: DAYS }, () => []);

/** Приводит сохранённое значение к правильному виду (7 дней, только строки). */
export function normalizePlan(v: unknown): WeekPlan {
  const plan = emptyPlan();
  if (!Array.isArray(v)) return plan;
  for (let d = 0; d < DAYS; d++) if (Array.isArray(v[d])) plan[d] = (v[d] as unknown[]).filter((x): x is string => typeof x === 'string');
  return plan;
}

/** Номер дня недели: понедельник — 0, воскресенье — 6. */
export const weekdayIndex = (d: Date): number => (d.getDay() + 6) % 7;

export const planIds = (plan: WeekPlan): string[] => plan.flat();

export function addToPlan(plan: WeekPlan, day: number, id: string): WeekPlan {
  return plan.map((list, d) => (d === day && !list.includes(id) ? [...list, id] : list));
}
export function removeFromPlan(plan: WeekPlan, day: number, id: string): WeekPlan {
  return plan.map((list, d) => (d === day ? list.filter((x) => x !== id) : list));
}
export function replaceInPlan(plan: WeekPlan, day: number, oldId: string, newId: string): WeekPlan {
  return plan.map((list, d) => {
    if (d !== day) return list;
    if (list.includes(newId)) return list.filter((x) => x !== oldId);
    return list.map((x) => (x === oldId ? newId : x));
  });
}

// Чем меньше число, тем охотнее блюдо берётся как «блюдо дня».
const TYPE_TIER: Record<string, number> = { main: 0, soup: 1, salad: 2, side: 3, breakfast: 3, snack: 4, dessert: 5 };

export interface AutoFillOptions {
  /** зерно случайности: одинаковое зерно — одинаковый план */
  seed: string;
  /** все рецепты по id — чтобы учесть кухни блюд, которые уже стоят в плане */
  byId?: ReadonlyMap<string, Recipe>;
  /** true — собрать неделю заново; иначе заполняются только пустые дни */
  overwrite?: boolean;
}

/**
 * «Заполнить неделю автоматически». pool — рецепты, уже прошедшие профиль (диеты, аллергии, «не ем») и фильтры,
 * поэтому в план не попадёт ничего запрещённого. В каждый пустой день ставится одно блюдо:
 * без повторов внутри недели, в первую очередь основные блюда, кухни чередуются как можно равномернее.
 * Если подходящих блюд меньше, чем пустых дней, оставшиеся дни остаются пустыми.
 */
export function autoFillWeek(pool: readonly Recipe[], plan: WeekPlan, opts: AutoFillOptions): WeekPlan {
  const result: WeekPlan = opts.overwrite ? emptyPlan() : normalizePlan(plan);
  const used = new Set(planIds(result));
  const cuisineCount = new Map<string, number>();
  const bump = (c: string | undefined) => { if (c) cuisineCount.set(c, (cuisineCount.get(c) ?? 0) + 1); };
  const cuisineOf = (id: string) => opts.byId?.get(id)?.cuisine ?? pool.find((r) => r.id === id)?.cuisine;
  for (const id of used) bump(cuisineOf(id));

  const cands = shuffle(pool, rng(opts.seed));
  let prevCuisine: string | undefined;
  for (let d = 0; d < DAYS; d++) {
    if (result[d].length) { prevCuisine = cuisineOf(result[d][result[d].length - 1]); continue; }
    let best: Recipe | undefined;
    let bestKey = Infinity;
    for (const [i, r] of cands.entries()) {
      if (used.has(r.id)) continue;
      // тип блюда важнее всего, затем редкость кухни на этой неделе, затем «не как вчера», затем случайный порядок
      const key = (TYPE_TIER[r.type] ?? 4) * 1e9 + (cuisineCount.get(r.cuisine) ?? 0) * 1e7 + (r.cuisine === prevCuisine ? 1e6 : 0) + i;
      if (key < bestKey) { bestKey = key; best = r; }
    }
    if (!best) break;
    result[d] = [best.id];
    used.add(best.id);
    bump(best.cuisine);
    prevCuisine = best.cuisine;
  }
  return result;
}

export interface PlanNeed {
  /** граммы на всю неделю */
  g: number;
  /** вклад каждого блюда: id рецепта → граммы за одно приготовление */
  by: Map<string, number>;
}

/**
 * Что нужно купить под план: ингредиенты всех дней складываются по продукту.
 * Необязательные ингредиенты и всё, что уже есть (отмечено в «Мои продукты» или входит в «Есть всегда»), пропускается.
 */
export function planNeeds(plan: WeekPlan, byId: ReadonlyMap<string, Recipe>, have: ReadonlySet<string>): { needs: Map<string, PlanNeed>; times: Map<string, number> } {
  const times = new Map<string, number>();
  for (const id of planIds(plan)) if (byId.has(id)) times.set(id, (times.get(id) ?? 0) + 1);
  const needs = new Map<string, PlanNeed>();
  for (const [id, n] of times) {
    for (const i of byId.get(id)!.ing) {
      if (i.opt || have.has(i.p)) continue;
      const need = needs.get(i.p) ?? { g: 0, by: new Map<string, number>() };
      need.g += i.g * n;
      need.by.set(id, (need.by.get(id) ?? 0) + i.g);
      needs.set(i.p, need);
    }
  }
  return { needs, times };
}

export interface PlanShoppingResult {
  list: ShoppingItem[];
  /** новых строк в списке */
  added: number;
  /** строк, где изменилось количество */
  updated: number;
  /** строк, которые план добавил раньше, а теперь они не нужны */
  removed: number;
}

/**
 * «Собрать покупки»: добавляет в список покупок всё, что нужно под план, и не дублирует уже добавленное:
 *  • повторное нажатие заменяет прежний вклад плана, а не прибавляет его ещё раз;
 *  • если блюдо уже добавили в покупки со страницы рецепта, его продукты второй раз не считаются;
 *  • то, что пользователь добавил сам, сохраняется, количество суммируется;
 *  • продукт, который план добавил раньше и который больше не нужен, убирается.
 */
export function mergePlanIntoShopping(shopping: readonly ShoppingItem[], plan: WeekPlan, byId: ReadonlyMap<string, Recipe>, have: ReadonlySet<string>): PlanShoppingResult {
  const { needs, times } = planNeeds(plan, byId, have);
  const list: ShoppingItem[] = [];
  const seen = new Set<string>();
  let added = 0, updated = 0, removed = 0;

  /** Сколько граммов продукта должен дать план, если часть блюд уже добавлена вручную. */
  const planGrams = (need: PlanNeed | undefined, from: readonly string[]): { g: number; ids: string[] } => {
    if (!need) return { g: 0, ids: [] };
    let g = 0;
    const ids: string[] = [];
    for (const [id, grams] of need.by) {
      const n = (times.get(id) ?? 0) - (from.includes(id) ? 1 : 0);
      if (n > 0) { g += grams * n; ids.push(id); }
    }
    return { g: Math.round(g), ids };
  };
  const strip = (it: ShoppingItem): ShoppingItem => ({ p: it.p, g: it.g, done: it.done, from: it.from });

  for (const it of shopping) {
    seen.add(it.p);
    const prev = it.plan ?? 0;
    const next = planGrams(needs.get(it.p), it.from);
    if (next.g === prev) {
      list.push(next.g ? { ...it, planFrom: next.ids } : strip(it));
      continue;
    }
    const base = Math.max(0, it.g - prev);
    const g = base + next.g;
    if (next.g === 0 && base === 0 && it.from.length === 0) { removed++; continue; } // строку целиком создал план
    updated++;
    list.push(next.g
      ? { ...strip(it), g, done: g > it.g ? false : it.done, plan: next.g, planFrom: next.ids }
      : { ...strip(it), g });
  }
  for (const [p, need] of needs) {
    if (seen.has(p)) continue;
    const next = planGrams(need, []);
    if (!next.g) continue;
    list.push({ p, g: next.g, done: false, from: [], plan: next.g, planFrom: next.ids });
    added++;
  }
  return { list, added, updated, removed };
}
