import { useMemo, useState } from 'react';
import { useDb } from '../data';
import { activeGroups, clearGroup, selectRecipes } from '../engine/filters';
import { searchRecipes } from '../engine/search';
import { dayNumber, rng, shuffle } from '../engine/today';
import { getLang, t, tn } from '../i18n';
import { setFilters, useStore } from '../store';
import { Chip, FilterButton, FilterSheet, Icon, NoResults, RecipeCard, useIncremental } from '../ui';

type Sort = 'mix' | 'fast' | 'light' | 'protein';
const SORTS: Sort[] = ['mix', 'fast', 'light', 'protein'];

// Поиск и сортировка переживают переход в рецепт и обратно.
let savedQuery = '';
let savedSort: Sort = 'mix';

export function Catalog() {
  const { recipes, productMap } = useDb();
  const s = useStore();
  const [query, setQueryState] = useState(savedQuery);
  const [sort, setSortState] = useState<Sort>(savedSort);
  const [sheet, setSheet] = useState(false);
  const setQuery = (v: string) => { savedQuery = v; setQueryState(v); };
  const setSort = (v: Sort) => { savedSort = v; setSortState(v); };

  const hidden = useMemo(() => new Set(s.hidden), [s.hidden]);
  const filtered = useMemo(() => selectRecipes(recipes, s.prefs, s.filters, hidden), [recipes, s.prefs, s.filters, hidden]);
  const list = useMemo(() => {
    const found = searchRecipes(filtered, productMap, query, getLang());
    if (sort === 'fast') return [...found].sort((a, b) => a.total - b.total);
    if (sort === 'light') return [...found].sort((a, b) => a.kcal - b.kcal);
    if (sort === 'protein') return [...found].sort((a, b) => b.protein - a.protein);
    // «Вперемешку»: порядок меняется раз в день, чтобы каталог не начинался всегда с одних и тех же блюд.
    return query.trim() ? found : shuffle(found, rng(`catalog-${dayNumber(new Date())}`));
  }, [filtered, productMap, query, sort]);

  const inc = useIncremental(list.length, 24, `${query}|${sort}|${JSON.stringify(s.filters)}`);
  const groups = activeGroups(s.filters);

  return (
    <div className="page">
      <header className="hello"><h1>{t('catalog.title')}</h1></header>

      <div className="search-row">
        <label className="input grow">
          <Icon name="search" size={18} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('catalog.searchPlaceholder')} enterKeyHint="search" autoComplete="off" />
        </label>
        <FilterButton onClick={() => setSheet(true)} />
      </div>

      {groups.length > 0 && (
        <div className="chips scroll-x">
          {groups.map((g) => (
            <button key={g} className="chip on removable" onClick={() => setFilters(clearGroup(s.filters, g))}>{t(`filters.groups.${g}`)}<Icon name="x" size={14} /></button>
          ))}
        </div>
      )}

      <div className="list-head">
        <span className="muted">{tn('counts.recipes', list.length)}</span>
        <div className="chips tight">
          {SORTS.map((x) => <Chip key={x} on={sort === x} onClick={() => setSort(x)}>{t(`catalog.sort.${x}`)}</Chip>)}
        </div>
      </div>

      {list.length === 0 ? (
        query.trim() && filtered.length > 0 ? (
          <div className="empty">
            <div className="empty-emoji">🔎</div>
            <h2>{t('catalog.notFound', { q: query.trim() })}</h2>
            <p>{t('catalog.notFoundHint')}</p>
            <button className="btn soft" onClick={() => setQuery('')}>{t('catalog.clearSearch')}</button>
          </div>
        ) : <NoResults pool={recipes} />
      ) : (
        <div className="grid">
          {list.slice(0, inc.shown).map((r, i) => <RecipeCard key={r.id} r={r} eager={i < 4} />)}
        </div>
      )}
      {inc.sentinel}

      {sheet && <FilterSheet count={list.length} onClose={() => setSheet(false)} />}
    </div>
  );
}
