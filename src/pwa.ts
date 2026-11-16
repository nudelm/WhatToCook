// Установка на главный экран (Android/Chrome) и сообщения-подсказки внизу экрана.
import { useSyncExternalStore } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installEvent: InstallPromptEvent | null = null;
let toastText: { id: number; text: string } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e as InstallPromptEvent;
  emit();
});
window.addEventListener('appinstalled', () => { installEvent = null; emit(); });

/** true, если браузер готов показать системное окно «Установить приложение». */
export const useCanInstall = (): boolean => useSyncExternalStore(subscribe, () => installEvent !== null);

export async function promptInstall(): Promise<boolean> {
  if (!installEvent) return false;
  const ev = installEvent;
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  installEvent = null;
  emit();
  return outcome === 'accepted';
}

export const isStandalone = (): boolean => window.matchMedia('(display-mode: standalone)').matches;

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string): void {
  toastText = { id: Date.now(), text };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastText = null; emit(); }, 2800);
  emit();
}
export const useToast = (): { id: number; text: string } | null => useSyncExternalStore(subscribe, () => toastText);
