import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Product, Recipe } from '../types';
import { emptyFilters, emptyPrefs, selectRecipes } from './filters';
import { alwaysHave, matchRecipe, rankByPantry } from './pantry';
import { addToPlan, autoFillWeek, emptyPlan, mergePlanIntoShopping, normalizePlan, planIds, planNeeds, removeFromPlan, replaceInPlan, weekdayIndex, type ShoppingItem, type WeekPlan } from './plan';

// ---------- маленькая тестовая база ----------
const P = (id: string, extra: Partial<Product> = {}): Product => ({ id, name: { ru: id }, cat: 'veg', ...extra });
const productList: Product[] = [
  P('salt', { flags: ['staple'] }), P('water', { flags: ['staple'] }), P('oil', { flags: ['staple'] }), P('olive_oil', { flags: ['staple'] }),
  P('potato'), P('onion'), P('garlic'), P('chicken', { flags: ['meat'] }), P('rice'), P('tomato'), P('pasta', { flags: ['gluten'] }),
  P('cheese', { flags: ['dairy'] }), P('peanut', { flags: ['peanut'] }), P('egg', { flags: ['egg'] }),
];
const products = new Map(productList.map((p) => [p.id, p]));

type Ing = [id: string, grams: number, opt?: 'opt'];
const R = (id: string, ing: Ing[], o: Partial<Recipe> = {}): Recipe => ({
  id, cuisine: 'russian', type: 'main', name: { ru: id }, desc: { ru: '' }, active: 10, total: 30, diff: 1, servings: 2, equip: [], emoji: '🍽️',
  kcal: 500, protein: 20, fat: 20, carbs: 50, diets: [], allergens: [], steps: [{ t: { ru: 'шаг' } }],
  ...o,
  ing: ing.map(([p, g, opt]) => (opt ? { p, g, opt: true } : { p, g })),
});

const pilaf = R('pilaf', [['chicken', 400], ['rice', 200], ['onion', 100], ['oil', 30], ['salt', 5]]);
const pasta = R('pasta', [['pasta', 200], ['tomato', 300], ['onion', 50], ['olive_oil', 20], ['cheese', 30, 'opt']], { cuisine: 'italian', allergens: ['gluten'], diets: ['vegetarian'] });
const soup = R('soup', [['potato', 400], ['onion', 100], ['water', 1000], ['salt', 5]], { cuisine: 'german', type: 'soup', diets: ['vegetarian', 'vegan'] });
const byId = new Map([pilaf, pasta, soup].map((r) => [r.id, r]));
const week = (...days: string[][]): WeekPlan => normalizePlan(days);
const staples = alwaysHave(productList);
const grams = (list: ShoppingItem[]) => Object.fromEntries(list.map((x) => [x.p, x.g]));

// ---------- «Есть всегда» ----------
describe('«есть всегда»', () => {
  it('по умолчанию — базовые продукты из справочника, включая оливковое масло', () => {
    expect([...staples].sort()).toEqual(['oil', 'olive_oil', 'salt', 'water']);
  });
  it('продукт из списка можно выключить, а свой — добавить', () => {
    const set = alwaysHave(productList, { on: ['garlic'], off: ['olive_oil'] });
    expect(set.has('garlic')).toBe(true);
    expect(set.has('olive_oil')).toBe(false);
    expect(set.has('salt')).toBe(true);
  });
  it('выключенный продукт перестаёт считаться имеющимся — процент совпадения падает', () => {
    const have = new Set(['pasta', 'tomato', 'onion']);
    expect(matchRecipe(pasta, have, products, staples).pct).toBe(100);
    const m = matchRecipe(pasta, have, products, alwaysHave(productList, { on: [], off: ['olive_oil'] }));
    expect(m.pct).toBe(75);
    expect(m.missing).toEqual(['olive_oil']);
    expect(m.status).toBe('almost');
  });
  it('добавленный продукт считается имеющимся — процент растёт, но в «совпало» не попадает', () => {
    const have = new Set(['chicken', 'rice']);
    expect(matchRecipe(pilaf, have, products, staples).pct).toBe(80);
    const m = matchRecipe(pilaf, have, products, alwaysHave(productList, { on: ['onion'], off: [] }));
    expect(m.pct).toBe(100);
    expect(m.matched).toBe(2);
    expect(m.status).toBe('ready');
  });
  it('без переданного списка работает как раньше — по флагу в справочнике', () => {
    expect(matchRecipe(pasta, new Set(['pasta', 'tomato', 'onion']), products).pct).toBe(100);
  });
  it('рейтинг по продуктам учитывает настройку', () => {
    const have = new Set(['pasta', 'tomato', 'onion']);
    expect(rankByPantry([pasta], have, products, staples)[0].match.status).toBe('ready');
    expect(rankByPantry([pasta], have, products, new Set<string>())[0].match.missing).toEqual(['olive_oil']);
  });
});

