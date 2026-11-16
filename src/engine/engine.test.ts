import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Product, Recipe } from '../types';
import { activeGroups, clearGroup, emptyFilters, emptyPrefs, nearest, passesFilters, passesProfile, relaxOptions, selectRecipes, violations, type Filters } from './filters';
import { matchRecipe, rankByPantry } from './pantry';
import { dayNumber, dayPart, pickToday, surprise } from './today';
import { searchProducts, searchRecipes } from './search';
import { formatIngredient, niceNumber, roundAmount } from './format';

// ---------- маленькая тестовая база ----------
const P = (id: string, ru: string, extra: Partial<Product> = {}): Product => ({ id, name: { ru }, cat: 'veg', ...extra });
const productList: Product[] = [
  P('salt', 'соль', { flags: ['staple'] }),
  P('water', 'вода', { flags: ['staple'] }),
  P('oil', 'масло растительное', { flags: ['staple'] }),
  P('potato', 'картофель', { syn: { ru: ['картошка'] } }),
  P('onion', 'лук репчатый', { syn: { ru: ['лук'] }, subs: ['leek'] }),
  P('leek', 'лук-порей'),
  P('cream', 'сливки', { flags: ['dairy'], subs: ['sour_cream'] }),
  P('sour_cream', 'сметана', { flags: ['dairy'] }),
  P('chicken', 'куриное филе', { flags: ['meat'] }),
  P('pasta', 'макароны', { flags: ['gluten'] }),
  P('egg', 'яйца', { flags: ['egg'] }),
  P('tomato', 'помидоры', { syn: { ru: ['томаты'] } }),
  P('peanut', 'арахис', { flags: ['peanut'] }),
  P('cheese', 'сыр', { flags: ['dairy'] }),
];
const products = new Map(productList.map((p) => [p.id, p]));

const R = (id: string, o: Partial<Recipe> & { ings: (string | [string, 'opt'])[] }): Recipe => ({
  id, cuisine: 'russian', type: 'main', name: { ru: id }, desc: { ru: '' }, active: 10, total: 30, diff: 1, servings: 2, equip: [], emoji: '🍽️',
  kcal: 500, protein: 20, fat: 20, carbs: 50, diets: [], allergens: [], steps: [{ t: { ru: 'шаг' } }],
  ...o,
  ing: o.ings.map((x) => (Array.isArray(x) ? { p: x[0], g: 10, opt: true } : { p: x, g: 100 })),
});

const creamyChicken = R('creamy-chicken', { ings: ['chicken', 'cream', 'onion', 'salt', 'oil'], allergens: ['dairy'], diets: ['glutenFree', 'highProtein', 'lowCarb'], protein: 45, carbs: 8, kcal: 520, total: 25, equip: ['onepan'] });
const pastaTomato = R('pasta-tomato', { name: { ru: 'Паста с томатами' }, cuisine: 'italian', ings: ['pasta', 'tomato', 'onion', 'salt', 'water', ['cheese', 'opt']], allergens: ['gluten', 'dairy'], diets: ['vegetarian'], kcal: 430, total: 20, protein: 14 });
const potatoSoup = R('potato-soup', { name: { ru: 'Картофельный суп' }, type: 'soup', cuisine: 'german', ings: ['potato', 'onion', 'water', 'salt'], diets: ['vegetarian', 'vegan', 'glutenFree', 'lactoseFree'], kcal: 210, total: 40, protein: 5, equip: ['onepan', 'multicooker'] });
const omelette = R('omelette', { name: { ru: 'Омлет' }, type: 'breakfast', ings: ['egg', 'oil', 'salt'], allergens: ['egg'], diets: ['vegetarian', 'glutenFree', 'lactoseFree', 'lowCarb'], kcal: 300, total: 10, protein: 19, carbs: 2 });
const bakedPotato = R('baked-potato', { name: { ru: 'Печёный картофель' }, type: 'side', cuisine: 'international', ings: ['potato', 'oil', 'salt'], diets: ['vegetarian', 'vegan', 'glutenFree', 'lactoseFree'], kcal: 280, total: 70, equip: ['oven'], diff: 2 });
const peanutSalad = R('peanut-salad', { type: 'salad', cuisine: 'thai', ings: ['tomato', 'peanut', 'onion'], allergens: ['peanut'], diets: ['vegetarian', 'vegan', 'glutenFree', 'lactoseFree'], kcal: 250, total: 15, diff: 3 });
const all = [creamyChicken, pastaTomato, potatoSoup, omelette, bakedPotato, peanutSalad];
const ids = (rs: Recipe[]) => rs.map((r) => r.id).sort();
const F = (o: Partial<Filters>): Filters => ({ ...emptyFilters, ...o });

