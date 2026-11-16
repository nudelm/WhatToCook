import type { Recipe } from '../types';

export type DayPart = 'morning' | 'day' | 'evening' | 'night';

export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 16) return 'day';
  if (hour >= 16 && hour < 22) return 'evening';
  return 'night';
}

/** Какие типы блюд уместны в это время суток. */
export const MEAL_TYPES: Record<DayPart, string[]> = {
  morning: ['breakfast'],
  day: ['main', 'soup', 'salad'],
  evening: ['main', 'salad', 'soup'],
  night: ['snack', 'salad', 'breakfast'],
};

/** Номер дня от начала эпохи в местном времени — чтобы считать «7 дней назад». */
export function dayNumber(d: Date): number {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Детерминированный генератор случайных чисел: одинаковое зерно — одинаковая подборка. */
export function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: readonly T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface PickOptions {
  hour: number;
  /** зерно: дата + номер нажатия «Показать другие» */
  seed: string;
  /** id блюд, которые показывались за последние 7 дней */
  recent?: ReadonlySet<string>;
  count?: number;
  /** если пользователь сам выбрал типы блюд в фильтрах, время суток не учитываем */
  ignoreDayPart?: boolean;
}

/**
 * Подборка «Сегодня». pool — рецепты, уже прошедшие профиль и фильтры.
 * Берём блюда под время суток, избегаем показанных за последние 7 дней, стараемся не повторять кухню
 * и не давать больше одного супа и одного салата.
 */
export function pickToday(pool: readonly Recipe[], opts: PickOptions): Recipe[] {
  const count = opts.count ?? 4;
  const recent = opts.recent ?? new Set<string>();
  const rand = rng(opts.seed);
  const types = MEAL_TYPES[dayPart(opts.hour)];

  let cands = opts.ignoreDayPart ? [...pool] : pool.filter((r) => types.includes(r.type));
  if (cands.length < count) cands = [...pool];

  const fresh = shuffle(cands.filter((r) => !recent.has(r.id)), rand);
  const seen = shuffle(cands.filter((r) => recent.has(r.id)), rand);

  const picked: Recipe[] = [];
  const cuisines = new Set<string>();
  const perType = new Map<string, number>();
  const typeLimit = (t: string) => (t === 'main' || t === 'breakfast' || opts.ignoreDayPart ? count : 1);

  // Сначала свежие (с разнообразием, потом любые), и только если их не хватает — недавние.
  for (const list of [fresh, seen]) {
    for (const strict of [true, false]) {
      for (const r of list) {
        if (picked.length >= count) return picked;
        if (picked.includes(r)) continue;
        if (strict && (cuisines.has(r.cuisine) || (perType.get(r.type) ?? 0) >= typeLimit(r.type))) continue;
        picked.push(r);
        cuisines.add(r.cuisine);
        perType.set(r.type, (perType.get(r.type) ?? 0) + 1);
      }
    }
  }
  return picked;
}

/** «Удиви меня»: случайное блюдо из подходящих, по возможности не из недавних. */
export function surprise(pool: readonly Recipe[], recent: ReadonlySet<string>, rand: () => number = Math.random): Recipe | undefined {
  if (!pool.length) return undefined;
  const fresh = pool.filter((r) => !recent.has(r.id));
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(rand() * from.length)];
}
