// Проверяет базу (data/) и собирает из неё файлы для приложения (public/data/).
//   npm run data      — проверить и собрать
//   npm run validate  — только проверить
// Калории и БЖУ считаются здесь автоматически из ингредиентов, вручную их вписывать не нужно.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

// ---- настройки расчёта ----
export const FRY_OIL_ABSORBED = 0.5; // доля масла, которая остаётся в блюде при жарке на сковороде
export const DEEPFRY_OIL_ABSORBED = 0.12; // то же для фритюра
const KCAL_MIN = 50;
const KCAL_MAX = 1500;
const HIGH_PROTEIN_G = 30; // «высокий белок»: от 30 г белка на порцию
const LOW_CARB_G = 20; // «низкие углеводы»: до 20 г углеводов на порцию

const CUISINES = ['russian', 'german', 'italian', 'japanese', 'chinese', 'thai', 'korean', 'mexican', 'mideast', 'georgian', 'indian', 'mediterranean', 'international'];
const TYPES = ['breakfast', 'main', 'soup', 'salad', 'side', 'snack', 'dessert'];
const CATEGORIES = ['veg', 'fruit', 'herbs', 'meat', 'fish', 'dairy', 'grocery', 'bakery', 'canned', 'sauces', 'spices', 'nuts', 'baking', 'frozen', 'drinks'];
const EQUIPMENT = ['oven', 'onepan', 'multicooker'];
const MEASURE_UNITS = ['pc', 'clove', 'tbsp', 'tsp', 'cup', 'bunch', 'pinch', 'can', 'slice'];
const FLAGS = ['staple', 'meat', 'fish', 'shellfish', 'dairy', 'egg', 'honey', 'gluten', 'nuts', 'peanut', 'soy', 'sesame', 'mustard', 'celery'];
const ALLERGENS = ['gluten', 'dairy', 'egg', 'nuts', 'peanut', 'soy', 'sesame', 'fish', 'shellfish', 'mustard', 'celery'];

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const r1 = (n) => Math.round(n * 10) / 10;

// ---------- продукты ----------
const products = readJson(path.join(root, 'data', 'products.json'));
const byId = new Map();
const names = new Map();
for (const p of products) {
  if (!p.id) { err(`продукт без id: ${JSON.stringify(p).slice(0, 80)}`); continue; }
  if (byId.has(p.id)) err(`продукт ${p.id}: повторяющийся id`);
  byId.set(p.id, p);
  if (!p.name?.ru) err(`продукт ${p.id}: нет названия`);
  if (!CATEGORIES.includes(p.category)) err(`продукт ${p.id}: неизвестная категория «${p.category}»`);
  for (const k of ['kcal', 'protein', 'fat', 'carbs']) if (!(typeof p[k] === 'number' && p[k] >= 0)) err(`продукт ${p.id}: поле ${k} должно быть числом`);
  if (p.kcal > 900) err(`продукт ${p.id}: ${p.kcal} ккал на 100 г — так не бывает`);
  const est = 4 * p.protein + 9 * p.fat + 4 * p.carbs;
  if (p.kcal > 60 && !['spices', 'drinks'].includes(p.category) && Math.abs(est - p.kcal) / p.kcal > 0.35) warn(`продукт ${p.id}: калории (${p.kcal}) плохо сходятся с БЖУ (≈${Math.round(est)})`);
  for (const f of p.flags || []) if (!FLAGS.includes(f)) err(`продукт ${p.id}: неизвестный флаг ${f}`);
  if (p.piece && !(MEASURE_UNITS.includes(p.piece.unit) && p.piece.grams > 0)) err(`продукт ${p.id}: неверное поле piece`);
  for (const n of [p.name?.ru, ...(p.synonyms?.ru || [])]) {
    if (!n) continue;
    const k = norm(n);
    if (names.has(k) && names.get(k) !== p.id) err(`название «${n}» есть у двух продуктов: ${names.get(k)} и ${p.id}`);
    names.set(k, p.id);
  }
}
for (const p of products) for (const s of p.substitutes || []) if (!byId.has(s)) err(`продукт ${p.id}: замена «${s}» не найдена`);

