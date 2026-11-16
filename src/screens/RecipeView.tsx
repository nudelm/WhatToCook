import { useEffect, useMemo, useState } from 'react';
import { loadCredits, useDb } from '../data';
import { formatIngredient } from '../engine/format';
import { isStaple } from '../engine/pantry';
import { L, t, tn } from '../i18n';
import { toast } from '../pwa';
import { back, go } from '../router';
import { addToShopping, hideRecipe, toggleFavorite, togglePantry, unhideRecipe, useStore } from '../store';
import { formatLeft, startTimer, stopTimer, timerKey, useTimers } from '../timers';
import type { PhotoCredit, Recipe } from '../types';
import { Icon, Photo, minutes, productName } from '../ui';

// Выбранное число порций помним, пока открыто приложение, — оно нужно и в режиме «готовлю».
const chosenServings = new Map<string, number>();
export const servingsFor = (r: Recipe): number => chosenServings.get(r.id) ?? r.servings;

const unit = (u: string) => t(`units.${u}`);

/** Кнопка таймера шага: запускает отсчёт, показывает оставшееся время, по нажатию останавливает. */
export function TimerButton({ r, step, big }: { r: Recipe; step: number; big?: boolean }) {
  const { timers, now } = useTimers();
  const min = r.steps[step].timer;
  if (!min) return null;
  const tm = timers.find((x) => x.key === timerKey(r.id, step));
  if (tm) {
    return (
      <button className={`timer-btn running${tm.done ? ' done' : ''}${big ? ' big' : ''}`} onClick={() => stopTimer(tm.key)}>
        <Icon name="timer" size={big ? 24 : 18} />
        <b>{tm.done ? t('timer.done') : formatLeft(tm.endsAt - now)}</b>
        <span>{t(tm.done ? 'timer.dismiss' : 'timer.stop')}</span>
      </button>
    );
  }
  return (
    <button className={`timer-btn${big ? ' big' : ''}`} onClick={() => startTimer(r.id, step, min, L(r.name))}>
      <Icon name="timer" size={big ? 24 : 18} />
      <b>{minutes(min)}</b>
      <span>{t('timer.start')}</span>
    </button>
  );
}

