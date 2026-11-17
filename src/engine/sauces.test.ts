import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Product, Recipe } from '../types';
import { emptyFilters, emptyPrefs, isSauce, selectRecipes, type Filters } from './filters';
import { alwaysHave } from './pantry';
import { autoFillWeek, emptyPlan, mergePlanIntoShopping, planIds } from './plan';
import { PAIRS, pairOverlap, rankSaucesByPantry, selectSauces, suggestSauces } from './sauces';
import { pickToday, surprise } from './today';

const P = (id: string, extra: Partial<Product> = {}): Product => ({ id, name: { ru: id }, cat: 'veg', ...extra });
const products = new Map([
  P('salt', { flags: ['staple'] }), P('oil', { flags: ['staple'] }),
  P('yogurt', { flags: ['dairy'] }), P('garlic'), P('dill'), P('soy'), P('honey', { flags: ['honey'] }),
  P('peanut_butter', { flags: ['peanut'] }), P('tomato'), P('cream', { flags: ['dairy'] }), P('mayo', { flags: ['egg'] }),
  P('chicken', { flags: ['meat'] }), P('rice'), P('potato'), P('pasta', { flags: ['gluten'] }),
].map((p) => [p.id, p]));

const base = { cuisine: 'international', name: { ru: 'x' }, desc: { ru: '' }, active: 5, total: 5, diff: 1 as const, servings: 4, equip: [], emoji: '🥣', protein: 2, fat: 5, carbs: 3, steps: [{ t: { ru: 'шаг' } }] };
const ing = (ids: string[]) => ids.map((p) => ({ p, g: 50 }));
const S = (id: string, pairs: string[], ids: string[], o: Partial<Recipe> = {}): Recipe => ({
  ...base, id, type: 'sauce', kcal: 80, pairs, nocook: true, portion: 45, diets: ['vegetarian', 'glutenFree'], allergens: [], ing: ing(ids), ...o,
});
const D = (id: string, b: string[], ids: string[], o: Partial<Recipe> = {}): Recipe => ({
  ...base, id, type: 'main', total: 30, kcal: 550, protein: 30, fat: 20, carbs: 50, base: b, diets: [], allergens: [], ing: ing(ids), ...o,
});

const yogurtGarlic = S('yogurt-garlic', ['meat', 'chicken', 'potato'], ['yogurt', 'garlic', 'dill', 'salt'], { allergens: ['dairy'] });
const teriyaki = S('teriyaki', ['chicken', 'rice', 'fish'], ['soy', 'honey', 'garlic'], { nocook: false, total: 8, diets: ['vegetarian'] });
const peanut = S('peanut', ['rice', 'chicken', 'noodles'], ['peanut_butter', 'soy', 'garlic'], { allergens: ['peanut'], diets: ['vegetarian', 'vegan'] });
const tomatoSauce = S('tomato', ['pasta', 'rice'], ['tomato', 'garlic', 'oil', 'salt'], { nocook: false, total: 15, diets: ['vegetarian', 'vegan', 'glutenFree'] });
const creamy = S('creamy', ['pasta', 'potato'], ['cream', 'garlic', 'salt'], { nocook: false, total: 10, kcal: 200, allergens: ['dairy'] });
const mayoDip = S('mayo-dip', ['potato', 'fish'], ['mayo', 'garlic'], { kcal: 240, allergens: ['egg'] });
const sauces = [yogurtGarlic, teriyaki, peanut, tomatoSauce, creamy, mayoDip];

const chickenRice = D('chicken-rice', ['chicken', 'rice'], ['chicken', 'rice', 'salt']);
const pastaDish = D('pasta-plain', ['pasta'], ['pasta', 'salt'], { diets: ['vegetarian', 'vegan'] });
const saucedDish = D('chicken-in-sauce', ['chicken', 'rice'], ['chicken', 'cream', 'rice'], { sauced: true });
const soup = D('soup', [], ['potato', 'salt'], { type: 'soup' });
const dishes = [chickenRice, pastaDish, saucedDish, soup];
const F = (o: Partial<Filters>): Filters => ({ ...emptyFilters, ...o });