// ---------- рецепты ----------
const recipesDir = path.join(root, 'data', 'recipes');
const photosPath = path.join(root, 'data', 'photos.json');
const photos = fs.existsSync(photosPath) ? readJson(photosPath) : {};
const out = [];
const seenIds = new Set();
const seenNames = new Map();
const seenSets = new Map();
const liquids = new Set();

for (const file of fs.readdirSync(recipesDir).filter((f) => f.endsWith('.json')).sort()) {
  let list;
  try { list = readJson(path.join(recipesDir, file)); } catch (e) { err(`${file}: файл не читается как JSON (${e.message})`); continue; }
  for (const r of list) {
    const id = r.id || '(без id)';
    const e = (m) => err(`${file} → ${id}: ${m}`);
    if (!/^[a-z0-9-]+$/.test(r.id || '')) e('id должен состоять из латинских букв, цифр и дефисов');
    if (seenIds.has(r.id)) e('повторяющийся id');
    seenIds.add(r.id);
    if (!r.name?.ru?.trim()) e('нет названия');
    if (!r.description?.ru?.trim()) e('нет описания');
    if (!CUISINES.includes(r.cuisine)) e(`неизвестная кухня «${r.cuisine}»`);
    if (!TYPES.includes(r.type)) e(`неизвестный тип блюда «${r.type}»`);
    if (![1, 2, 3].includes(r.difficulty)) e('сложность должна быть 1, 2 или 3');
    if (!(r.servings >= 1 && r.servings <= 16)) e('число порций должно быть от 1 до 16');
    if (!(r.activeMinutes > 0 && r.totalMinutes >= r.activeMinutes)) e('время: активное должно быть больше 0 и не больше общего');
    if (r.totalMinutes > 600) e('общее время больше 10 часов');
    for (const q of r.equipment || []) if (!EQUIPMENT.includes(q)) e(`неизвестное оборудование «${q}»`);
    if (!Array.isArray(r.steps) || r.steps.length < 2) e('нужно минимум 2 шага');
    for (const [i, s] of (r.steps || []).entries()) {
      if (!s?.text?.ru || s.text.ru.trim().length < 8) e(`шаг ${i + 1} пустой или слишком короткий`);
      if (s.timerMinutes != null && !(s.timerMinutes > 0 && s.timerMinutes <= 600)) e(`шаг ${i + 1}: неверный таймер`);
    }
    if (!Array.isArray(r.ingredients) || r.ingredients.length < 2) e('нужно минимум 2 ингредиента');

    const nameKey = norm(r.name?.ru || '');
    if (seenNames.has(nameKey)) e(`дубликат названия (уже есть в ${seenNames.get(nameKey)})`);
    seenNames.set(nameKey, id);

    const total = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
    const flags = new Set();
    const used = new Set();
    const ingredients = [];
    for (const ing of r.ingredients || []) {
      const p = byId.get(ing.product);
      if (!p) { e(`ингредиент «${ing.product}» не найден в справочнике продуктов`); continue; }
      if (used.has(p.id)) e(`ингредиент ${p.id} указан дважды`);
      used.add(p.id);
      if (!(ing.amount > 0)) e(`ингредиент ${p.id}: количество должно быть больше 0`);
      if (!['g', 'ml'].includes(ing.unit)) e(`ингредиент ${p.id}: единица должна быть g или ml`);
      if (ing.measure && !(MEASURE_UNITS.includes(ing.measure.unit) && ing.measure.qty > 0)) e(`ингредиент ${p.id}: неверная мера`);
      if (ing.use && !['fry', 'deepfry'].includes(ing.use)) e(`ингредиент ${p.id}: use может быть только fry или deepfry`);
      const grams = ing.unit === 'ml' ? ing.amount * (p.density ?? 1) : ing.amount;
      for (const f of p.flags || []) flags.add(f);
      if (!ing.optional) {
        const k = (ing.use === 'fry' ? FRY_OIL_ABSORBED : ing.use === 'deepfry' ? DEEPFRY_OIL_ABSORBED : 1) * grams / 100;
        total.kcal += p.kcal * k; total.protein += p.protein * k; total.fat += p.fat * k; total.carbs += p.carbs * k;
      }
      const o = { p: p.id, g: r1(grams) };
      if (ing.unit === 'ml') { o.ml = ing.amount; liquids.add(p.id); }
      if (ing.measure) o.m = [ing.measure.qty, ing.measure.unit];
      if (ing.optional) o.opt = true;
      ingredients.push(o);
    }
    const setKey = [...used].sort().join(',');
    if (used.size >= 4 && seenSets.has(setKey)) warn(`${id}: тот же набор ингредиентов, что и у ${seenSets.get(setKey)} — возможно, дубликат`);
    seenSets.set(setKey, id);

    const s = r.servings || 1;
    const kcal = Math.round(total.kcal / s);
    if (!(kcal >= KCAL_MIN && kcal <= KCAL_MAX)) e(`нереалистичные калории: ${kcal} ккал на порцию (допустимо ${KCAL_MIN}–${KCAL_MAX})`);
    const protein = r1(total.protein / s), fat = r1(total.fat / s), carbs = r1(total.carbs / s);

    const diets = [];
    const noMeat = !flags.has('meat') && !flags.has('fish') && !flags.has('shellfish');
    if (noMeat) diets.push('vegetarian');
    if (noMeat && !flags.has('dairy') && !flags.has('egg') && !flags.has('honey')) diets.push('vegan');
    if (!flags.has('gluten')) diets.push('glutenFree');
    if (!flags.has('dairy')) diets.push('lactoseFree');
    if (protein >= HIGH_PROTEIN_G) diets.push('highProtein');
    if (carbs <= LOW_CARB_G) diets.push('lowCarb');

    const photo = photos[r.id];
    if (photo && !fs.existsSync(path.join(root, 'public', 'photos', photo.file))) warn(`${id}: в photos.json указан файл ${photo.file}, но его нет в public/photos`);

    out.push({
      id: r.id, cuisine: r.cuisine, type: r.type, name: r.name, desc: r.description,
      active: r.activeMinutes, total: r.totalMinutes, diff: r.difficulty, servings: s,
      equip: r.equipment || [], emoji: r.emoji || '🍽️',
      kcal, protein, fat, carbs, diets, allergens: ALLERGENS.filter((a) => flags.has(a)),
      ing: ingredients,
      steps: r.steps.map((st) => (st.timerMinutes ? { t: st.text, timer: st.timerMinutes } : { t: st.text })),
      ...(photo && fs.existsSync(path.join(root, 'public', 'photos', photo.file)) ? { photo: photo.file } : {}),
    });
  }
}

