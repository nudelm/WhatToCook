// Вкладка «План» на экране «Избранное и покупки»: блюда на 7 дней, автозаполнение и сбор списка покупок.
import { useMemo, useState } from 'react';
import { useDb } from '../data';
import { passesProfile, selectRecipes } from '../engine/filters';
import { DAYS, autoFillWeek, mergePlanIntoShopping, planIds, planNeeds, weekdayIndex } from '../engine/plan';
import { searchRecipes } from '../engine/search';
import { L, getLang, t, tn } from '../i18n';
import { toast } from '../pwa';
import { replace } from '../router';
import { planAdd, planRemove, planReplace, update, useStore } from '../store';
import type { Recipe } from '../types';
import { Icon, Meta, Photo, Sheet, useAlways } from '../ui';

const DAY_LIST = Array.from({ length: DAYS }, (_, d) => d);
const dayName = (d: number) => t(`plan.days.${d}`);
const PICK_LIMIT = 30;

interface PickerTarget { day: number; replaceId?: string }

export function PlanTab() {
  const { recipes, byId } = useDb();
  const s = useStore();
  const always = useAlways();
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const today = weekdayIndex(new Date());
  const total = planIds(s.plan).filter((id) => byId.has(id)).length;

  const autoFill = () => {
    const full = s.plan.every((d) => d.length > 0);
    if (full && !window.confirm(t('plan.autoFullConfirm'))) return;
    const pool = selectRecipes(recipes, s.prefs, s.filters, new Set(s.hidden));
    const next = autoFillWeek(pool, s.plan, { seed: String(Date.now()), byId, overwrite: full });
    const added = planIds(next).length - (full ? 0 : planIds(s.plan).length);
    if (added <= 0) { toast(t('plan.autoNone')); return; }
    update({ plan: next });
    toast(tn('plan.autoDone', added));
  };

  const collect = () => {
    const have = new Set([...s.pantry, ...always]);
    const res = mergePlanIntoShopping(s.shopping, s.plan, byId, have);
    update({ shopping: res.list });
    if (res.added + res.updated + res.removed === 0) {
      toast(t(planNeeds(s.plan, byId, have).needs.size ? 'plan.collectSame' : 'plan.collectHaveAll'));
    } else {
      toast(t('plan.collectDone', { added: res.added, updated: res.updated }));
    }
    replace('/saved/shopping');
  };

  return (
    <>
      <p className="hint">{t('plan.lead')}</p>
      <button className="btn soft block-btn" onClick={autoFill}><Icon name="wand" size={18} />{t('plan.auto')}</button>
      <p className="hint">{t('plan.autoHint')}</p>

      {DAY_LIST.map((d) => {
        const dishes = s.plan[d].map((id) => byId.get(id)).filter((r): r is Recipe => !!r);
        return (
          <section className={`block plan-day${d === today ? ' is-today' : ''}`} key={d}>
            <div className="block-head">
              <h2>{dayName(d)}{d === today && <span className="tag almost">{t('plan.today')}</span>}</h2>
              <button className="link" onClick={() => setPicker({ day: d })} aria-label={t('plan.addAria', { day: dayName(d) })}><Icon name="plus" size={16} /> {t('plan.add')}</button>
            </div>
            {dishes.length === 0 && <p className="plan-empty">{t('plan.emptyDay')}</p>}
            {dishes.map((r) => (
              <article className="plan-dish" key={r.id}>
                <a href={`#/recipe/${r.id}`}>
                  <Photo r={r} />
                  <div className="grow">
                    <h3>{L(r.name)}</h3>
                    <Meta r={r} />
                  </div>
                </a>
                <button className="icon-btn small" onClick={() => setPicker({ day: d, replaceId: r.id })} aria-label={t('plan.replaceAria', { name: L(r.name) })} title={t('plan.replace')}><Icon name="swap" size={18} /></button>
                <button className="icon-btn small" onClick={() => planRemove(d, r.id)} aria-label={t('plan.removeAria', { name: L(r.name) })}><Icon name="x" size={18} /></button>
              </article>
            ))}
          </section>
        );
      })}

      {total > 0 && (
        <>
          <p className="hint">{tn('plan.count', total)}</p>
          <button className="btn ghost block-btn" onClick={() => { if (window.confirm(t('plan.clearConfirm'))) update({ plan: DAY_LIST.map(() => []) }); }}><Icon name="trash" size={18} />{t('plan.clear')}</button>
          <div className="sticky-cta">
            <button className="btn primary block-btn" onClick={collect}><Icon name="cart" size={18} />{t('plan.collect')}</button>
          </div>
        </>
      )}

      {picker && <DishPicker target={picker} onClose={() => setPicker(null)} />}
    </>
  );
}