// ---------- фильтры ----------
describe('фильтры', () => {
  it('без фильтров проходят все', () => expect(selectRecipes(all, emptyPrefs, emptyFilters)).toHaveLength(all.length));
  it('время: до 15, 30, 60 минут', () => {
    expect(ids(selectRecipes(all, emptyPrefs, F({ maxTime: 15 })))).toEqual(['omelette', 'peanut-salad']);
    expect(ids(selectRecipes(all, emptyPrefs, F({ maxTime: 30 })))).toEqual(['creamy-chicken', 'omelette', 'pasta-tomato', 'peanut-salad']);
    expect(selectRecipes(all, emptyPrefs, F({ maxTime: 60 }))).toHaveLength(5);
  });
  it('граница времени включается', () => expect(passesFilters(creamyChicken, F({ maxTime: 25 }))).toBe(true));
  it('калории на порцию', () => {
    expect(ids(selectRecipes(all, emptyPrefs, F({ maxKcal: 400 })))).toEqual(['baked-potato', 'omelette', 'peanut-salad', 'potato-soup']);
    expect(selectRecipes(all, emptyPrefs, F({ maxKcal: 600 }))).toHaveLength(6);
  });
  it('высокий белок — от 30 г', () => expect(ids(selectRecipes(all, emptyPrefs, F({ highProtein: true })))).toEqual(['creamy-chicken']));
  it('диеты: нужны все выбранные', () => {
    expect(ids(selectRecipes(all, emptyPrefs, F({ diets: ['vegan'] })))).toEqual(['baked-potato', 'peanut-salad', 'potato-soup']);
    expect(ids(selectRecipes(all, emptyPrefs, F({ diets: ['vegetarian', 'lowCarb'] })))).toEqual(['omelette']);
    expect(ids(selectRecipes(all, emptyPrefs, F({ diets: ['glutenFree', 'lactoseFree'] })))).toEqual(['baked-potato', 'omelette', 'peanut-salad', 'potato-soup']);
  });
  it('кухня и тип: достаточно любой из выбранных', () => {
    expect(ids(selectRecipes(all, emptyPrefs, F({ cuisines: ['italian', 'german'] })))).toEqual(['pasta-tomato', 'potato-soup']);
    expect(ids(selectRecipes(all, emptyPrefs, F({ types: ['soup', 'salad'] })))).toEqual(['peanut-salad', 'potato-soup']);
  });
  it('сложность', () => expect(ids(selectRecipes(all, emptyPrefs, F({ difficulty: [2, 3] })))).toEqual(['baked-potato', 'peanut-salad']));
  it('оборудование: без духовки, одна сковорода, мультиварка', () => {
    expect(selectRecipes(all, emptyPrefs, F({ noOven: true })).map((r) => r.id)).not.toContain('baked-potato');
    expect(ids(selectRecipes(all, emptyPrefs, F({ onePan: true })))).toEqual(['creamy-chicken', 'potato-soup']);
    expect(ids(selectRecipes(all, emptyPrefs, F({ multicooker: true })))).toEqual(['potato-soup']);
  });
  it('фильтры комбинируются', () => {
    expect(ids(selectRecipes(all, emptyPrefs, F({ maxTime: 30, maxKcal: 400, diets: ['vegetarian'] })))).toEqual(['omelette', 'peanut-salad']);
    expect(selectRecipes(all, emptyPrefs, F({ maxTime: 15, highProtein: true }))).toEqual([]);
  });
  it('violations называет нарушенные группы', () => {
    expect(violations(bakedPotato, F({ maxTime: 30, noOven: true, cuisines: ['italian'] })).sort()).toEqual(['cuisine', 'equipment', 'time']);
  });
  it('activeGroups и clearGroup согласованы', () => {
    const f = F({ maxTime: 30, maxKcal: 400, highProtein: true, diets: ['vegan'], cuisines: ['thai'], types: ['soup'], difficulty: [1], onePan: true });
    expect(activeGroups(f)).toHaveLength(8);
    let cleared = f;
    for (const g of activeGroups(f)) cleared = clearGroup(cleared, g);
    expect(cleared).toEqual(emptyFilters);
  });
});

