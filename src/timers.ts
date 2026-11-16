// Таймеры шагов. Живут, пока открыто приложение; по окончании — звук, вибрация и сообщение.
import { useSyncExternalStore } from 'react';

export interface Timer {
  key: string;
  recipeId: string;
  step: number;
  label: string;
  endsAt: number;
  durationMs: number;
  done: boolean;
}

let timers: Timer[] = [];
let now = Date.now();
let snapshot = { timers, now };
const listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | null = null;
let onDone: ((t: Timer) => void) | null = null;

export const timerKey = (recipeId: string, step: number): string => `${recipeId}:${step}`;
export const setTimerDoneHandler = (fn: (t: Timer) => void): void => { onDone = fn; };

function emit() { snapshot = { timers, now }; listeners.forEach((l) => l()); }

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((at) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.3);
    });
    setTimeout(() => void ctx.close(), 1500);
  } catch { /* звук недоступен */ }
}

function tick() {
  now = Date.now();
  let changed = false;
  timers = timers.map((t) => {
    if (!t.done && t.endsAt <= now) {
      changed = true;
      beep();
      navigator.vibrate?.([250, 120, 250, 120, 500]);
      const finished = { ...t, done: true };
      onDone?.(finished);
      return finished;
    }
    return t;
  });
  if (!timers.some((t) => !t.done) && interval) { clearInterval(interval); interval = null; }
  if (changed || timers.length) emit();
}

export function startTimer(recipeId: string, step: number, minutes: number, label: string): void {
  const key = timerKey(recipeId, step);
  const durationMs = minutes * 60000;
  timers = [...timers.filter((t) => t.key !== key), { key, recipeId, step, label, endsAt: Date.now() + durationMs, durationMs, done: false }];
  now = Date.now();
  interval ??= setInterval(tick, 500);
  emit();
}

export function stopTimer(key: string): void {
  timers = timers.filter((t) => t.key !== key);
  emit();
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export const useTimers = (): { timers: Timer[]; now: number } => useSyncExternalStore(subscribe, () => snapshot);

export function formatLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
