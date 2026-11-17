import { useMemo, useState } from 'react';
import { useDb } from '../data';
import { activeGroups, clearGroup, selectRecipes } from '../engine/filters';
import { SAUCE_FILTER_GROUPS, selectSauces } from '../engine/sauces';
import { searchRecipes } from '../engine/search';
import { dayNumber, rng, shuffle } from '../engine/today';
import { getLang, t, tn } from '../i18n';
import { setFilters, useStore } from '../store';
import { Chip, FilterButton, FilterSheet, Icon, NoResults, RecipeCard, useIncremental } from '../ui';

type Sort = 'mix' | 'fast' | 'light' | 'protein';
const SORTS: Sort[] = ['mix', 'fast', 'light', 'protein'];

// Поиск, сортировка и фильтр «Соусы» переживают переход в рецепт и обратно.
let savedQuery = '';
let savedSort: Sort = 'mix';
let savedSauces = false;

export function Catalog() {
  const { recipes, sauces, productMap } = useDb();
  const s = useStore();
  const [query, setQueryState] = useState(savedQuery);
  const [sort, setSortState] = useState<Sort>(savedSort);
  const [sauceMode, setSauceModeState] = useState(savedSauces);
  const [sheet, setSheet] = useState(false);
  const setQuery = (v: string) => { savedQuery = v; setQueryState(v); };
  const setSort = (v: Sort) => { savedSort = v; setSortState(v); };
  const setSauceMode = (v: boolean) => { savedSauces = v; setSauceModeState(v); };

  const hidden = useMemo(() => new Set(s.hidden), [s.hidden]);
  const dishes = useMemo(() => selectRecipes(recipes, s.prefs, s.filters, hidden), [recipes, s.prefs, s.filters, hidden]);
  // Соусы — отдельно: к ним применяются только подходящие фильтры (время, калории, питание).
  const sauceList = useMemo(() => selectSauces(sauces, s.prefs, s.filters, { bases: [] }, hidden), [sauces, s.prefs, s.filters, hidden]);
  const filtered = sauceMode ? sauceList : dishes;
  const list = useMemo(() => {
    const found = searchRecipes(filtered, productMap, query, getLang());
    if (sort === 'fast') return [...found].sort((a, b) => a.total - b.total);
    if (sort === 'light') return [...found].sort((a, b) => a.kcal - b.kcal);
    if (sort === 'protein') return [...found].sort((a, b) => b.protein - a.protein);
    // «Вперемешку»: порядок меняется раз в день, чтобы каталог не начинался всегда с одних и тех же блюд.
    return query.trim() ? found : shuffle(found, rng(`catalog-${dayNumber(new Date())}`));
  }, [filtered, productMap, query, sort]);

  const inc = useIncremental(list.length, 24, `${query}|${sort}|${sauceMode}|${JSON.stringify(s.filters)}`);
  const groups = activeGroups(s.filters).filter((g) => !sauceMode || SAUCE_FILTER_GROUPS.includes(g));
  const sheetGroups = sauceMode ? SAUCE_FILTER_GROUPS : undefined;

  // Без фильтров и поиска соусы не накручивают счётчик блюд: показываем их отдельно.
  const countText = sauceMode
    ? tn('counts.sauces', list.length)
    : !query.trim() && groups.length === 0 ? t('catalog.countSplit', { dishes: list.length, sauces: sauceList.length }) : tn('counts.recipes', list.length);

  return (
    <div className="page">
      <header className="hello"><h1>{t('catalog.title')}</h1></header>

      <div className="search-row">
        <label className="input grow">
          <Icon name="search" size={18} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t(sauceMode ? 'catalog.searchSauces' : 'catalog.searchPlaceholder')} enterKeyHint="search" autoComplete="off" />
        </label>
        <FilterButton groups={sheetGroups} onClick={() => setSheet(true)} />
      </div>

      <div className="chips scroll-x">
        <Chip on={sauceMode} onClick={() => setSauceMode(!sauceMode)}><span aria-hidden="true">🥣</span> {t('catalog.sauces')}</Chip>
        {groups.map((g) => (
          <button key={g} className="chip on removable" onClick={() => setFilters(clearGroup(s.filters, g))}>{t(`filters.groups.${g}`)}<Icon name="x" size={14} /></button>
        ))}
      </div>
      {sauceMode && <a className="hint link" href="#/sauces">{t('catalog.saucesByBase')} →</a>}

      <div className="list-head">
        <span className="muted">{countText}</span>
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
        ) : sauceMode ? (
          <div className="empty">
            <div className="empty-emoji">🥣</div>
            <h2>{t('sauces.notFound')}</h2>
            <p>{t('sauces.notFoundHint')}</p>
          </div>
        ) : <NoResults pool={recipes} />
      ) : (
        <div className="grid">
          {list.slice(0, inc.shown).map((r, i) => <RecipeCard key={r.id} r={r} eager={i < 4} />)}
        </div>
      )}
      {inc.sentinel}

      {sheet && <FilterSheet count={list.length} groups={sheetGroups} onClose={() => setSheet(false)} />}
    </div>
  );
}
