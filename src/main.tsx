import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { setLang, t } from './i18n';
import { getState } from './store';
import { setUpdateReady, toast } from './pwa';
import './styles.css';

setLang(getState().lang); // язык нужен до первой отрисовки

// Service worker: кэширует приложение и базу рецептов, после первой загрузки всё работает без интернета.
// Новая версия не применяется сама: показываем плашку «Доступна новая версия», применяем по кнопке.
const updateSW = registerSW({
  immediate: true,
  onOfflineReady: () => toast(t('pwa.offlineReady')),
  onNeedRefresh: () => setUpdateReady(() => updateSW(true)),
  onRegisteredSW: (_url, reg) => {
    // PWA может висеть открытым днями — проверяем обновления, когда приложение снова на экране.
    if (!reg) return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void reg.update().catch(() => {});
    });
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
