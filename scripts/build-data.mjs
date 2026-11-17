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
// Жарка на сковороде: тонкий слой масла (до 10 г на порцию, около 2 ч. л.) целиком остаётся на еде;
// из налитого сверх этого в блюдо попадает половина, остальное остаётся на сковороде.
export const FRY_FULL_G_PER_SERVING = 10;
export const FRY_OIL_ABSORBED = 0.5;
export const DEEPFRY_OIL_ABSORBED = 0.12; // то же для фритюра
const KCAL_MIN = 50;
const KCAL_MAX = 1500;
const HIGH_PROTEIN_G = 30; // «высокий белок»: от 30 г белка на порцию
const LOW_CARB_G = 20; // «низкие углеводы»: до 20 г углеводов на порцию

// Соусы (type: "sauce"): калории и БЖУ — на порцию соуса 2–3 ст. л.; порцию задаёт число порций в рецепте.
const SAUCE_KCAL_MIN = 10;
const SAUCE_KCAL_MAX = 450;
const SAUCE_PORTION_G = [30, 70]; // допустимый вес одной порции соуса, г
const SAUCE_NOCOOK_MAX_MIN = 10; // «без готовки» — смешать за 10 минут
// К чему подходит соус. Те же теги автоматически вычисляются для обычных блюд (поле base) по их ингредиентам.
const PAIRS = ['meat', 'chicken', 'fish', 'seafood', 'rice', 'pasta', 'noodles', 'potato', 'grains', 'dumplings', 'veg', 'eggs', 'bread'];

const CUISINES = ['russian', 'german', 'italian', 'japanese', 'chinese', 'thai', 'korean', 'mexican', 'mideast', 'georgian', 'indian', 'mediterranean', 'international'];
const TYPES = ['breakfast', 'main', 'soup', 'salad', 'side', 'snack', 'dessert', 'sauce'];
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