// ---------- правка плана ----------
describe('план: добавить, убрать, заменить', () => {
  it('пустой план — 7 пустых дней', () => {
    expect(emptyPlan()).toHaveLength(7);
    expect(planIds(emptyPlan())).toEqual([]);
  });
  it('испорченные сохранённые данные приводятся к 7 дням', () => {
    expect(normalizePlan(null)).toEqual(emptyPlan());
    expect(normalizePlan([['a'], 'x', [1, 'b']])).toEqual([['a'], [], ['b'], [], [], [], []]);
  });
  it('добавление в день, без дубля в том же дне', () => {
    let p = addToPlan(emptyPlan(), 2, 'pilaf');
    p = addToPlan(p, 2, 'pilaf');
    p = addToPlan(p, 2, 'soup');
    expect(p[2]).toEqual(['pilaf', 'soup']);
    expect(planIds(p)).toHaveLength(2);
  });
  it('удаление и замена', () => {
    const p = week(['pilaf', 'soup'], ['pasta']);
    expect(removeFromPlan(p, 0, 'pilaf')[0]).toEqual(['soup']);
    expect(replaceInPlan(p, 0, 'pilaf', 'pasta')[0]).toEqual(['pasta', 'soup']);
    expect(replaceInPlan(p, 0, 'pilaf', 'soup')[0]).toEqual(['soup']); // замена на блюдо, которое уже есть в этом дне
    expect(replaceInPlan(p, 0, 'pilaf', 'pasta')[1]).toEqual(['pasta']); // другие дни не трогаем
  });
  it('неделя начинается с понедельника', () => {
    expect(weekdayIndex(new Date(2026, 10, 16))).toBe(0); // понедельник
    expect(weekdayIndex(new Date(2026, 10, 22))).toBe(6); // воскресенье
  });
});

// ---------- автозаполнение ----------
describe('автозаполнение недели', () => {
  const cuisines = ['russian', 'german', 'italian', 'thai', 'mexican', 'indian', 'korean', 'japanese'];
  const pool: Recipe[] = [];
  for (const c of cuisines) for (let i = 0; i < 3; i++) pool.push(R(`${c}-${i}`, [['onion', 100]], { cuisine: c }));
  pool.push(R('dessert', [['egg', 100]], { type: 'dessert', cuisine: 'chinese' }), R('nutty', [['peanut', 50]], { cuisine: 'chinese', allergens: ['peanut'] }));
  const pm = new Map(pool.map((r) => [r.id, r]));
  const cuisineOf = (id: string) => pm.get(id)!.cuisine;

  it('заполняет все 7 дней по одному блюду, без повторов', () => {
    const p = autoFillWeek(pool, emptyPlan(), { seed: 'a' });
    expect(p.every((d) => d.length === 1)).toBe(true);
    expect(new Set(planIds(p)).size).toBe(7);
  });
  it('кухни не повторяются, пока их хватает', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const p = autoFillWeek(pool, emptyPlan(), { seed });
      expect(new Set(planIds(p).map(cuisineOf)).size, seed).toBe(7);
    }
  });
  it('берёт основные блюда, а не десерты', () => {
    for (const seed of ['a', 'b', 'c']) expect(planIds(autoFillWeek(pool, emptyPlan(), { seed }))).not.toContain('dessert');
  });
  it('учитывает профиль: аллергии, диеты и исключённые продукты', () => {
    const allowed = selectRecipes(pool, { diets: [], allergens: ['peanut'], excluded: [] }, emptyFilters);
    for (const seed of ['a', 'b', 'c', 'd', 'e']) expect(planIds(autoFillWeek(allowed, emptyPlan(), { seed }))).not.toContain('nutty');

    const noOnion = selectRecipes(pool, { ...emptyPrefs, excluded: ['onion'] }, emptyFilters);
    const p = autoFillWeek(noOnion, emptyPlan(), { seed: 'a' });
    expect(planIds(p).sort()).toEqual(['dessert', 'nutty']); // без лука остаются только эти два блюда
    expect(p.filter((d) => d.length === 0)).toHaveLength(5); // остальные дни пустые, а не с запрещёнными блюдами
  });
  it('учитывает фильтры', () => {
    const onlyThai = selectRecipes(pool, emptyPrefs, { ...emptyFilters, cuisines: ['thai'] });
    const p = autoFillWeek(onlyThai, emptyPlan(), { seed: 'a' });
    expect(planIds(p)).toHaveLength(3);
    expect(planIds(p).every((id) => cuisineOf(id) === 'thai')).toBe(true);
  });
  it('заполняет только пустые дни и не повторяет уже выбранное', () => {
    const start = week(['thai-0'], [], ['german-1', 'italian-2']);
    const p = autoFillWeek(pool, start, { seed: 'a', byId: pm });
    expect(p[0]).toEqual(['thai-0']);
    expect(p[2]).toEqual(['german-1', 'italian-2']);
    expect(new Set(planIds(p)).size).toBe(planIds(p).length);
    expect(planIds(p)).toHaveLength(8);
    // кухни уже выбранных блюд на остальные дни по возможности не берутся
    const added = [1, 3, 4, 5, 6].map((d) => cuisineOf(p[d][0]));
    expect(added).not.toContain('thai');
    expect(added).not.toContain('german');
    expect(added).not.toContain('italian');
  });
  it('overwrite собирает неделю заново', () => {
    const p = autoFillWeek(pool, week(['dessert'], ['dessert']), { seed: 'a', overwrite: true });
    expect(planIds(p)).toHaveLength(7);
    expect(planIds(p)).not.toContain('dessert');
  });
  it('одно зерно — один и тот же план; исходный план не меняется', () => {
    const start = emptyPlan();
    expect(autoFillWeek(pool, start, { seed: 'x' })).toEqual(autoFillWeek(pool, start, { seed: 'x' }));
    expect(start).toEqual(emptyPlan());
  });
  it('пустой набор блюд — пустой план', () => expect(planIds(autoFillWeek([], emptyPlan(), { seed: 'a' }))).toEqual([]));
});

