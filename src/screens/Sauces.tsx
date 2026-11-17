// «К чему соус?»: выбираешь основу (рис, мясо, картошка…) — получаешь быстрые соусы, чтобы просто полить.
import { useMemo, useState } from 'react';
import { useDb } from '../data';
import { activeGroups, clearGroup } from '../engine/filters';
import type { Ranked } from '../engine/pantry';
import { PAIRS, rankSaucesByPantry, SAUCE_FILTER_GROUPS, selectSauces } from '../engine/sauces';
import { t, tn } from '../i18n';
import { toast } from '../pwa';
import { back } from '../router';
import { addToShopping, setFilters, toggle, useStore } from '../store';
import { Chip, FilterButton, FilterSheet, Icon, RecipeCard, TopBar, productName, useAlways, useIncremental } from '../ui';

// Выбор переживает переход в рецепт соуса и обратно.
let savedBases: string[] = [];
let savedNoCook = false;
let savedFromPantry = false;

export function Sauces() {
  const { sauces, productMap } = useDb();
  const s = useStore();
  const always = useAlways();
  const [bases, setBasesState] = useState(savedBases);
  const [noCook, setNoCookState] = useState(savedNoCook);
  const [fromPantry, setFromPantryState] = useState(savedFromPantry);
  const [sheet, setSheet] = useState(false);
  const setBases = (v: string[]) => { savedBases = v; setBasesState(v); };
  const setNoCook = (v: boolean) => { savedNoCook = v; setNoCookState(v); };
  const setFromPantry = (v: boolean) => { savedFromPantry = v; setFromPantryState(v); };

  const hidden = useMemo(() => new Set(s.hidden), [s.hidden]);
  const pantry = useMemo(() => new Set(s.pantry), [s.pantry]);
  const list = useMemo(() => selectSauces(sauces, s.prefs, s.filters, { bases, noCookOnly: noCook }, hidden), [sauces, s.prefs, s.filters, bases, noCook, hidden]);
  const ranked = useMemo(() => (fromPantry ? rankSaucesByPantry(list, pantry, productMap, always) : []), [fromPantry, list, pantry, productMap, always]);
  const count = fromPantry ? ranked.length : list.length;
  const inc = useIncremental(count, 24, `${bases.join()}|${noCook}|${fromPantry}|${JSON.stringify(s.filters)}`);
  const groups = activeGroups(s.filters).filter((g) => SAUCE_FILTER_GROUPS.includes(g));

  const addMissing = (x: Ranked) => {
    addToShopping(x.recipe.ing.filter((i) => x.match.missing.includes(i.p)).map((i) => ({ p: i.p, g: i.g })), x.recipe.id);
    toast(tn('shopping.added', x.match.missing.length));
  };
  const reset = () => {
    setBases([]);
    setNoCook(false);
    setFromPantry(false);
    setFilters(groups.reduce((f, g) => clearGroup(f, g), s.filters));
  };

  return (
    <div className="page">
      <TopBar title={t('sauces.title')} onBack={() => back('/')} />
      <p className="lead">{t('sauces.lead')}</p>

      <h2 className="section-title">{t('sauces.baseTitle')}</h2>
      <div className="chips" role="group" aria-label={t('sauces.baseTitle')}>
        {PAIRS.map((p) => <Chip key={p} on={bases.includes(p)} onClick={() => setBases(toggle(bases, p))}>{t(`pairs.${p}`)}</Chip>)}
      </div>

      <div className="chips scroll-x sauce-options">
        <Chip icon="clock" on={noCook} onClick={() => setNoCook(!noCook)}>{t('sauces.noCookOnly')}</Chip>
        <Chip icon="pantry" on={fromPantry} onClick={() => setFromPantry(!fromPantry)}>{t('sauces.fromPantry')}</Chip>
        <FilterButton groups={SAUCE_FILTER_GROUPS} onClick={() => setSheet(true)} />
      </div>

      {groups.length > 0 && (
        <div className="chips scroll-x">
          {groups.map((g) => (
            <button key={g} className="chip on removable" onClick={() => setFilters(clearGroup(s.filters, g))}>{t(`filters.groups.${g}`)}<Icon name="x" size={14} /></button>
          ))}
        </div>
      )}

      <div className="list-head">
        <span className="muted">{tn('counts.sauces', count)}</span>
        {bases.length > 0 && <button className="btn ghost small" onClick={() => setBases([])}>{t('sauces.clearBases')}</button>}
      </div>

      {fromPantry && pantry.size === 0 ? (
        <div className="empty">
          <div className="empty-emoji">🧺</div>
          <h2>{t('pantry.emptyTitle')}</h2>
          <p>{t('sauces.pantryEmpty')}</p>
          <a className="btn primary" href="#/pantry">{t('pantry.chooseProducts')}</a>
        </div>
      ) : count === 0 ? (
        <div className="empty">
          <div className="empty-emoji">🥣</div>
          <h2>{t('sauces.notFound')}</h2>
          <p>{t(fromPantry ? 'sauces.notFoundPantry' : 'sauces.notFoundHint')}</p>
          <button className="btn soft" onClick={reset}>{t('filters.resetAll')}</button>
        </div>
      ) : fromPantry ? (
        <div className="rows">
          {ranked.slice(0, inc.shown).map((x) => (
            <RecipeCard
              key={x.recipe.id}
              r={x.recipe}
              variant="row"
              action={x.match.missing.length > 0 ? (
                <button className="mini-btn" onClick={() => addMissing(x)} aria-label={t('pantry.addMissing')}><Icon name="cart" size={16} />{t('pantry.toList')}</button>
              ) : undefined}
            >
              <div className="match">
                <div className="bar"><i style={{ width: `${x.match.pct}%` }} className={x.match.status} /></div>
                <b>{x.match.pct}%</b>
                {x.match.status !== 'partial' && <span className={`tag ${x.match.status}`}>{t(`pantry.status.${x.match.status}`)}</span>}
              </div>
              {x.match.missing.length > 0 && (
                <p className="missing">{t('pantry.missing')}: {x.match.missing.map((id) => productName(productMap.get(id))).join(', ')}</p>
              )}
              {x.match.subs.length > 0 && (
                <p className="subs">{t('pantry.subs')}: {x.match.subs.map((y) => `${productName(productMap.get(y.missing))} → ${productName(productMap.get(y.with))}`).join(', ')}</p>
              )}
            </RecipeCard>
          ))}
        </div>
      ) : (
        <div className="grid">
          {list.slice(0, inc.shown).map((r, i) => <RecipeCard key={r.id} r={r} eager={i < 4} />)}
        </div>
      )}
      {inc.sentinel}

      {sheet && <FilterSheet count={count} groups={SAUCE_FILTER_GROUPS} onClose={() => setSheet(false)} />}
    </div>
  );
}