// ---------- основа блюда для подбора соуса ----------
// Какие теги PAIRS есть у блюда: смотрим на ингредиенты с заметным весом на порцию.
const BASE_BY_ID = {
  rice: ['rice', 'round_rice', 'arborio', 'brown_rice'],
  pasta: ['spaghetti', 'pasta', 'lasagna_sheets', 'tortellini', 'gnocchi', 'spaetzle'],
  noodles: ['egg_noodles', 'wheat_noodles', 'rice_noodles', 'soba', 'glass_noodles', 'instant_noodles'],
  potato: ['potato', 'sweet_potato', 'french_fries', 'croquettes', 'rosti', 'potato_dumplings', 'schupfnudeln'],
  grains: ['buckwheat', 'bulgur', 'couscous', 'quinoa', 'millet', 'pearl_barley'],
  dumplings: ['pelmeni', 'vareniki', 'maultaschen'],
  bread: ['white_bread', 'rye_bread', 'baguette', 'bun', 'tortilla', 'lavash', 'pita', 'whole_grain_bread', 'naan', 'bagel', 'pretzel'],
  eggs: ['egg'],
};
const BASE_MIN_G = { rice: 40, pasta: 50, noodles: 40, potato: 100, grains: 40, dumplings: 100, bread: 50, eggs: 50, meat: 50, chicken: 50, fish: 50, seafood: 40, veg: 150 };
const productBase = new Map();
for (const [tag, ids] of Object.entries(BASE_BY_ID)) for (const id of ids) productBase.set(id, tag);
function baseTagOf(p) {
  if (productBase.has(p.id)) return productBase.get(p.id);
  if (/broth|stock|sauce/.test(p.id)) return null;
  if (/^(chicken|turkey)_/.test(p.id) && p.id !== 'chicken_liver') return 'chicken';
  if (p.flags?.includes('shellfish')) return 'seafood';
  if (p.flags?.includes('fish')) return 'fish';
  if (p.flags?.includes('meat')) return 'meat';
  if (p.category === 'veg' || p.id === 'tofu' || p.id === 'frozen_veg') return 'veg';
  return null;
}
// Продукты, которые сами по себе — соус или подлива: если их в блюде много, блюдо уже «с соусом».
const SAUCE_BASE = new Set(['passata', 'canned_tomato', 'tomato_sauce', 'coconut_milk', 'cream', 'cooking_cream', 'sour_cream', 'bechamel_ready', 'pesto', 'pesto_rosso', 'curry_paste', 'hollandaise', 'mayonnaise', 'teriyaki', 'bbq_sauce', 'hoisin', 'oyster_sauce', 'sweet_chili', 'tomato_paste', 'yogurt', 'greek_yogurt', 'tzatziki', 'aioli', 'remoulade', 'salsa', 'peanut_butter', 'tahini']);
const SAUCED_WORDS = /соус|подлив|заправк|карри|рагу|гуляш|строганов|сметан|сливочн|томатн|песто|чили кон|фрикасе|тушен/i;
// в шагах: соус готовят прямо в блюде («влейте соус», «для соуса», «полейте соусом»); «добавьте соевый соус» не считается
const SAUCED_STEPS = /(влейте|залейте|полейте|вмешайте|добавьте|приготовьте|смешайте)\s+(готовый\s+)?соус(?!\s+соев)|для\s+соуса|соусом|в\s+соусе|подлив/i;
const NO_SAUCE_TYPES = new Set(['soup', 'dessert', 'salad']);
const SWEET = new Set(['sugar', 'brown_sugar', 'powdered_sugar', 'vanilla_sugar', 'honey', 'maple_syrup', 'agave_syrup', 'jam', 'condensed_milk', 'choc_spread', 'dark_chocolate', 'milk_chocolate', 'white_chocolate', 'vanilla_pudding', 'pudding_powder', 'marzipan']);

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
        let counted = grams;
        if (ing.use === 'deepfry') counted = grams * DEEPFRY_OIL_ABSORBED;
        else if (ing.use === 'fry') { const full = Math.min(grams, FRY_FULL_G_PER_SERVING * (r.servings || 1)); counted = full + (grams - full) * FRY_OIL_ABSORBED; }
        const k = counted / 100;
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
    const isSauce = r.type === 'sauce';
    const [kMin, kMax] = isSauce ? [SAUCE_KCAL_MIN, SAUCE_KCAL_MAX] : [KCAL_MIN, KCAL_MAX];
    if (!(kcal >= kMin && kcal <= kMax)) e(`нереалистичные калории: ${kcal} ккал на порцию${isSauce ? ' соуса' : ''} (допустимо ${kMin}–${kMax})`);

    // соусы: к чему подходит, «без готовки», вес порции
    let sauceOut = {};
    if (isSauce) {
      const pairs = r.pairsWith;
      if (!Array.isArray(pairs) || pairs.length === 0) e('соус: пустой список «подходит к» (pairsWith)');
      for (const x of pairs || []) if (!PAIRS.includes(x)) e(`соус: неизвестный тег «подходит к» «${x}» (допустимо: ${PAIRS.join(', ')})`);
      if (typeof r.noCook !== 'boolean') e('соус: поле noCook должно быть true или false');
      if (r.noCook && r.totalMinutes > SAUCE_NOCOOK_MAX_MIN) e(`соус «без готовки» готовится ${r.totalMinutes} мин — должно быть не больше ${SAUCE_NOCOOK_MAX_MIN}`);
      const rawG = r.ingredients.filter((i) => !i.optional).reduce((a, i) => { const p = byId.get(i.product); return a + (i.unit === 'ml' ? i.amount * (p?.density ?? 1) : i.amount); }, 0);
      const portion = (r.yieldGrams ?? rawG) / s;
      if (portion < SAUCE_PORTION_G[0] || portion > SAUCE_PORTION_G[1]) e(`соус: порция ${Math.round(portion)} г — должна быть ${SAUCE_PORTION_G[0]}–${SAUCE_PORTION_G[1]} г (2–3 ст. л.), поправьте servings или yieldGrams`);
      sauceOut = { pairs: [...new Set(pairs || [])], nocook: !!r.noCook, portion: Math.round(portion) };
    } else {
      if (r.pairsWith || r.noCook != null) e('поля pairsWith и noCook бывают только у соусов (type: "sauce")');
      // основа блюда: теги PAIRS по ингредиентам с заметным весом на порцию
      const perTag = new Map();
      let sauceBaseG = 0, sweetG = 0;
      for (const ing of r.ingredients || []) {
        const p = byId.get(ing.product);
        if (!p || ing.optional) continue;
        const g = (ing.unit === 'ml' ? ing.amount * (p.density ?? 1) : ing.amount) / s;
        if (SAUCE_BASE.has(p.id)) sauceBaseG += g;
        if (SWEET.has(p.id)) sweetG += g;
        const tag = baseTagOf(p);
        if (tag) perTag.set(tag, (perTag.get(tag) ?? 0) + g);
      }
      // сладким блюдам (блины с яблоком, молочный рис) соус к мясу и рису не предлагаем
      const noSauce = NO_SAUCE_TYPES.has(r.type) || sweetG >= 10;
      const base = noSauce ? [] : PAIRS.filter((tg) => (perTag.get(tg) ?? 0) >= BASE_MIN_G[tg]);
      const sauced = noSauce || sauceBaseG >= 30 || SAUCED_WORDS.test(`${r.name?.ru} ${r.description?.ru}`)
        || (r.steps || []).some((st) => SAUCED_STEPS.test(st?.text?.ru || ''));
      sauceOut = { base, ...(sauced ? { sauced: true } : {}) };
    }
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
      ...sauceOut,
      ing: ingredients,
      steps: r.steps.map((st) => (st.timerMinutes ? { t: st.text, timer: st.timerMinutes } : { t: st.text })),
      ...(photo && fs.existsSync(path.join(root, 'public', 'photos', photo.file)) ? { photo: photo.file } : {}),
    });
  }
}

const sauceCount = out.filter((r) => r.type === 'sauce').length;
const dishCount = out.length - sauceCount;
if (dishCount < 400) warn(`в базе ${dishCount} блюд — по ТЗ нужно не меньше 400`);
if (sauceCount < 50) warn(`в базе ${sauceCount} соусов — по ТЗ нужно не меньше 50`);
for (const tag of PAIRS) if (!out.some((r) => r.type === 'sauce' && r.pairs.includes(tag))) warn(`нет ни одного соуса к «${tag}»`);

// ---------- итог ----------
for (const w of warnings) console.warn('предупреждение:', w);
if (errors.length) {
  for (const m of errors) console.error('ОШИБКА:', m);
  console.error(`\nНайдено ошибок: ${errors.length}. База не собрана.`);
  process.exit(1);
}
const withPhoto = out.filter((r) => r.photo).length;
console.log(`База в порядке: ${dishCount} блюд и ${sauceCount} соусов, ${products.length} продуктов, с фото: ${withPhoto}, предупреждений: ${warnings.length}.`);

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