// ---------- сбор покупок ----------
describe('сбор покупок из плана', () => {
  it('складывает один продукт из разных блюд', () => {
    const { needs } = planNeeds(week(['pilaf'], ['pasta'], ['soup']), byId, new Set());
    expect(needs.get('onion')?.g).toBe(250);
    expect(needs.get('salt')?.g).toBe(10);
  });
  it('блюдо в плане дважды — продукты считаются дважды', () => {
    expect(planNeeds(week(['pilaf'], ['pilaf']), byId, new Set()).needs.get('rice')?.g).toBe(400);
  });
  it('не берёт необязательные ингредиенты, «мои продукты» и «есть всегда»', () => {
    const have = new Set([...staples, 'onion']);
    const res = mergePlanIntoShopping([], week(['pilaf'], ['pasta'], ['soup']), byId, have);
    expect(grams(res.list)).toEqual({ chicken: 400, rice: 200, pasta: 200, tomato: 300, potato: 400 });
    expect(res.added).toBe(5);
    expect(res.list.every((x) => !x.done && x.from.length === 0)).toBe(true);
  });
  it('выключенное в «есть всегда» масло попадает в покупки', () => {
    const have = alwaysHave(productList, { on: [], off: ['olive_oil'] });
    expect(grams(mergePlanIntoShopping([], week(['pasta']), byId, have).list).olive_oil).toBe(20);
  });
  it('повторное нажатие ничего не удваивает', () => {
    const plan = week(['pilaf'], ['soup']);
    const first = mergePlanIntoShopping([], plan, byId, staples);
    const second = mergePlanIntoShopping(first.list, plan, byId, staples);
    expect(grams(second.list)).toEqual(grams(first.list));
    expect(second).toMatchObject({ added: 0, updated: 0, removed: 0 });
  });
  it('купленное остаётся купленным, если план не изменился', () => {
    const plan = week(['soup']);
    const first = mergePlanIntoShopping([], plan, byId, staples).list.map((x) => ({ ...x, done: true }));
    expect(mergePlanIntoShopping(first, plan, byId, staples).list.every((x) => x.done)).toBe(true);
  });
  it('добавленное вручную сохраняется и суммируется с планом', () => {
    const manual: ShoppingItem[] = [{ p: 'onion', g: 300, done: false, from: [] }, { p: 'egg', g: 0, done: false, from: [] }];
    const res = mergePlanIntoShopping(manual, week(['soup']), byId, staples);
    expect(grams(res.list)).toEqual({ onion: 400, egg: 0, potato: 400 });
    expect(res).toMatchObject({ added: 1, updated: 1 });
    // и повторный сбор снова не удваивает
    expect(grams(mergePlanIntoShopping(res.list, week(['soup']), byId, staples).list).onion).toBe(400);
  });
  it('блюдо, уже добавленное в покупки со страницы рецепта, второй раз не считается', () => {
    const fromRecipe: ShoppingItem[] = [{ p: 'potato', g: 400, done: false, from: ['soup'] }, { p: 'onion', g: 100, done: false, from: ['soup'] }];
    const res = mergePlanIntoShopping(fromRecipe, week(['soup'], ['pilaf']), byId, staples);
    expect(grams(res.list)).toEqual({ potato: 400, onion: 200, chicken: 400, rice: 200 });
  });
  it('изменение плана обновляет количество, а не прибавляет', () => {
    const first = mergePlanIntoShopping([], week(['pilaf'], ['soup']), byId, staples);
    const res = mergePlanIntoShopping(first.list, week(['pilaf'], ['pasta']), byId, staples);
    expect(grams(res.list)).toEqual({ chicken: 400, rice: 200, onion: 150, pasta: 200, tomato: 300 });
    expect(res.removed).toBe(1); // картофель для супа больше не нужен
  });
  it('очистка плана убирает только то, что добавил план', () => {
    const manual: ShoppingItem[] = [{ p: 'onion', g: 300, done: false, from: [] }];
    const filled = mergePlanIntoShopping(manual, week(['soup']), byId, staples).list;
    const res = mergePlanIntoShopping(filled, emptyPlan(), byId, staples);
    expect(grams(res.list)).toEqual({ onion: 300 });
    expect(res.list[0].plan).toBeUndefined();
  });
  it('помнит, для каких блюд нужен продукт', () => {
    const res = mergePlanIntoShopping([], week(['pilaf'], ['soup']), byId, staples);
    expect(res.list.find((x) => x.p === 'onion')?.planFrom?.sort()).toEqual(['pilaf', 'soup']);
  });
  it('удалённый из базы рецепт в плане не ломает сбор', () => {
    expect(mergePlanIntoShopping([], week(['нет-такого']), byId, staples).list).toEqual([]);
  });
});