/** Шторка выбора блюда на день: подборка «Сегодня», избранное и поиск по каталогу. */
function DishPicker({ target, onClose }: { target: PickerTarget; onClose: () => void }) {
  const { recipes, byId, productMap } = useDb();
  const s = useStore();
  const [q, setQ] = useState('');
  const inPlan = useMemo(() => new Set(planIds(s.plan)), [s.plan]);

  // Профиль — жёсткое ограничение (как везде); фильтры каталога ручному выбору не мешают.
  const allowed = useMemo(() => { const hidden = new Set(s.hidden); return recipes.filter((r) => passesProfile(r, s.prefs, hidden)); }, [recipes, s.prefs, s.hidden]);
  const allowedIds = useMemo(() => new Set(allowed.map((r) => r.id)), [allowed]);
  const fromIds = (ids: readonly string[] | undefined) => (ids ?? []).filter((id) => allowedIds.has(id) && id !== target.replaceId).map((id) => byId.get(id)!);
  const found = useMemo(() => (q.trim() ? searchRecipes(allowed, productMap, q, getLang()).slice(0, PICK_LIMIT) : []), [allowed, productMap, q]);

  const pick = (r: Recipe) => {
    if (target.replaceId) planReplace(target.day, target.replaceId, r.id);
    else planAdd(target.day, r.id);
    toast(t('plan.addedTo', { day: dayName(target.day) }));
    onClose();
  };
  const list = (title: string, items: Recipe[]) => items.length > 0 && (
    <section className="fgroup">
      <h3>{title}</h3>
      <ul className="pick-list">
        {items.map((r) => (
          <li key={r.id}>
            <button onClick={() => pick(r)}>
              <span className="pick-emoji" aria-hidden="true">{r.emoji}</span>
              <span className="grow"><b>{L(r.name)}</b><Meta r={r} /></span>
              {inPlan.has(r.id) && <span className="tag">{t('plan.inPlan')}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <Sheet title={t('plan.pickTitle', { day: dayName(target.day) })} onClose={onClose}>
      <label className="input">
        <Icon name="search" size={18} />
        <input type="search" value={q} placeholder={t('plan.pickSearch')} autoComplete="off" enterKeyHint="search" onChange={(e) => setQ(e.target.value)} />
      </label>
      {q.trim() ? (
        found.length ? list(t('plan.pickFound'), found) : <p className="hint pad">{t('plan.pickNothing')}</p>
      ) : (
        <>
          {list(t('plan.pickToday'), fromIds(s.today?.ids))}
          {list(t('plan.pickFavorites'), fromIds([...s.favorites].reverse()))}
          {list(t('plan.pickCatalog'), allowed.filter((r) => r.id !== target.replaceId).slice(0, PICK_LIMIT))}
        </>
      )}
      <p className="hint">{t('plan.pickNote')}</p>
    </Sheet>
  );
}

/** Кнопка на странице рецепта: «Добавить в план на неделю» → выбор дня. */
export function AddToPlanButton({ id }: { id: string }) {
  const plan = useStore().plan;
  const [open, setOpen] = useState(false);
  const today = weekdayIndex(new Date());
  return (
    <>
      <button className="btn ghost block-btn" onClick={() => setOpen(true)}><Icon name="calendar" size={18} />{t('plan.toPlan')}</button>
      {open && (
        <Sheet title={t('plan.chooseDay')} onClose={() => setOpen(false)}>
          <ul className="pick-list">
            {DAY_LIST.map((d) => (
              <li key={d}>
                <button onClick={() => { planAdd(d, id); toast(t('plan.addedTo', { day: dayName(d) })); setOpen(false); }}>
                  <span className="pick-emoji day" aria-hidden="true">{t(`plan.daysShort.${d}`)}</span>
                  <span className="grow"><b>{dayName(d)}</b>{plan[d].length > 0 && <small className="muted">{tn('plan.dishes', plan[d].length)}</small>}</span>
                  {plan[d].includes(id) && <span className="tag">{t('plan.inPlan')}</span>}
                  {d === today && <span className="tag almost">{t('plan.today')}</span>}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </>
  );
}
