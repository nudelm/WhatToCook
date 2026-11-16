// Собирает «контактные листы» — по 30 фото на картинку с подписями — чтобы быстро проверить глазами,
// что фото соответствуют блюдам. Результат: scripts/.sheets/sheet-01.jpg и т. д.
//   node scripts/photo-sheets.mjs            — все фото
//   node scripts/photo-sheets.mjs id1,id2    — только указанные
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const photos = JSON.parse(fs.readFileSync(path.join(root, 'data', 'photos.json'), 'utf8'));
const only = process.argv[2]?.split(',');
const ids = Object.keys(photos).filter((id) => !only || only.includes(id)).sort();
const outDir = path.join(root, 'scripts', '.sheets');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const COLS = 6, ROWS = 5, W = 200, H = 150, LABEL = 22;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
for (let n = 0; n * COLS * ROWS < ids.length; n++) {
  const chunk = ids.slice(n * COLS * ROWS, (n + 1) * COLS * ROWS);
  const composite = [];
  for (const [i, id] of chunk.entries()) {
    const x = (i % COLS) * W, y = Math.floor(i / COLS) * (H + LABEL);
    const file = path.join(root, 'public', 'photos', photos[id].file);
    if (fs.existsSync(file)) composite.push({ input: await sharp(file).resize(W, H).toBuffer(), left: x, top: y });
    const label = `<svg width="${W}" height="${LABEL}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/><text x="4" y="15" font-family="Arial" font-size="12" fill="#000">${esc(id.slice(0, 30))}</text></svg>`;
    composite.push({ input: Buffer.from(label), left: x, top: y + H });
  }
  const name = `sheet-${String(n + 1).padStart(2, '0')}.jpg`;
  await sharp({ create: { width: COLS * W, height: ROWS * (H + LABEL), channels: 3, background: '#ffffff' } }).composite(composite).jpeg({ quality: 80 }).toFile(path.join(outDir, name));
  console.log(name, chunk[0], '…', chunk[chunk.length - 1]);
}
