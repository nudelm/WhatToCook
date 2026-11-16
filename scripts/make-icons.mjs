// Рисует иконки приложения всех нужных размеров из одного SVG. Запуск: npm run icons
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'icons');
fs.mkdirSync(out, { recursive: true });

// Кастрюля с паром на терракотовом фоне. scale — насколько рисунок занимает поле (для maskable нужен запас по краям).
const svg = (scale, rounded) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="#D8552B"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)" fill="none" stroke="#FFF6EA" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
    <path d="M196 96c0 22-22 26-22 50M256 80c0 26-22 30-22 62M316 96c0 22-22 26-22 50" opacity=".85"/>
    <path d="M118 226h276v96c0 46-36 82-82 82H200c-46 0-82-36-82-82z" fill="#FFF6EA"/>
    <path d="M84 226h344"/>
    <path d="M84 270h34M394 270h34"/>
  </g>
</svg>`;

const any = Buffer.from(svg(0.86, true));
const maskable = Buffer.from(svg(0.62, false));
for (const s of [48, 72, 96, 128, 144, 152, 192, 256, 384, 512]) await sharp(any).resize(s, s).png().toFile(path.join(out, `icon-${s}.png`));
for (const s of [192, 512]) await sharp(maskable).resize(s, s).png().toFile(path.join(out, `maskable-${s}.png`));
fs.writeFileSync(path.join(root, 'public', 'favicon.svg'), svg(0.86, true));
console.log('Иконки готовы: public/icons');