if (out.length < 400) warn(`в базе ${out.length} рецептов — по ТЗ нужно не меньше 400`);

// ---------- итог ----------
for (const w of warnings) console.warn('предупреждение:', w);
if (errors.length) {
  for (const m of errors) console.error('ОШИБКА:', m);
  console.error(`\nНайдено ошибок: ${errors.length}. База не собрана.`);
  process.exit(1);
}
const withPhoto = out.filter((r) => r.photo).length;
console.log(`База в порядке: ${out.length} рецептов, ${products.length} продуктов, с фото: ${withPhoto}, предупреждений: ${warnings.length}.`);

if (!checkOnly) {
  const dest = path.join(root, 'public', 'data');
  fs.mkdirSync(dest, { recursive: true });
  const prodOut = products.map((p) => ({
    id: p.id, name: p.name, syn: p.synonyms, cat: p.category,
    ...(p.piece ? { piece: [p.piece.unit, p.piece.grams] } : {}),
    ...(p.flags ? { flags: p.flags } : {}), ...(liquids.has(p.id) ? { liq: true, density: p.density ?? 1 } : {}), ...(p.substitutes ? { subs: p.substitutes } : {}),
  }));
  const credits = Object.entries(photos)
    .filter(([id]) => out.find((r) => r.id === id)?.photo)
    .map(([id, ph]) => ({ id, author: ph.author, license: ph.license, licenseUrl: ph.licenseUrl, source: ph.source }));
  fs.writeFileSync(path.join(dest, 'recipes.json'), JSON.stringify(out));
  fs.writeFileSync(path.join(dest, 'products.json'), JSON.stringify(prodOut));
  fs.writeFileSync(path.join(dest, 'credits.json'), JSON.stringify(credits));
  fs.writeFileSync(path.join(root, 'data', 'no-photo.txt'), out.filter((r) => !r.photo).map((r) => `${r.id}\t${r.name.ru}`).join('\n') + '\n');
}
