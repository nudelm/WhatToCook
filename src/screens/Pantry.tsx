import { useMemo, useState } from 'react';
import { CATEGORIES } from '../constants';
import { useDb } from '../data';
import { activeGroups, selectRecipes } from '../engine/filters';
import { isStaple, rankByPantry, type Ranked } from '../engine/pantry';
import { t, tn } from '../i18n';
import { toast } from '../pwa';
import { addToShopping, togglePantry, update, useStore } from '../store';
import type { Product } from '../types';
import { Chip, FilterButton, FilterSheet, Icon, NoResults, ProductSearch, RecipeCard, Segmented, productName, useIncremental } from '../ui';

const POPULAR = 72;

export function Pantry() {
  const { recipes, products, productMap } = useDb();
  const s = useStore();
  const [tab, setTab] = useState<'products' | 'recipes'>('products');
  const [sheet, setSheet] = useState(false);

  const pantry = useMemo(() => new Set(s.pantry), [s.pantry]);
  const hidden = useMemo(() => new Set(s.hidden), [s.hidden]);
  const pool = useMemo(() => selectRecipes(recipes, s.prefs, s.filters, hidden), [recipes, s.prefs, s.filters, hidden]);
  const ranked = useMemo(() => rankByPantry(pool, pantry, productMap), [pool, pantry, productMap]);
  const inc = useIncremental(ranked.length, 20, s.pantry.join());

  // Самые частые продукты в базе, сгруппированные по отделам, — чтобы отмечать одним касанием.
  const popular = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of recipes) for (const i of r.ing) count.set(i.p, (count.get(i.p) ?? 0) + 1);
    const top = products
      .filter((p) => !isStaple(p) && !s.prefs.excluded.includes(p.id))
      .sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0))
      .slice(0, POPULAR);
    return CATEGORIES.map((cat) => ({ cat, items: top.filter((p) => p.cat === cat) })).filter((g) => g.items.length);
  }, [recipes, products, s.prefs.excluded]);

  const staples = useMemo(() => products.filter(isStaple).map(productName).join(', '), [products]);
  const selected = s.pantry.map((id) => productMap.get(id)).filter((p): p is Product => !!p);

  const addMissing = (x: Ranked) => {
    addToShopping(x.recipe.ing.filter((i) => x.match.missing.includes(i.p)).map((i) => ({ p: i.p, g: i.g })), x.recipe.id);
    toast(tn('shopping.added', x.match.missing.length));
  };

  return (
    <div className="page">
      <header className="hello">
        <h1>{t('pantry.title')}</h1>
        <p className="lead">{t('pantry.lead')}</p>
      </header>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[{ id: 'products', label: `${t('pantry.tabProducts')}${selected.length ? ` · ${selected.length}` : ''}` }, { id: 'recipes', label: `${t('pantry.tabRecipes')}${ranked.length ? ` · ${ranked.length}` : ''}` }]}
      />

      {tab === 'products' && (
        <>
          <ProductSearch onPick={(p) => togglePantry(p.id)} exclude={s.pantry} placeholder={t('pantry.searchPlaceholder')} />

          {selected.length > 0 && (
            <section className="block">
              <div className="block-head">
                <h2>{t('pantry.selected')}</h2>
                <button className="link" onClick={() => update({ pantry: [] })}>{t('pantry.clear')}</button>
              </div>
              <div className="chips">
                {selected.map((p) => <button key={p.id} className="chip on removable" onClick={() => togglePantry(p.id)} aria-label={t('pantry.remove', { name: productName(p) })}>{productName(p)}<Icon name="x" size={14} /></button>)}
              </div>
            </section>
          )}

          <p className="hint">{t('pantry.staples', { list: staples })}</p>

          {popular.map((g) => (
            <section className="block" key={g.cat}>
              <h2>{t(`categories.${g.cat}`)}</h2>
              <div className="chips">
                {g.items.map((p) => <Chip key={p.id} on={pantry.has(p.id)} onClick={() => togglePantry(p.id)}>{productName(p)}</Chip>)}
              </div>
            </section>
          ))}

          {selected.length > 0 && (
            <div className="sticky-cta">
              <button className="btn primary block-btn" onClick={() => { setTab('recipes'); window.scrollTo(0, 0); }}>
                {ranked.length ? tn('pantry.showRecipes', ranked.length) : t('pantry.noMatches')}
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'recipes' && (
        <>
          <div className="list-head">
            <span className="muted">{selected.length ? tn('counts.recipes', ranked.length) : ''}</span>
            <FilterButton onClick={() => setSheet(true)} />
          </div>

          {selected.length === 0 && (
            <div className="empty">
              <div className="empty-emoji">🧺</div>
              <h2>{t('pantry.emptyTitle')}</h2>
              <p>{t('pantry.emptyText')}</p>
              <button className="btn primary" onClick={() => setTab('products')}>{t('pantry.chooseProducts')}</button>
            </div>
          )}

          {selected.length > 0 && ranked.length === 0 && (
            activeGroups(s.filters).length > 0 ? <NoResults pool={recipes} /> : (
              <div className="empty">
                <div className="empty-emoji">🤔</div>
                <h2>{t('empty.title')}</h2>
                <p>{t('pantry.addMore')}</p>
                <button className="btn primary" onClick={() => setTab('products')}>{t('pantry.chooseProducts')}</button>
              </div>
            )
          )}

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
          {inc.sentinel}
        </>
      )}

      {sheet && <FilterSheet count={ranked.length} onClose={() => setSheet(false)} />}
    </div>
  );
}
