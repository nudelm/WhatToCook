// Независимый аудит калорий и БЖУ.
//   npm run audit            — пересчитать и показать расхождения
//   npm run audit -- --all   — показать ещё и справочные замечания (меры, сырой/готовый вес)
//
// Скрипт НЕ использует код сборки базы (build-data.mjs): он заново читает исходные рецепты
// и справочник продуктов, сам считает калории и БЖУ порции и сравнивает с тем, что лежит
// в собранной базе приложения (public/data/recipes.json). Так ловятся и ошибки в данных,
// и ошибки в формуле сборки.
//
// Что проверяется:
//   1. расхождение сохранённых и пересчитанных значений больше 10 %;
//   2. калории порции вне диапазона 80–1500 ккал;
//   3. меры («ст. л.», «шт.», «зубчик»…): сходится ли указанный вес с мерой;
//   4. сырой и готовый вес: в рецептах вес сырой, поэтому подозрительно большие порции круп,
//      пасты и бобовых, а также слова «отварной/готовый» в шагах — повод проверить;
//   5. масло для жарки: сколько его учтено в блюде.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const showAll = process.argv.includes('--all');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

// ---- модель расчёта (своя, не из build-data.mjs) ----
const TOLERANCE = 0.1; // 10 %
const KCAL_RANGE = [80, 1500];
const SAUCE_KCAL_RANGE = [10, 450]; // соусы: на порцию 2–3 ст. л. (≈40–50 г)
// Проверено вручную: лёгкие овощные салаты и закуски без калорийных продуктов (огурцы, помидоры, йогурт).
// Их калорийность ниже 80 ккал — правда, а не ошибка данных, поэтому в отчёте они идут отдельной строкой.
const LIGHT_OK = new Set(['smashed-cucumber', 'raita', 'sunomono', 'oi-muchim', 'salat-iz-svezhih-ovoshchej']);
// Жарка на сковороде: тонкий слой масла (до 10 г на порцию, ≈2 ч. л.) целиком остаётся на еде;
// из того, что налито сверх этого, в блюдо попадает половина, остальное остаётся на сковороде.
const PAN_FULL_G_PER_SERVING = 10;
const PAN_REST_ABSORBED = 0.5;
const DEEPFRY_ABSORBED = 0.12; // фритюр: в еду уходит около 12 % масла
// Объёмные меры, мл
const VOLUME_ML = { tbsp: 15, tsp: 5, cup: 240 };
// Сухие продукты, которые при варке сильно набирают вес: больше стольких граммов СЫРОГО продукта
// на порцию почти наверняка означает, что в рецепт вписали вес готового.
const DRY_CATEGORIES_LIMIT_G = 160;
const DRY_PRODUCTS = new Set(['rice', 'round_rice', 'arborio', 'basmati', 'jasmine_rice', 'buckwheat', 'oats', 'semolina', 'millet', 'pearl_barley', 'bulgur', 'couscous', 'quinoa', 'cornmeal', 'spaghetti', 'pasta', 'lasagna_sheets', 'egg_noodles', 'wheat_noodles', 'rice_noodles', 'soba', 'glass_noodles', 'red_lentils', 'green_lentils', 'chickpeas_dry', 'beans_dry', 'split_peas']);
const COOKED_WORDS = /(?<![а-яё])(отварн\S*|варен\S*|готов(?:ый|ого|ую|ые|ых|ой)|вчерашн\S*)\s+(рис\S*|гречк\S*|макарон\S*|паст\S*|лапш\S*|спагетти|булгур\S*|кускус\S*|киноа|фасол\S*|нут\S*|чечевиц\S*|перловк\S*|пшен\S*)/i;

const products = new Map(read('data/products.json').map((p) => [p.id, p]));
const built = new Map(read('public/data/recipes.json').map((r) => [r.id, r]));
const source = [];
for (const f of fs.readdirSync(path.join(root, 'data', 'recipes')).filter((x) => x.endsWith('.json')).sort()) {
  for (const r of read(`data/recipes/${f}`)) source.push({ ...r, file: f });
}

const gramsOf = (ing, p) => (ing.unit === 'ml' ? ing.amount * (p.density ?? 1) : ing.amount);

function countedShare(ing, grams, servings) {
  if (ing.use === 'deepfry') return DEEPFRY_ABSORBED;
  if (ing.use === 'fry') {
    const full = Math.min(grams, PAN_FULL_G_PER_SERVING * servings);
    return grams > 0 ? (full + (grams - full) * PAN_REST_ABSORBED) / grams : 1;
  }
  return 1;
}

export function recompute(r) {
  const t = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  for (const ing of r.ingredients) {
    if (ing.optional) continue;
    const p = products.get(ing.product);
    if (!p) throw new Error(`${r.id}: нет продукта ${ing.product}`);
    const g = gramsOf(ing, p);
    const k = (countedShare(ing, g, r.servings) * g) / 100;
    for (const key of Object.keys(t)) t[key] += p[key] * k;
  }
  const s = r.servings;
  return { kcal: Math.round(t.kcal / s), protein: t.protein / s, fat: t.fat / s, carbs: t.carbs / s };
}