// ---------- профиль и исключения ----------
describe('профиль и исключения', () => {
  it('аллергены убирают блюда', () => {
    expect(passesProfile(peanutSalad, { ...emptyPrefs, allergens: ['peanut'] })).toBe(false);
    expect(selectRecipes(all, { ...emptyPrefs, allergens: ['dairy'] }, emptyFilters).map((r) => r.id)).not.toContain('creamy-chicken');
  });
  it('исключённый продукт убирает блюдо, даже если он необязательный', () => {
    expect(passesProfile(pastaTomato, { ...emptyPrefs, excluded: ['cheese'] })).toBe(false);
    expect(ids(selectRecipes(all, { ...emptyPrefs, excluded: ['onion'] }, emptyFilters))).toEqual(['baked-potato', 'omelette']);
  });
  it('диета профиля действует вместе с фильтрами', () => {
    expect(ids(selectRecipes(all, { ...emptyPrefs, diets: ['vegan'] }, F({ maxTime: 30 })))).toEqual(['peanut-salad']);
  });
  it('скрытые блюда не показываются', () => expect(passesProfile(omelette, emptyPrefs, new Set(['omelette']))).toBe(false));
  it('ближайшие варианты никогда не нарушают профиль', () => {
    const prefs = { ...emptyPrefs, allergens: ['peanut'], excluded: ['egg'] };
    const near = nearest(all, prefs, F({ maxTime: 5 }));
    expect(near.length).toBeGreaterThan(0);
    for (const r of near) expect(passesProfile(r, prefs)).toBe(true);
  });
});

// ---------- «ничего не найдено» ----------
describe('ослабление фильтров', () => {
  const f = F({ maxTime: 15, highProtein: true });
  it('предлагает, какой фильтр снять, и сколько блюд появится', () => {
    expect(selectRecipes(all, emptyPrefs, f)).toEqual([]);
    expect(relaxOptions(all, emptyPrefs, f)).toEqual([{ group: 'protein', count: 2 }, { group: 'time', count: 1 }]);
  });
  it('ближайшие сортируются по числу нарушений', () => {
    const near = nearest(all, emptyPrefs, f);
    expect(violations(near[0], f).length).toBe(1);
    expect(violations(near[near.length - 1], f).length).toBeGreaterThanOrEqual(1);
  });
});

// ---------- «У меня есть» ----------
describe('поиск по продуктам', () => {
  it('считает долю обязательных ингредиентов, базовые считает имеющимися', () => {
    const m = matchRecipe(creamyChicken, new Set(['chicken']), products);
    expect(m.total).toBe(5); // курица, сливки, лук, соль, масло
    expect(m.have).toBe(3); // курица + соль + масло
    expect(m.pct).toBe(60);
    expect(m.missing.sort()).toEqual(['cream', 'onion']);
    expect(m.status).toBe('almost');
  });
  it('100 % — когда всё есть', () => {
    const m = matchRecipe(creamyChicken, new Set(['chicken', 'cream', 'onion']), products);
    expect(m.pct).toBe(100);
    expect(m.status).toBe('ready');
    expect(m.missing).toEqual([]);
  });
  it('необязательные ингредиенты не влияют', () => {
    const m = matchRecipe(pastaTomato, new Set(['pasta', 'tomato', 'onion']), products);
    expect(m.total).toBe(5);
    expect(m.pct).toBe(100);
  });
  it('замены: сметана вместо сливок, порей вместо лука', () => {
    const m = matchRecipe(creamyChicken, new Set(['chicken', 'sour_cream', 'leek']), products);
    expect(m.pct).toBe(100);
    expect(m.subs).toEqual([{ missing: 'cream', with: 'sour_cream' }, { missing: 'onion', with: 'leek' }]);
  });
  it('«почти готово» — не хватает не больше двух', () => {
    expect(matchRecipe(pastaTomato, new Set(['pasta']), products).status).toBe('almost');
    expect(matchRecipe(R('big', { ings: ['pasta', 'tomato', 'onion', 'egg', 'chicken'] }), new Set(['pasta']), products).status).toBe('partial');
  });
  it('сортировка: процент, потом число недостающих', () => {
    const ranked = rankByPantry(all, new Set(['potato', 'onion']), products);
    expect(ranked[0].recipe.id).toBe('potato-soup'); // оба по 100 %, суп готовится быстрее
    expect(ranked.slice(0, 2).map((x) => x.recipe.id).sort()).toEqual(['baked-potato', 'potato-soup']);
    for (let i = 1; i < ranked.length; i++) {
      const a = ranked[i - 1].match, b = ranked[i].match;
      expect(a.pct > b.pct || (a.pct === b.pct && a.missing.length <= b.missing.length)).toBe(true);
    }
  });
  it('не показывает рецепты, где совпали только базовые продукты', () => {
    const ranked = rankByPantry(all, new Set(['tomato']), products);
    expect(ranked.map((x) => x.recipe.id)).not.toContain('omelette');
    expect(rankByPantry(all, new Set(), products)).toEqual([]);
  });
});

