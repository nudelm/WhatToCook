import { useMemo } from 'react';
import { CATEGORIES } from '../constants';
import { useDb } from '../data';
import { passesProfile } from '../engine/filters';
import { formatWeight, niceNumber } from '../engine/format';
import { L, t, tn } from '../i18n';
import { replace } from '../router';
import { addToShopping, clearShopping, removeBought, toggleShopping, useStore, type ShoppingItem } from '../store';
import type { Product, Recipe } from '../types';
import { Icon, ProductSearch, RecipeCard, Segmented, productName } from '../ui';

/** «≈ 2 шт.» для штучных продуктов, миллилитры для жидкостей, иначе граммы. */
function amountText(p: Product, g: number): string {
  if (!g) return '';
  if (p.piece) {
    const n = Math.max(1, Math.ceil(g / p.piece[1] - 0.15));
    return `≈ ${niceNumber(n)} ${t(`units.${p.piece[0]}`)}`;
  }
  if (p.liq) return formatWeight(g / (p.density ?? 1), t('units.ml'), t('units.l'));
  return formatWeight(g, t('units.g'), t('units.kg'));
}

export function Saved({ tab }: { tab: 'favorites' | 'shopping' }) {
  const { byId, productMap } = useDb();
  const s = useStore();
  const hidden = useMemo(() => new Set(s.hidden), [s.hidden]);
  const favorites = s.favorites.map((id) => byId.get(id)).filter((r): r is Recipe => !!r && passesProfile(r, s.prefs, hidden)).reverse();

  const groups = useMemo(() => {
    const items = s.shopping.map((it) => ({ it, p: productMap.get(it.p) })).filter((x): x is { it: ShoppingItem; p: Product } => !!x.p);
    return CATEGORIES.map((cat) => ({ cat, items: items.filter((x) => x.p.cat === cat).sort((a, b) => Number(a.it.done) - Number(b.it.done)) })).filter((g) => g.items.length);
  }, [s.shopping, productMap]);
  const left = s.shopping.filter((x) => !x.done).length;
  const bought = s.shopping.length - left;

  return (
    <div className="page">
      <header className="hello"><h1>{t('saved.title')}</h1></header>
      <Segmented
        value={tab}
        onChange={(v) => replace(v === 'shopping' ? '/saved/shopping' : '/saved')}
        options={[{ id: 'favorites', label: `${t('saved.favorites')}${favorites.length ? ` · ${favorites.length}` : ''}` }, { id: 'shopping', label: `${t('saved.shopping')}${left ? ` · ${left}` : ''}` }]}
      />

      {tab === 'favorites' && (
        favorites.length ? (
          <div className="grid">{favorites.map((r) => <RecipeCard key={r.id} r={r} />)}</div>
        ) : (
          <div className="empty">
            <div className="empty-emoji">❤️</div>
            <h2>{t('saved.noFavorites')}</h2>
            <p>{t('saved.noFavoritesText')}</p>
            <a className="btn primary" href="#/catalog">{t('saved.openCatalog')}</a>
          </div>
        )
      )}

      {tab === 'shopping' && (
        <>
          <ProductSearch onPick={(p) => addToShopping([{ p: p.id, g: 0 }])} placeholder={t('shopping.addPlaceholder')} />
          {s.shopping.length === 0 ? (
            <div className="empty">
              <div className="empty-emoji">🛒</div>
              <h2>{t('shopping.empty')}</h2>
              <p>{t('shopping.emptyText')}</p>
            </div>
          ) : (
            <>
              <p className="hint">{tn('shopping.left', left)}</p>
              {groups.map((g) => (
                <section className="block" key={g.cat}>
                  <h2>{t(`categories.${g.cat}`)}</h2>
                  <ul className="checklist">
                    {g.items.map(({ it, p }) => (
                      <li key={it.p}>
                        <label className={it.done ? 'done' : ''}>
                          <input type="checkbox" checked={it.done} onChange={() => toggleShopping(it.p)} />
                          <span className="box"><Icon name="check" size={16} /></span>
                          <span className="grow">
                            <span className="name">{productName(p)}</span>
                            {it.from.length > 0 && <small>{it.from.map((id) => L(byId.get(id)?.name)).filter(Boolean).join(', ')}</small>}
                          </span>
                          <span className="amount">{amountText(p, it.g)}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <div className="actions">
                {bought > 0 && <button className="btn soft grow" onClick={removeBought}><Icon name="check" size={18} />{t('shopping.removeBought')}</button>}
                <button className="btn ghost grow" onClick={() => { if (window.confirm(t('shopping.clearConfirm'))) clearShopping(); }}><Icon name="trash" size={18} />{t('shopping.clear')}</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
