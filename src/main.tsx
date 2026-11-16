import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { t } from './i18n';
import { toast } from './pwa';
import './styles.css';

// Service worker: кэширует приложение и базу рецептов, после первой загрузки всё работает без интернета.
registerSW({ immediate: true, onOfflineReady: () => toast(t('pwa.offlineReady')) });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