// ---------- проверки на настоящей базе ----------
const data = path.resolve(__dirname, '../../public/data');
const hasDb = fs.existsSync(path.join(data, 'recipes.json'));
describe.skipIf(!hasDb)('настоящая база', () => {
  const recipes: Recipe[] = hasDb ? JSON.parse(fs.readFileSync(path.join(data, 'recipes.json'), 'utf8')) : [];
  const prods: Product[] = hasDb ? JSON.parse(fs.readFileSync(path.join(data, 'products.json'), 'utf8')) : [];
  const pm = new Map(prods.map((p) => [p.id, p]));
  const rm = new Map(recipes.map((r) => [r.id, r]));

  it('в справочнике больше 300 продуктов, у всех есть отдел и название', () => {
    expect(prods.length).toBeGreaterThan(300);
    for (const p of prods) expect(p.name.ru && p.cat, p.id).toBeTruthy();
  });
  it('каждый ингредиент каждого рецепта есть в справочнике', () => {
    for (const r of recipes) for (const i of r.ing) expect(pm.has(i.p), `${r.id}: ${i.p}`).toBe(true);
  });
  it('оливковое масло по умолчанию входит в «есть всегда»', () => {
    const set = alwaysHave(prods);
    for (const id of ['olive_oil', 'veg_oil', 'salt', 'pepper', 'sugar', 'water']) expect(set.has(id), id).toBe(true);
  });
  it('неделя для вегана без глютена: 7 разных блюд, все подходят', () => {
    const prefs = { diets: ['vegan'], allergens: ['gluten'], excluded: ['mushrooms'] };
    const p = autoFillWeek(selectRecipes(recipes, prefs, emptyFilters), emptyPlan(), { seed: 'week', byId: rm });
    const picked = planIds(p).map((id) => rm.get(id)!);
    expect(picked).toHaveLength(7);
    expect(new Set(picked.map((r) => r.id)).size).toBe(7);
    for (const r of picked) {
      expect(r.diets, r.id).toContain('vegan');
      expect(r.allergens, r.id).not.toContain('gluten');
      expect(r.ing.some((i) => i.p === 'mushrooms'), r.id).toBe(false);
    }
  });
  it('обычная неделя: минимум 6 разных кухонь, покупки сгруппированы по известным отделам', () => {
    const p = autoFillWeek(recipes, emptyPlan(), { seed: 'week', byId: rm });
    expect(new Set(planIds(p).map((id) => rm.get(id)!.cuisine)).size).toBeGreaterThanOrEqual(6);
    const always = alwaysHave(prods);
    const { list } = mergePlanIntoShopping([], p, rm, always);
    expect(list.length).toBeGreaterThan(10);
    expect(new Set(list.map((x) => x.p)).size).toBe(list.length); // один продукт — одна строка
    for (const x of list) {
      expect(always.has(x.p), x.p).toBe(false);
      expect(pm.get(x.p)?.cat, x.p).toBeTruthy();
      expect(x.g).toBeGreaterThan(0);
    }
  });
});