// ---------- подсказки и синонимы ----------
describe('поиск и синонимы', () => {
  it('находит по синониму', () => {
    expect(searchProducts(productList, 'картошка')[0].id).toBe('potato');
    expect(searchProducts(productList, 'томат')[0].id).toBe('tomato');
  });
  it('подсказывает по началу слова и не различает ё/е, регистр', () => {
    expect(searchProducts(productList, 'КАРТ')[0].id).toBe('potato');
    expect(searchProducts(productList, 'пор').map((p) => p.id)).toContain('leek');
    expect(searchProducts(productList, 'лук').map((p) => p.id)).toEqual(expect.arrayContaining(['onion', 'leek']));
  });
  it('пустой запрос — пустой список', () => expect(searchProducts(productList, '  ')).toEqual([]));
  it('каталог ищет по названию и по ингредиентам', () => {
    expect(searchRecipes(all, products, 'суп').map((r) => r.id)).toEqual(['potato-soup']);
    expect(ids(searchRecipes(all, products, 'картошка'))).toEqual(['baked-potato', 'potato-soup']);
    expect(searchRecipes(all, products, 'паста томат')[0].id).toBe('pasta-tomato');
  });
});

// ---------- подборка «Сегодня» ----------
describe('подборка на сегодня', () => {
  it('время суток', () => {
    expect(dayPart(7)).toBe('morning');
    expect(dayPart(13)).toBe('day');
    expect(dayPart(19)).toBe('evening');
    expect(dayPart(23)).toBe('night');
    expect(dayPart(3)).toBe('night');
  });
  const pool: Recipe[] = [];
  for (let i = 0; i < 40; i++) pool.push(R(`main-${i}`, { ings: ['potato'], cuisine: ['russian', 'italian', 'german', 'thai', 'indian'][i % 5] }));
  for (let i = 0; i < 10; i++) pool.push(R(`soup-${i}`, { ings: ['potato'], type: 'soup', cuisine: 'german' }));
  for (let i = 0; i < 10; i++) pool.push(R(`bf-${i}`, { ings: ['egg'], type: 'breakfast' }));

  it('утром предлагает завтраки, вечером — нет', () => {
    expect(pickToday(pool, { hour: 8, seed: 'a' }).every((r) => r.type === 'breakfast')).toBe(true);
    expect(pickToday(pool, { hour: 19, seed: 'a' }).some((r) => r.type === 'breakfast')).toBe(false);
  });
  it('одно зерно — одна подборка, другое зерно — другая', () => {
    const a = pickToday(pool, { hour: 13, seed: '2026-01-01#0' });
    expect(pickToday(pool, { hour: 13, seed: '2026-01-01#0' })).toEqual(a);
    expect(pickToday(pool, { hour: 13, seed: '2026-01-01#1' })).not.toEqual(a);
  });
  it('даёт 3–5 блюд без повторов и не больше одного супа', () => {
    const p = pickToday(pool, { hour: 13, seed: 'x', count: 5 });
    expect(p).toHaveLength(5);
    expect(new Set(p.map((r) => r.id)).size).toBe(5);
    expect(p.filter((r) => r.type === 'soup').length).toBeLessThanOrEqual(1);
  });
  it('избегает блюд, показанных за последние 7 дней', () => {
    const recent = new Set(pool.filter((r) => r.type !== 'breakfast').slice(0, 40).map((r) => r.id));
    for (const seed of ['a', 'b', 'c', 'd']) {
      for (const r of pickToday(pool, { hour: 13, seed, recent })) expect(recent.has(r.id)).toBe(false);
    }
  });
  it('если свежих не хватает, добирает из недавних, а не показывает пусто', () => {
    const recent = new Set(pool.map((r) => r.id));
    expect(pickToday(pool, { hour: 13, seed: 'a', recent })).toHaveLength(4);
  });
  it('если подходящих по времени суток мало, берёт из всех', () => {
    expect(pickToday([creamyChicken, pastaTomato, potatoSoup], { hour: 8, seed: 'a', count: 3 })).toHaveLength(3);
  });
  it('«Удиви меня» выбирает из пула и предпочитает свежее', () => {
    expect(surprise([], new Set())).toBeUndefined();
    const r = surprise(all, new Set(all.slice(1).map((x) => x.id)), () => 0.99);
    expect(r?.id).toBe(all[0].id);
  });
  it('номер дня растёт на 1 за сутки', () => {
    expect(dayNumber(new Date(2026, 0, 2, 12)) - dayNumber(new Date(2026, 0, 1, 12))).toBe(1);
  });
});

