import { useEffect, useMemo, useState } from 'react';
import { LIGHT_KCAL, QUICK_MINUTES } from '../constants';
import { useDb } from '../data';
import { selectRecipes } from '../engine/filters';
import { dayNumber, dayPart, pickToday, surprise } from '../engine/today';
import { getLang, t, tn } from '../i18n';
import { go } from '../router';
import { setFilters, toggle, update, useStore } from '../store';
import type { Recipe } from '../types';
import { Chip, FilterButton, FilterSheet, Icon, InstallBanner, NoResults, RecipeCard } from '../ui';

const PICKS = 4;

export function Today() {
  const { recipes, byId } = useDb();
  const s = useStore();
  const [sheet, setSheet] = useState(false);

  const now = new Date();
  const day = dayNumber(now);
  const hour = now.getHours();
  const part = dayPart(hour);
  const f = s.filters;

  const hidden = useMemo(() => new Set(s.hidden), [s.hidden]);
  const pool = useMemo(() => selectRecipes(recipes, s.prefs, f, hidden), [recipes, s.prefs, f, hidden]);

  // Подборка привязана к дню, времени суток, фильтрам и профилю: пока они те же, блюда не меняются.
  const key = `${day}|${part}|${JSON.stringify(f)}|${JSON.stringify(s.prefs)}|${s.hidden.length}`;
  const current = s.today?.key === key ? s.today : null;

  /** Что показывали за последние 7 дней (не считая сегодня) плюс то, что передано дополнительно. */
  const recentWith = (extra: string[]): Set<string> => {
    const set = new Set(extra);
    for (const [id, d] of Object.entries(s.shown)) if (day - d >= 1 && day - d <= 7) set.add(id);
    return set;
  };
  const pick = (n: number, exclude: string[]) =>
    pickToday(pool, { hour, seed: `${day}#${n}`, recent: recentWith(exclude), count: PICKS, ignoreDayPart: f.types.length > 0 });

  const picks: Recipe[] = useMemo(
    () => (current ? current.ids.map((id) => byId.get(id)).filter((r): r is Recipe => !!r) : pick(0, [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, current, pool],
  );

  const commit = (n: number, list: Recipe[], prev: string[]) =>
    update((st) => {
      const shown: Record<string, number> = {};
      for (const [id, d] of Object.entries(st.shown)) if (day - d <= 8) shown[id] = d;
      for (const r of list) shown[r.id] = day;
      return { shown, today: { key, n, ids: list.map((r) => r.id), prev } };
    });

  useEffect(() => {
    if (!current && picks.length) commit(0, picks, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const showOthers = () => {
    const prev = [...(current?.prev ?? []), ...picks.map((r) => r.id)];
    const n = (current?.n ?? 0) + 1;
    commit(n, pick(n, prev), prev);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const surpriseMe = () => {
    const r = surprise(pool, recentWith(picks.map((x) => x.id)));
    if (r) go(`/recipe/${r.id}`);
  };

  const date = new Intl.DateTimeFormat(getLang(), { weekday: 'long', day: 'numeric', month: 'long' }).format(now);

  return (
    <div className="page">
      <header className="hello">
        <p className="date">{date}</p>
        <h1>{t(`today.question.${part}`)}</h1>
      </header>

      <div className="chips scroll-x" aria-label={t('today.quickFilters')}>
        <Chip icon="clock" on={f.maxTime === QUICK_MINUTES} onClick={() => setFilters({ ...f, maxTime: f.maxTime === QUICK_MINUTES ? 0 : QUICK_MINUTES })}>{t('filters.upToMin', { n: QUICK_MINUTES })}</Chip>
        <Chip on={f.maxKcal === LIGHT_KCAL} onClick={() => setFilters({ ...f, maxKcal: f.maxKcal === LIGHT_KCAL ? 0 : LIGHT_KCAL })}>{t('today.light')}</Chip>
        <Chip on={f.diets.includes('vegetarian')} onClick={() => setFilters({ ...f, diets: toggle(f.diets, 'vegetarian') })}>{t('today.noMeat')}</Chip>
        <Chip on={f.highProtein} onClick={() => setFilters({ ...f, highProtein: !f.highProtein })}>{t('diets.highProtein')}</Chip>
        <FilterButton onClick={() => setSheet(true)} />
      </div>

      <InstallBanner />

      {picks.length > 0 ? (
        <>
          <div className="picks" key={current?.n ?? 0}>
            {picks.map((r, i) => <RecipeCard key={r.id} r={r} variant={i === 0 ? 'hero' : 'row'} eager={i < 2} />)}
          </div>
          <div className="actions">
            <button className="btn soft grow" onClick={showOthers}><Icon name="refresh" size={18} />{t('today.showOthers')}</button>
            <button className="btn primary grow" onClick={surpriseMe}><Icon name="dice" size={18} />{t('today.surprise')}</button>
          </div>
          <p className="hint center">{tn('today.poolCount', pool.length)}</p>
        </>
      ) : (
        <NoResults pool={recipes} />
      )}

      <a className="sauce-cta" href="#/sauces">
        <span className="sauce-cta-emoji" aria-hidden="true">🥣</span>
        <span className="grow"><b>{t('sauces.ctaTitle')}</b><small>{t('sauces.ctaText')}</small></span>
        <Icon name="chevron" size={18} />
      </a>

      {sheet && <FilterSheet count={pool.length} onClose={() => setSheet(false)} />}
    </div>
  );
}