export function IngredientList({ r, servings }: { r: Recipe; servings: number }) {
  const { productMap } = useDb();
  const pantryList = useStore().pantry;
  const pantry = useMemo(() => new Set(pantryList), [pantryList]);
  const factor = servings / r.servings;
  return (
    <ul className="ingredients">
      {r.ing.map((i) => {
        const p = productMap.get(i.p);
        const have = pantry.has(i.p) || isStaple(p);
        const text = formatIngredient(i, factor, unit);
        // Нажатие на строку отмечает продукт как «есть дома» — то же самое, что отметить его во вкладке «Продукты».
        // Базовые продукты (соль, вода, масло…) считаются имеющимися всегда, поэтому не переключаются.
        const staple = isStaple(p);
        return (
          <li key={i.p} className={have ? 'have' : ''}>
            <button type="button" role="checkbox" aria-checked={have} disabled={staple} onClick={() => togglePantry(i.p)}>
              <span className="mark">{have && <Icon name="check" size={14} />}</span>
              <span className="grow">{productName(p)}{i.opt && <small> · {t('recipe.optional')}</small>}{staple && <small> · {t('recipe.alwaysHave')}</small>}</span>
              <span className="qty"><b>{text.main}</b>{text.sub && <small>{text.sub}</small>}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function RecipeView({ id }: { id: string }) {
  const { byId, productMap } = useDb();
  const s = useStore();
  const r = byId.get(id);
  const [servings, setServingsState] = useState(r ? servingsFor(r) : 2);
  const [credit, setCredit] = useState<PhotoCredit | null>(null);

  useEffect(() => {
    let alive = true;
    if (r?.photo) void loadCredits().then((list) => { if (alive) setCredit(list.find((c) => c.id === id) ?? null); });
    return () => { alive = false; };
  }, [id, r?.photo]);

  if (!r) {
    return (
      <div className="page">
        <div className="empty">
          <div className="empty-emoji">🤷</div>
          <h2>{t('recipe.notFound')}</h2>
          <a className="btn primary" href="#/catalog">{t('saved.openCatalog')}</a>
        </div>
      </div>
    );
  }

  const setServings = (n: number) => { const v = Math.min(24, Math.max(1, n)); chosenServings.set(r.id, v); setServingsState(v); };
  const factor = servings / r.servings;
  const fav = s.favorites.includes(r.id);
  const isHidden = s.hidden.includes(r.id);
  const pantry = new Set(s.pantry);
  const need = r.ing.filter((i) => !i.opt && !isStaple(productMap.get(i.p)) && !pantry.has(i.p));

  const addNeed = () => {
    addToShopping(need.map((i) => ({ p: i.p, g: Math.round(i.g * factor) })), r.id);
    toast(tn('shopping.added', need.length));
  };
  const hide = () => {
    if (isHidden) { unhideRecipe(r.id); toast(t('recipe.unhidden')); return; }
    hideRecipe(r.id);
    toast(t('recipe.hiddenToast'));
    back('/');
  };

  return (
    <div className="page recipe">
      <div className="recipe-photo">
        <Photo r={r} eager />
        <div className="recipe-top">
          <button className="round-btn" onClick={() => back('/')} aria-label={t('common.back')}><Icon name="back" /></button>
          <span className="grow" />
          <button className="round-btn" onClick={hide} aria-pressed={isHidden} aria-label={t(isHidden ? 'recipe.unhide' : 'recipe.hide')}><Icon name="eyeoff" /></button>
          <button className={`round-btn${fav ? ' on' : ''}`} onClick={() => toggleFavorite(r.id)} aria-pressed={fav} aria-label={t(fav ? 'recipe.unfavorite' : 'recipe.favorite')}><Icon name="heart" fill={fav} /></button>
        </div>
      </div>

      <div className="recipe-body">
        <p className="kicker">{t(`cuisines.${r.cuisine}`)} · {t(`types.${r.type}`)} · {t(`difficulty.${r.diff}`)}</p>
        <h1>{L(r.name)}</h1>
        <p className="lead">{L(r.desc)}</p>

        <div className="facts">
          <div><Icon name="clock" size={18} /><b>{minutes(r.total)}</b><span>{t('recipe.totalTime')}</span></div>
          <div><Icon name="pot" size={18} /><b>{minutes(r.active)}</b><span>{t('recipe.activeTime')}</span></div>
        </div>

        <section className="nutrition" aria-label={t('recipe.nutrition')}>
          <div className="kcal"><b>≈ {r.kcal}</b><span>{t('units.kcal')}</span></div>
          <div><b>{Math.round(r.protein)} {t('units.g')}</b><span>{t('recipe.protein')}</span></div>
          <div><b>{Math.round(r.fat)} {t('units.g')}</b><span>{t('recipe.fat')}</span></div>
          <div><b>{Math.round(r.carbs)} {t('units.g')}</b><span>{t('recipe.carbs')}</span></div>
          <p>{t('recipe.approxNote')}{s.kcalGoal > 0 && ` ${t('recipe.goalShare', { n: Math.round((r.kcal / s.kcalGoal) * 100) })}`}</p>
        </section>

        {r.diets.length > 0 && <div className="tags">{r.diets.map((d) => <span key={d} className="tag">{t(`diets.${d}`)}</span>)}</div>}

        <section className="block">
          <div className="block-head">
            <h2>{t('recipe.ingredients')}</h2>
            <div className="stepper" role="group" aria-label={t('recipe.servings')}>
              <button onClick={() => setServings(servings - 1)} disabled={servings <= 1} aria-label={t('recipe.lessServings')}><Icon name="minus" size={18} /></button>
              <span>{tn('recipe.servingsN', servings)}</span>
              <button onClick={() => setServings(servings + 1)} aria-label={t('recipe.moreServings')}><Icon name="plus" size={18} /></button>
            </div>
          </div>
          <p className="hint">{t('recipe.tapToMark')}</p>
          <IngredientList r={r} servings={servings} />
          {need.length > 0 ? (
            <button className="btn soft block-btn" onClick={addNeed}>
              <Icon name="cart" size={18} />{tn(pantry.size ? 'recipe.addMissing' : 'recipe.addAll', need.length)}
            </button>
          ) : (
            <p className="hint ok"><Icon name="check" size={16} /> {t('recipe.haveAll')}</p>
          )}
        </section>

        <section className="block">
          <h2>{t('recipe.steps')}</h2>
          <ol className="steps">
            {r.steps.map((st, i) => (
              <li key={i}>
                <span className="num">{i + 1}</span>
                <div>
                  <p>{L(st.t)}</p>
                  <TimerButton r={r} step={i} />
                </div>
              </li>
            ))}
          </ol>
        </section>

        {credit && (
          <p className="credit">
            {t('recipe.photoBy')} <a href={credit.source} target="_blank" rel="noopener noreferrer">{credit.author}</a>, {credit.license}, Wikimedia Commons
          </p>
        )}
      </div>

      <div className="sticky-cta">
        <button className="btn primary block-btn big" onClick={() => go(`/cook/${r.id}`)}><Icon name="pot" size={22} />{t('recipe.cook')}</button>
      </div>
    </div>
  );
}
