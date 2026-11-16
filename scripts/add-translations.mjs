// Вписывает переводы названий продуктов и блюд из scripts/translations/<язык>.txt в базу (data/).
//   node scripts/add-translations.mjs uk
// Формат файла: разделы [products] и [recipes], строки «id=название». Чего нет в файле — остаётся на русском.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lang = process.argv[2];
if (!lang) { console.error('Укажите язык, например: node scripts/add-translations.mjs uk'); process.exit(1); }

const maps = { products: new Map(), recipes: new Map() };
let section = null;
for (const raw of fs.readFileSync(path.join(root, 'scripts', 'translations', `${lang}.txt`), 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const m = line.match(/^\[(products|recipes)\]$/);
  if (m) { section = m[1]; continue; }
  const i = line.indexOf('=');
  if (!section || i < 1) { console.error(`Непонятная строка: ${line}`); process.exit(1); }
  maps[section].set(line.slice(0, i).trim(), line.slice(i + 1).trim());
}

// ----- продукты -----
const productsPath = path.join(root, 'data', 'products.json');
const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
const used = new Set();
for (const p of products) if (maps.products.has(p.id)) { p.name[lang] = maps.products.get(p.id); used.add(p.id); }
fs.writeFileSync(productsPath, '[\n' + products.map((o) => '  ' + JSON.stringify(o)).join(',\n') + '\n]\n');
const missingProducts = products.filter((p) => !p.name[lang]).map((p) => p.id);
const unknownProducts = [...maps.products.keys()].filter((id) => !used.has(id));

// ----- описания и шаги рецептов: scripts/translations/<язык>-texts/*.txt -----
// Формат: строка «@id», следом строка с описанием, затем шаги, каждый с «- » в начале.
const texts = new Map();
const problems = [];
const textsDir = path.join(root, 'scripts', 'translations', `${lang}-texts`);
if (fs.existsSync(textsDir)) {
  for (const f of fs.readdirSync(textsDir).filter((x) => x.endsWith('.txt')).sort()) {
    let cur = null;
    for (const raw of fs.readFileSync(path.join(textsDir, f), 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      if (line.startsWith('@')) {
        cur = { desc: '', steps: [] };
        const id = line.slice(1).trim();
        if (texts.has(id)) problems.push(`${f}: ${id} встречается дважды`);
        texts.set(id, cur);
      } else if (!cur) problems.push(`${f}: строка вне рецепта: ${line}`);
      else if (line.startsWith('- ')) cur.steps.push(line.slice(2).trim());
      else if (!cur.desc) cur.desc = line;
      else problems.push(`${f}: лишняя строка: ${line}`);
    }
  }
}

// ----- рецепты -----
const fmt = (r) => {
  const lines = Object.entries(r).map(([k, v]) =>
    k === 'ingredients' || k === 'steps'
      ? `    ${JSON.stringify(k)}: [\n` + v.map((x) => '      ' + JSON.stringify(x)).join(',\n') + '\n    ]'
      : `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return '  {\n' + lines.join(',\n') + '\n  }';
};
const dir = path.join(root, 'data', 'recipes');
const usedR = new Set();
const missingRecipes = [];
const usedT = new Set();
const missingTexts = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const list = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const r of list) {
    if (maps.recipes.has(r.id)) { r.name[lang] = maps.recipes.get(r.id); usedR.add(r.id); }
    if (!r.name[lang]) missingRecipes.push(r.id);
    const tx = texts.get(r.id);
    if (tx) {
      usedT.add(r.id);
      if (tx.steps.length !== r.steps.length) problems.push(`${r.id}: шагов в переводе ${tx.steps.length}, в рецепте ${r.steps.length}`);
      else {
        if (tx.desc) r.description[lang] = tx.desc;
        tx.steps.forEach((s, i) => { r.steps[i].text[lang] = s; });
      }
    }
    if (!r.description[lang] || r.steps.some((s) => !s.text[lang])) missingTexts.push(r.id);
  }
  fs.writeFileSync(path.join(dir, f), '[\n' + list.map(fmt).join(',\n') + '\n]\n');
}
const unknownRecipes = [...maps.recipes.keys()].filter((id) => !usedR.has(id));

console.log(`Язык ${lang}: продуктов переведено ${used.size} из ${products.length}, рецептов ${usedR.size}.`);
if (missingProducts.length) console.log('Продукты без перевода:', missingProducts.join(', '));
if (missingRecipes.length) console.log('Рецепты без перевода названия:', missingRecipes.join(', '));
console.log(`Описания и шаги переведены у ${products.length ? 0 + usedT.size - problems.filter((p) => p.includes('шагов в переводе')).length : 0} рецептов, без перевода: ${missingTexts.length}.`);
if (missingTexts.length && missingTexts.length <= 60) console.log('Без перевода текста:', missingTexts.join(', '));
for (const id of texts.keys()) if (!usedT.has(id)) problems.push(`в переводе есть рецепт ${id}, которого нет в базе`);
for (const p of problems) console.log('ПРОБЛЕМА:', p);
if (unknownProducts.length || unknownRecipes.length) console.log('В файле есть id, которых нет в базе:', [...unknownProducts, ...unknownRecipes].join(', '));