describe('подбор соуса к блюду по тегам', () => {
  it('предлагает до 3 соусов, у каждого есть общий тег с основой блюда', () => {
    const list = suggestSauces(chickenRice, sauces, { prefs: emptyPrefs });
    expect(list.length).toBe(3);
    for (const s of list) expect(pairOverlap(s, chickenRice.base!), s.id).toBeGreaterThan(0);
    expect(list.map((s) => s.id)).not.toContain('creamy'); // ни курицы, ни риса
  });
  it('соусы с двумя совпадениями и без готовки идут первыми', () => {
    const [first] = suggestSauces(chickenRice, sauces, { prefs: emptyPrefs });
    expect(first.id).toBe('peanut'); // курица + рис + без готовки
  });
  it('приоритет соусам, которые получаются из продуктов пользователя', () => {
    const pantry = new Set(['soy', 'honey', 'garlic']);
    const list = suggestSauces(chickenRice, sauces, { prefs: emptyPrefs, pantry, products, always: alwaysHave(products.values()), limit: 2 });
    expect(list[0].id).toBe('teriyaki'); // всё есть дома — обгоняет арахисовый без готовки
  });
  it('блюдо уже с соусом, суп и сам соус — без подсказки', () => {
    expect(suggestSauces(saucedDish, sauces, { prefs: emptyPrefs })).toEqual([]);
    expect(suggestSauces(soup, sauces, { prefs: emptyPrefs })).toEqual([]);
    expect(suggestSauces(teriyaki, sauces, { prefs: emptyPrefs })).toEqual([]);
  });
  it('учитывает профиль: аллергии и «не ем»', () => {
    const list = suggestSauces(chickenRice, sauces, { prefs: { ...emptyPrefs, allergens: ['peanut'], excluded: ['honey'] } });
    expect(list.map((s) => s.id)).toEqual(['yogurt-garlic', 'tomato']);
  });
  it('к веганскому блюду — сначала веганский соус', () => {
    expect(suggestSauces(pastaDish, sauces, { prefs: emptyPrefs })[0].id).toBe('tomato');
  });
  it('пустой подбор — пустой список', () => {
    const eggs = D('eggs', ['eggs'], ['salt']);
    expect(suggestSauces(eggs, sauces, { prefs: emptyPrefs })).toEqual([]);
  });
});

describe('экран «К чему соус?»', () => {
  it('без выбора основы — все соусы; блюда не попадают', () => {
    expect(selectSauces([...dishes, ...sauces], emptyPrefs, emptyFilters, { bases: [] })).toHaveLength(sauces.length);
  });
  it('несколько основ: подходит хотя бы к одной, больше совпадений — выше', () => {
    const list = selectSauces(sauces, emptyPrefs, emptyFilters, { bases: ['rice', 'chicken'] });
    expect(list.map((s) => s.id)).toEqual(['peanut', 'teriyaki', 'yogurt-garlic', 'tomato']);
  });
  it('«только без готовки»', () => {
    const list = selectSauces(sauces, emptyPrefs, emptyFilters, { bases: ['potato'], noCookOnly: true });
    expect(list.map((s) => s.id).sort()).toEqual(['mayo-dip', 'yogurt-garlic']);
  });
  it('работают фильтры времени, калорий и диет, а кухня и тип блюда не мешают', () => {
    expect(selectSauces(sauces, emptyPrefs, F({ maxTime: 5 }), { bases: [] }).every((s) => s.total <= 5)).toBe(true);
    expect(selectSauces(sauces, emptyPrefs, F({ maxKcal: 100 }), { bases: [] }).map((s) => s.id)).not.toContain('mayo-dip');
    expect(selectSauces(sauces, emptyPrefs, F({ diets: ['vegan'] }), { bases: [] }).map((s) => s.id).sort()).toEqual(['peanut', 'tomato']);
    expect(selectSauces(sauces, emptyPrefs, F({ types: ['main'], cuisines: ['italian'], onePan: true }), { bases: [] })).toHaveLength(sauces.length);
  });
  it('исключённые продукты и аллергии', () => {
    const list = selectSauces(sauces, { ...emptyPrefs, excluded: ['garlic'] }, emptyFilters, { bases: [] });
    expect(list).toHaveLength(0);
    expect(selectSauces(sauces, { ...emptyPrefs, allergens: ['dairy'] }, emptyFilters, { bases: [] }).map((s) => s.id)).not.toContain('creamy');
  });
});

describe('режим «У меня есть» для соусов', () => {
  const always = alwaysHave(products.values());
  it('процент совпадения и «не хватает»', () => {
    const ranked = rankSaucesByPantry(sauces, new Set(['yogurt', 'garlic', 'tomato']), products, always);
    const byId = new Map(ranked.map((x) => [x.recipe.id, x.match]));
    expect(byId.get('tomato')).toMatchObject({ pct: 100, missing: [], status: 'ready' });
    expect(byId.get('yogurt-garlic')).toMatchObject({ pct: 75, missing: ['dill'], status: 'almost' });
    expect(ranked[0].recipe.id).toBe('tomato');
  });
  it('пустые продукты — пустой список; блюда в выдачу не попадают', () => {
    expect(rankSaucesByPantry(sauces, new Set(), products, always)).toEqual([]);
    const ranked = rankSaucesByPantry([...dishes, ...sauces], new Set(['chicken', 'rice', 'garlic']), products, always);
    expect(ranked.every((x) => isSauce(x.recipe))).toBe(true);
  });
});