// ---------- пересчёт порций ----------
describe('количества и порции', () => {
  const unit = (u: string) => ({ g: 'г', kg: 'кг', ml: 'мл', l: 'л', tbsp: 'ст. л.', pc: 'шт.', pinch: 'щепотка' }[u] ?? u);
  it('дроби', () => {
    expect(niceNumber(0.5)).toBe('½');
    expect(niceNumber(1.5)).toBe('1½');
    expect(niceNumber(2)).toBe('2');
    expect(niceNumber(1.3)).toBe('1,3');
  });
  it('округление веса', () => {
    expect(roundAmount(43)).toBe(45);
    expect(roundAmount(312)).toBe(310);
    expect(roundAmount(1240)).toBe(1250);
  });
  it('пересчёт на другое число порций', () => {
    expect(formatIngredient({ p: 'x', g: 300 }, 2, unit)).toEqual({ main: '600 г' });
    expect(formatIngredient({ p: 'x', g: 600 }, 2, unit)).toEqual({ main: '1,2 кг' });
    expect(formatIngredient({ p: 'x', g: 30, m: [2, 'tbsp'] }, 1.5, unit)).toEqual({ main: '3 ст. л.', sub: '≈ 45 г' });
    expect(formatIngredient({ p: 'x', g: 110, m: [1, 'pc'] }, 0.5, unit)).toEqual({ main: '½ шт.', sub: '≈ 55 г' });
    expect(formatIngredient({ p: 'x', g: 515, ml: 500 }, 3, unit)).toEqual({ main: '1,5 л' });
  });
});

// ---------- проверки на настоящей базе ----------
const dbPath = path.resolve(__dirname, '../../public/data/recipes.json');
describe.skipIf(!fs.existsSync(dbPath))('настоящая база рецептов', () => {
  const recipes: Recipe[] = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf8')) : [];
  const prods: Product[] = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/data/products.json'), 'utf8')) : [];
  const pm = new Map(prods.map((p) => [p.id, p]));

  it('не меньше 400 рецептов и 300 продуктов', () => {
    expect(recipes.length).toBeGreaterThanOrEqual(400);
    expect(prods.length).toBeGreaterThanOrEqual(300);
  });
  it('веганские блюда не содержат мяса, рыбы, молочного и яиц', () => {
    for (const r of recipes.filter((x) => x.diets.includes('vegan'))) {
      for (const i of r.ing) {
        const flags = pm.get(i.p)?.flags ?? [];
        expect(flags.some((f) => ['meat', 'fish', 'shellfish', 'dairy', 'egg', 'honey'].includes(f)), `${r.id}: ${i.p}`).toBe(false);
      }
    }
  });
  it('блюда «без глютена» не содержат продуктов с глютеном', () => {
    for (const r of recipes.filter((x) => x.diets.includes('glutenFree'))) {
      for (const i of r.ing) expect(pm.get(i.p)?.flags?.includes('gluten') ?? false, `${r.id}: ${i.p}`).toBe(false);
    }
  });
  it('каждый отдельный фильтр что-то находит', () => {
    const variants: Partial<Filters>[] = [
      { maxTime: 15 }, { maxTime: 30 }, { maxTime: 60 }, { maxKcal: 400 }, { maxKcal: 600 }, { maxKcal: 800 }, { highProtein: true },
      { diets: ['vegetarian'] }, { diets: ['vegan'] }, { diets: ['glutenFree'] }, { diets: ['lactoseFree'] }, { diets: ['lowCarb'] },
      { difficulty: [1] }, { difficulty: [2] }, { difficulty: [3] }, { noOven: true }, { onePan: true }, { multicooker: true },
    ];
    for (const v of variants) expect(selectRecipes(recipes, emptyPrefs, F(v)).length, JSON.stringify(v)).toBeGreaterThan(5);
  });
  it('подборка есть в любое время суток даже для веганов', () => {
    const pool = selectRecipes(recipes, { ...emptyPrefs, diets: ['vegan'] }, emptyFilters);
    for (const hour of [7, 13, 19, 23]) expect(pickToday(pool, { hour, seed: 's' }).length).toBeGreaterThanOrEqual(3);
  });
  it('«курица, рис, лук» даёт готовые или почти готовые блюда', () => {
    const ranked = rankByPantry(recipes, new Set(['chicken_breast', 'rice', 'onion', 'garlic', 'carrot']), pm);
    expect(ranked.length).toBeGreaterThan(20);
    expect(ranked[0].match.pct).toBeGreaterThanOrEqual(70);
    expect(ranked.some((x) => x.match.status !== 'partial')).toBe(true);
  });
});
