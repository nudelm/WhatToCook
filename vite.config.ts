import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base: './' — приложение работает из любой папки (GitHub Pages, Netlify, Cloudflare Pages) без настройки.
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.1.0') },
  plugins: [
    react(),
    VitePWA({
      // Новая версия скачивается в фоне и ждёт; применяется по кнопке «Обновить» (UpdateBanner).
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        id: './',
        name: 'WhatToCook',
        short_name: 'WhatToCook',
        description: 'Подбор блюд на сегодня, поиск рецептов по продуктам, список покупок. Работает офлайн.',
        lang: 'ru',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FAF5EC',
        theme_color: '#D8552B',
        categories: ['food', 'lifestyle'],
        icons: [
          ...[48, 72, 96, 128, 144, 152, 192, 256, 384, 512].map((s) => ({ src: `icons/icon-${s}.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'any' as const })),
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Оболочка приложения и вся база рецептов кладутся в кэш сразу; фото — по мере просмотра.
        globPatterns: ['**/*.{js,css,html,svg,png,json,webmanifest}'],
        globIgnores: ['photos/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // При первой установке SW сразу берёт страницу под контроль (фото кэшируются с первого визита).
        // При обновлении новый SW ждёт, пока пользователь не нажмёт «Обновить» (SKIP_WAITING).
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/photos/'),
            handler: 'CacheFirst',
            options: { cacheName: 'dish-photos', expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  build: { target: 'es2020', cssMinify: true },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
