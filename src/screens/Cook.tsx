// Режим «готовлю»: один шаг на экране, крупный шрифт, экран не гаснет.
import { useEffect, useRef, useState } from 'react';
import { useDb } from '../data';
import { L, t } from '../i18n';
import { toast } from '../pwa';
import { back } from '../router';
import { Icon, Sheet } from '../ui';
import { IngredientList, TimerButton, servingsFor } from './RecipeView';

/** Просим систему не гасить экран, пока открыт режим готовки (Screen Wake Lock API). */
function useWakeLock(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) { void lock.release(); return; }
        setActive(true);
        lock.addEventListener('release', () => setActive(false));
      } catch { setActive(false); }
    };
    void request();
    const onVisible = () => { if (document.visibilityState === 'visible') void request(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); void lock?.release(); };
  }, []);
  return active;
}

export function Cook({ id, start }: { id: string; start: number }) {
  const { byId } = useDb();
  const r = byId.get(id);
  const [i, setI] = useState(start);
  const [showIngredients, setShowIngredients] = useState(false);
  const awake = useWakeLock();
  const touch = useRef<{ x: number; y: number } | null>(null);
  const n = r?.steps.length ?? 0;

  const prev = () => setI((v) => Math.max(0, v - 1));
  const next = () => {
    if (i >= n - 1) { toast(t('cook.enjoy')); back(`/recipe/${id}`); return; }
    setI((v) => v + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!r) return null;
  const step = r.steps[Math.min(i, n - 1)];

  return (
    <div
      className="cook"
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => {
        if (!touch.current) return;
        const dx = e.changedTouches[0].clientX - touch.current.x;
        const dy = e.changedTouches[0].clientY - touch.current.y;
        touch.current = null;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) next(); else prev(); }
      }}
    >
      <header className="cook-head">
        <button className="icon-btn" onClick={() => back(`/recipe/${id}`)} aria-label={t('cook.exit')}><Icon name="x" size={24} /></button>
        <div className="grow">
          <b>{L(r.name)}</b>
          <small>{awake ? t('cook.awake') : t('cook.notAwake')}</small>
        </div>
        <button className="icon-btn" onClick={() => setShowIngredients(true)} aria-label={t('recipe.ingredients')}><Icon name="list" size={24} /></button>
      </header>
      <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={n} aria-valuenow={i + 1}><i style={{ width: `${((i + 1) / n) * 100}%` }} /></div>

      <main className="cook-step" key={i}>
        <p className="cook-count">{t('cook.stepOf', { i: i + 1, n })}</p>
        <p className="cook-text">{L(step.t)}</p>
        <TimerButton r={r} step={i} big />
      </main>

      <footer className="cook-foot">
        <button className="btn soft big" onClick={prev} disabled={i === 0}><Icon name="back" size={22} />{t('cook.prev')}</button>
        <button className="btn primary big grow" onClick={next}>{i >= n - 1 ? <><Icon name="check" size={22} />{t('cook.finish')}</> : <>{t('cook.next')}<Icon name="chevron" size={22} /></>}</button>
      </footer>

      {showIngredients && (
        <Sheet title={t('recipe.ingredients')} onClose={() => setShowIngredients(false)}>
          <IngredientList r={r} servings={servingsFor(r)} />
        </Sheet>
      )}
    </div>
  );
}