/** Сколько граммов должна весить мера по справочнику; null — проверить нельзя. */
function expectedMeasureGrams(ing, p) {
  const { qty, unit } = ing.measure;
  if (unit === 'pinch') return null;
  if (VOLUME_ML[unit]) return qty * VOLUME_ML[unit] * (p.density ?? 1);
  if (p.piece && p.piece.unit === unit) return qty * p.piece.grams;
  return null;
}

const mismatches = [];
const outOfRange = [];
const lightOk = [];
const measureNotes = [];
const weightNotes = [];
const oilNotes = [];
const diff = (a, b) => (Math.max(a, b) === 0 ? 0 : Math.abs(a - b) / Math.max(Math.abs(b), 1e-9));

for (const r of source) {
  const mine = recompute(r);
  const saved = built.get(r.id);
  const name = r.name.ru;
  if (!saved) { mismatches.push(`${r.id} «${name}»: рецепта нет в собранной базе — запустите npm run data`); continue; }

  const bad = [];
  if (diff(saved.kcal, mine.kcal) > TOLERANCE) bad.push(`ккал ${saved.kcal} → ${mine.kcal}`);
  for (const [key, label] of [['protein', 'белки'], ['fat', 'жиры'], ['carbs', 'углеводы']]) {
    // для макронутриентов малые абсолютные расхождения (до 2 г) не считаем ошибкой
    if (diff(saved[key], mine[key]) > TOLERANCE && Math.abs(saved[key] - mine[key]) > 2) bad.push(`${label} ${saved[key]} → ${mine[key].toFixed(1)}`);
  }
  if (bad.length) mismatches.push(`${r.id} «${name}» (${r.file}): ${bad.join('; ')}`);
  if (r.type === 'sauce') {
    // соус считается на порцию 2–3 ст. л., поэтому у него свой диапазон
    if (mine.kcal < SAUCE_KCAL_RANGE[0] || mine.kcal > SAUCE_KCAL_RANGE[1]) outOfRange.push(`${r.id} «${name}» (${r.file}): ${mine.kcal} ккал на порцию соуса (допустимо ${SAUCE_KCAL_RANGE.join('–')})`);
  } else if (mine.kcal < KCAL_RANGE[0] && mine.kcal >= 40 && LIGHT_OK.has(r.id)) lightOk.push(`${r.id} «${name}»: ${mine.kcal} ккал`);
  else if (mine.kcal < KCAL_RANGE[0] || mine.kcal > KCAL_RANGE[1]) outOfRange.push(`${r.id} «${name}» (${r.file}): ${mine.kcal} ккал на порцию`);

  for (const ing of r.ingredients) {
    const p = products.get(ing.product);
    const g = gramsOf(ing, p);
    if (ing.measure) {
      const exp = expectedMeasureGrams(ing, p);
      if (exp != null && Math.abs(g - exp) / exp > 0.3 && Math.abs(g - exp) > 3) {
        measureNotes.push(`${r.id}: ${p.name.ru} — ${ing.measure.qty} ${ing.measure.unit} записано как ${Math.round(g)} г, по справочнику ≈ ${Math.round(exp)} г`);
      }
    }
    if (DRY_PRODUCTS.has(p.id) && g / r.servings > DRY_CATEGORIES_LIMIT_G) {
      weightNotes.push(`${r.id}: ${p.name.ru} — ${Math.round(g / r.servings)} г сухого продукта на порцию, похоже на вес готового`);
    }
    if (ing.use === 'fry' && !ing.optional) {
      const share = countedShare(ing, g, r.servings);
      if (share < 0.999) oilNotes.push(`${r.id}: ${p.name.ru} ${Math.round(g)} г на ${r.servings} порц. — учтено ${Math.round(share * 100)} %`);
    }
  }
  const cooked = r.steps.map((s) => s.text.ru).join(' ').match(COOKED_WORDS);
  if (cooked) {
    const dry = r.ingredients.find((i) => DRY_PRODUCTS.has(i.product));
    // до 110 г на порцию — обычная порция сухого продукта, значит вес записан сырым
    if (dry && gramsOf(dry, products.get(dry.product)) / r.servings > 110) weightNotes.push(`${r.id}: в шагах «${cooked[0]}» — проверьте, что ${products.get(dry.product).name.ru} (${Math.round(gramsOf(dry, products.get(dry.product)) / r.servings)} г на порцию) записан в сыром весе`);
  }
}

const section = (title, list, always = true) => {
  if (!always && !showAll) { console.log(`${title}: ${list.length} (подробно: --all)`); return; }
  console.log(`\n${title}: ${list.length}`);
  for (const x of list) console.log('  ' + x);
};

console.log(`Проверено рецептов: ${source.length}`);
section('Расхождение с сохранёнными значениями больше 10 %', mismatches);
section(`Калории вне диапазона ${KCAL_RANGE[0]}–${KCAL_RANGE[1]} ккал на порцию`, outOfRange);
section('Ниже 80 ккал, но проверено вручную (лёгкие овощные салаты)', lightOk);
section('Мера не сходится с весом (больше 30 %)', measureNotes);
section('Сырой и готовый вес — проверить', weightNotes);
section('Масло для жарки учтено не полностью', oilNotes, false);

const failed = mismatches.length + outOfRange.length;
console.log(failed ? `\nНайдено проблем: ${failed}.` : '\nКалории и БЖУ в порядке.');
process.exit(failed ? 1 : 0);
