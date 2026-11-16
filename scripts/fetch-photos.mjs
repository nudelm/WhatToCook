// Подбирает фото блюд на Wikimedia Commons (только свободные лицензии), сжимает в WebP 800×600
// и записывает автора/лицензию/источник в data/photos.json.
//   npm run photos                      — найти фото для рецептов, у которых его ещё нет
//   npm run photos -- --only borsch     — только для указанных id (через запятую)
//   npm run photos -- --pick borsch=3   — взять 3-й по счёту вариант из найденных (если первый не подошёл)
//   npm run photos -- --query borsch="borscht soup bowl"  — искать по другому запросу
//   npm run photos -- --drop borsch     — убрать фото (останется плашка с эмодзи)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'RecipePwaPhotoFetcher/1.0 (free-license dish photos; nodejs)';
const API = 'https://commons.wikimedia.org/w/api.php';
const photosPath = path.join(root, 'data', 'photos.json');
const cachePath = path.join(root, 'scripts', '.photo-cache.json');
const outDir = path.join(root, 'public', 'photos');
fs.mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const argList = (name) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1].split(',') : []; };
const only = argList('--only');
const picks = Object.fromEntries(argList('--pick').map((s) => s.split('=')));
const drops = argList('--drop');
const queries = {};
for (let i = 0; i < args.length; i++) if (args[i] === '--query' && args[i + 1]) { const [id, ...q] = args[i + 1].split('='); queries[id] = q.join('='); }

const photos = fs.existsSync(photosPath) ? JSON.parse(fs.readFileSync(photosPath, 'utf8')) : {};
const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};
const save = () => {
  fs.writeFileSync(photosPath, JSON.stringify(Object.fromEntries(Object.entries(photos).sort()), null, 1) + '\n');
  fs.writeFileSync(cachePath, JSON.stringify(cache));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

const LICENSE_OK = /^(cc0|cc[ -]by(-sa)?[ -]?\d|public domain|pd\b|pdm)/i;
const BAD_TITLE = /\b(logo|map|diagram|icon|flag|chart|drawing|painting|label|sign|menu|restaurant|shop|market|factory|packag)/i;

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 429 || res.status >= 500) { await sleep(3000 * (i + 1)); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { if (i === tries - 1) throw e; await sleep(2000 * (i + 1)); }
  }
  throw new Error('нет ответа');
}

async function search(query) {
  const u = new URL(API);
  u.search = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrlimit: '20',
    gsrsearch: `${query} filetype:bitmap`, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '960',
    iiextmetadatafilter: 'LicenseShortName|Artist|LicenseUrl',
  }).toString();
  const json = await getJson(u);
  const pages = Object.values(json?.query?.pages || {}).sort((a, b) => a.index - b.index);
  const list = [];
  for (const pg of pages) {
    const ii = pg.imageinfo?.[0];
    if (!ii || ii.mime !== 'image/jpeg') continue;
    const ratio = ii.width / ii.height;
    if (ii.width < 800 || ratio < 0.7 || ratio > 2.3) continue;
    const license = strip(ii.extmetadata?.LicenseShortName?.value);
    if (!LICENSE_OK.test(license) || BAD_TITLE.test(pg.title)) continue;
    list.push({
      title: pg.title.replace(/^File:/, ''), thumb: ii.thumburl, source: ii.descriptionurl, license,
      licenseUrl: ii.extmetadata?.LicenseUrl?.value || '', author: strip(ii.extmetadata?.Artist?.value).slice(0, 120) || 'Wikimedia Commons',
    });
  }
  return list;
}

async function download(cand, id) {
  let res;
  for (let i = 0; i < 4; i++) {
    res = await fetch(cand.thumb, { headers: { 'User-Agent': UA } });
    if (res.ok) break;
    await sleep(3000 * (i + 1));
  }
  if (!res.ok) throw new Error(`фото не скачалось: HTTP ${res.status}`);
  const input = Buffer.from(await res.arrayBuffer());
  let buf;
  for (const quality of [72, 62, 52, 42, 32, 24, 16]) {
    buf = await sharp(input).rotate().resize(800, 600, { fit: 'cover', position: 'attention' }).webp({ quality }).toBuffer();
    if (buf.length <= 80 * 1024) break;
  }
  fs.writeFileSync(path.join(outDir, `${id}.webp`), buf);
  return buf.length;
}

const recipes = fs.readdirSync(path.join(root, 'data', 'recipes')).filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(root, 'data', 'recipes', f), 'utf8')));

for (const id of drops) {
  delete photos[id];
  fs.rmSync(path.join(outDir, `${id}.webp`), { force: true });
  console.log(`${id}: фото убрано`);
}

let done = 0, missing = 0;
for (const r of recipes) {
  const forced = only.includes(r.id) || picks[r.id] != null || queries[r.id] != null;
  if (drops.includes(r.id) && !forced) continue;
  if ((only.length || Object.keys(picks).length || Object.keys(queries).length || drops.length) && !forced) continue;
  if (photos[r.id] && !forced) continue;
  const query = queries[r.id] || r.photoQuery || r.name.ru;
  try {
    if (!cache[r.id] || cache[r.id].query !== query) { cache[r.id] = { query, list: await search(query) }; await sleep(600); }
    const list = cache[r.id].list;
    const n = Math.max(1, Number(picks[r.id] || 1));
    const cand = list[n - 1];
    if (!cand) { console.log(`${r.id}: ничего подходящего по запросу «${query}» (вариантов: ${list.length})`); missing++; delete photos[r.id]; save(); continue; }
    const bytes = await download(cand, r.id);
    photos[r.id] = { file: `${r.id}.webp`, title: cand.title, author: cand.author, license: cand.license, licenseUrl: cand.licenseUrl, source: cand.source, pick: n };
    done++;
    console.log(`${r.id}: ${cand.title} — ${cand.license}, ${Math.round(bytes / 1024)} КБ (вариант ${n} из ${list.length})`);
    save();
    await sleep(700);
  } catch (e) { console.log(`${r.id}: ошибка — ${e.message}`); missing++; }
}
save();
console.log(`\nГотово. Скачано: ${done}, без фото: ${missing}. Всего с фото: ${Object.keys(photos).length} из ${recipes.length}.`);