describe('соусы не становятся самостоятельными блюдами', () => {
  const pool = [...dishes, ...sauces];
  it('нет в подборке «Сегодня» ни в какое время суток', () => {
    for (const hour of [7, 13, 19, 23]) for (const seed of ['a', 'b', 'c']) {
      expect(pickToday(pool, { hour, seed, count: 4 }).some(isSauce)).toBe(false);
      expect(pickToday(pool, { hour, seed, count: 4, ignoreDayPart: true }).some(isSauce)).toBe(false);
    }
  });
  it('пул только из соусов — подборка пустая, «Удиви меня» ничего не даёт', () => {
    expect(pickToday(sauces, { hour: 13, seed: 'x' })).toEqual([]);
    expect(surprise(sauces, new Set())).toBeUndefined();
    for (let i = 0; i < 20; i++) expect(isSauce(surprise(pool, new Set())!)).toBe(false);
  });
  it('автозаполнение плана не ставит соусы', () => {
    const plan = autoFillWeek(pool, emptyPlan(), { seed: 'w' });
    const ids = planIds(plan);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(sauces.some((s) => s.id === id), id).toBe(false);
  });
  it('соус, поставленный в план вручную, попадает в список покупок', () => {
    const plan = emptyPlan();
    plan[0] = [teriyaki.id];
    const byId = new Map(pool.map((r) => [r.id, r]));
    const { list } = mergePlanIntoShopping([], plan, byId, new Set());
    expect(list.map((x) => x.p).sort()).toEqual(['garlic', 'honey', 'soy']);
  });
});

// ---------- настоящая база ----------
const data = path.resolve(__dirname, '../../public/data');
const hasDb = fs.existsSync(path.join(data, 'recipes.json'));
describe.skipIf(!hasDb)('соусы в настоящей базе', () => {
  const all: Recipe[] = hasDb ? JSON.parse(fs.readFileSync(path.join(data, 'recipes.json'), 'utf8')) : [];
  const prods: Product[] = hasDb ? JSON.parse(fs.readFileSync(path.join(data, 'products.json'), 'utf8')) : [];
  const pm = new Map(prods.map((p) => [p.id, p]));
  const real = all.filter(isSauce);
  const realDishes = all.filter((r) => !isSauce(r));

  it('не меньше 50 соусов; у каждого есть «подходит к», калории на порцию и вес порции', () => {
    expect(real.length).toBeGreaterThanOrEqual(50);
    for (const s of real) {
      expect(s.pairs?.length, s.id).toBeGreaterThan(0);
      for (const p of s.pairs!) expect(PAIRS, s.id).toContain(p);
      expect(s.kcal, s.id).toBeGreaterThanOrEqual(10);
      expect(s.kcal, s.id).toBeLessThanOrEqual(450);
      expect(s.portion, s.id).toBeGreaterThanOrEqual(30);
      expect(s.portion, s.id).toBeLessThanOrEqual(70);
      for (const i of s.ing) expect(pm.has(i.p), `${s.id}: ${i.p}`).toBe(true);
      if (s.nocook) expect(s.total, s.id).toBeLessThanOrEqual(10);
    }
  });
  it('к каждой основе есть хотя бы два соуса, и хотя бы 20 соусов без готовки', () => {
    for (const p of PAIRS) expect(real.filter((s) => s.pairs!.includes(p)).length, p).toBeGreaterThanOrEqual(2);
    expect(real.filter((s) => s.nocook).length).toBeGreaterThanOrEqual(20);
  });
  it('подборка «Сегодня» и автоплан на всей базе — без соусов', () => {
    for (const hour of [7, 13, 19, 23]) expect(pickToday(all, { hour, seed: 'real' }).some(isSauce)).toBe(false);
    const plan = autoFillWeek(selectRecipes(all, emptyPrefs, emptyFilters), emptyPlan(), { seed: 'real' });
    expect(planIds(plan).map((id) => all.find((r) => r.id === id)!).some(isSauce)).toBe(false);
  });
  it('у большинства блюд «без соуса» с основой есть подсказка, и она по тегам', () => {
    const eligible = realDishes.filter((d) => !d.sauced && d.base?.length);
    expect(eligible.length).toBeGreaterThan(50);
    let withSuggest = 0;
    for (const d of eligible) {
      const list = suggestSauces(d, real, { prefs: emptyPrefs });
      if (list.length >= 2) withSuggest++;
      for (const s of list) expect(pairOverlap(s, d.base!), `${d.id} → ${s.id}`).toBeGreaterThan(0);
    }
    expect(withSuggest / eligible.length).toBeGreaterThan(0.9);
    for (const d of realDishes.filter((x) => x.sauced || x.type === 'soup' || x.type === 'dessert')) expect(suggestSauces(d, real, { prefs: emptyPrefs }), d.id).toEqual([]);
  });
});
