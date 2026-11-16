// Общие кирпичики интерфейса: иконки, фото, карточка блюда, чипы, шторка, фильтры, нижняя навигация.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ALLERGENS, CUISINES, FILTER_DIETS, KCAL_OPTIONS, TIME_OPTIONS, TYPES } from './constants';
import { BASE, useDb } from './data';
import { activeGroups, clearGroup, emptyFilters, nearest, relaxOptions, type Filters, type FilterGroup } from './engine/filters';
import { formatMinutes } from './engine/format';
import { alwaysHave } from './engine/pantry';
import { searchProducts } from './engine/search';
import { L, getLang, t, tn } from './i18n';
import { dismissUpdate, installUpdate, promptInstall, useCanInstall, useToast, useUpdateReady } from './pwa';
import { setFilters, toggle, toggleFavorite, update, useStore } from './store';
import { formatLeft, stopTimer, useTimers } from './timers';
import type { Product, Recipe } from './types';

// ---------- иконки ----------
const ICONS: Record<string, string> = {
  today: 'M3 18h18M5 18a7 7 0 0 1 14 0M12 8V6M10 6h4',
  pantry: 'M5 10h14l-1.5 9h-11zM9 10l3-6 3 6',
  catalog: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  heart: 'M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  flame: 'M12 3s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z',
  back: 'M15 5l-7 7 7 7',
  chevron: 'M9 5l7 7-7 7',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  filter: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
  dice: 'M5 5h14v14H5zM9 9h.01M15 15h.01M12 12h.01M15 9h.01M9 15h.01',
  refresh: 'M20 11a8 8 0 0 0-14.5-4M4 4v4h4M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12M18 6L6 18',
  eyeoff: 'M3 3l18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-3 3.4M6.5 7.6A15 15 0 0 0 3 12s4 6 9 6a9 9 0 0 0 3-.5M9.9 9.9a3 3 0 0 0 4.2 4.2',
  cart: 'M4 5h2l2 11h10l2-8H7M9 20h.01M17 20h.01',
  timer: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4M10 2h4',
  pot: 'M5 10h14v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3zM3 10h18M9 6c0-1 1-1 1-2M14 6c0-1 1-1 1-2',
  trash: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  shield: 'M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  calendar: 'M5 6h14v14H5zM5 10h14M9 3v4M15 3v4',
  wand: 'M5 19L16 8M14 6l4 4M18 3v3M16.5 4.5h3M6 5v2M5 6h2M19 14v2M18 15h2',
  swap: 'M7 7h12l-3-3M17 17H5l3 3',
};

export function Icon({ name, size = 20, fill }: { name: string; size?: number; fill?: boolean }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

// ---------- подписи ----------
const unit = (u: string) => t(`units.${u}`);
export const minutes = (m: number) => formatMinutes(m, unit('min'), unit('h'));
export const productName = (p: Product | undefined) => (p ? L(p.name) : '');

/** Продукты «Есть всегда» с учётом настроек профиля. */
export function useAlways(): Set<string> {
  const { products } = useDb();
  const prefs = useStore().always;
  return useMemo(() => alwaysHave(products, prefs), [products, prefs]);
}

// ---------- фото блюда ----------
/** Фото с ленивой загрузкой. Если фото нет или оно не загрузилось (офлайн) — цветная плашка с эмодзи. */
export function Photo({ r, eager }: { r: Recipe; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!r.photo || failed) {
    return <div className={`photo photo-fallback cuisine-${r.cuisine}`} aria-hidden="true"><span>{r.emoji}</span></div>;
  }
  return (
    <div className={`photo cuisine-${r.cuisine}`}>
      <img src={`${BASE}photos/${r.photo}`} alt="" width={800} height={600} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} />
    </div>
  );
}

export function Meta({ r }: { r: Recipe }) {
  return (
    <div className="meta">
      <span><Icon name="clock" size={15} />{minutes(r.total)}</span>
      <span><Icon name="flame" size={15} />{t('recipe.kcalApprox', { n: r.kcal })}</span>
    </div>
  );
}

// ---------- карточка блюда ----------
export function RecipeCard({ r, variant = 'tile', eager, children, action }: { r: Recipe; variant?: 'hero' | 'tile' | 'row'; eager?: boolean; children?: ReactNode; action?: ReactNode }) {
  const fav = useStore().favorites.includes(r.id);
  return (
    <article className={`card card-${variant}`}>
      <a className="card-link" href={`#/recipe/${r.id}`}>
        <Photo r={r} eager={eager} />
        <div className="card-body">
          <h3>{L(r.name)}</h3>
          {variant === 'hero' && <p className="card-desc">{L(r.desc)}</p>}
          <Meta r={r} />
          {children}
        </div>
      </a>
      <button className={`fav${fav ? ' on' : ''}`} aria-pressed={fav} aria-label={t(fav ? 'recipe.unfavorite' : 'recipe.favorite')} onClick={() => toggleFavorite(r.id)}>
        <Icon name="heart" fill={fav} size={18} />
      </button>
      {action && <div className="card-action">{action}</div>}
    </article>
  );
}

// ---------- мелочи ----------
export function Chip({ on, onClick, children, icon }: { on?: boolean; onClick?: () => void; children: ReactNode; icon?: string }) {
  return (
    <button type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={!!on} onClick={onClick}>
      {icon && <Icon name={icon} size={16} />}{children}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export function TopBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="topbar">
      {onBack && <button className="icon-btn" onClick={onBack} aria-label={t('common.back')}><Icon name="back" /></button>}
      <h1>{title}</h1>
      {right}
    </header>
  );
}

/** Шторка, выезжающая снизу. */
export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('no-scroll'); };
  }, [onClose]);
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}><Icon name="x" /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- фильтры ----------
export function FilterSheet({ count, onClose }: { count: number; onClose: () => void }) {
  const f = useStore().filters;
  const set = (patch: Partial<Filters>) => setFilters({ ...f, ...patch });
  return (
    <Sheet
      title={t('filters.title')}
      onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={() => setFilters(emptyFilters)}>{t('filters.reset')}</button>
        <button className="btn primary grow" onClick={onClose}>{tn('filters.show', count)}</button>
      </>}
    >
      <section className="fgroup">
        <h3>{t('filters.time')}</h3>
        <div className="chips">
          {TIME_OPTIONS.map((m) => <Chip key={m} on={f.maxTime === m} onClick={() => set({ maxTime: f.maxTime === m ? 0 : m })}>{t('filters.upToMin', { n: m })}</Chip>)}
          <Chip on={f.maxTime === 0} onClick={() => set({ maxTime: 0 })}>{t('filters.any')}</Chip>
        </div>
      </section>
      <section className="fgroup">
        <h3>{t('filters.kcal')}</h3>
        <div className="chips">
          {KCAL_OPTIONS.map((k) => <Chip key={k} on={f.maxKcal === k} onClick={() => set({ maxKcal: f.maxKcal === k ? 0 : k })}>{t('filters.upToKcal', { n: k })}</Chip>)}
          <Chip on={f.maxKcal === 0} onClick={() => set({ maxKcal: 0 })}>{t('filters.any')}</Chip>
        </div>
      </section>
      <section className="fgroup">
        <h3>{t('filters.diets')}</h3>
        <div className="chips">
          <Chip on={f.highProtein} onClick={() => set({ highProtein: !f.highProtein })}>{t('diets.highProtein')}</Chip>
          {FILTER_DIETS.map((d) => <Chip key={d} on={f.diets.includes(d)} onClick={() => set({ diets: toggle(f.diets, d) })}>{t(`diets.${d}`)}</Chip>)}
        </div>
      </section>
      <section className="fgroup">
        <h3>{t('filters.type')}</h3>
        <div className="chips">{TYPES.map((x) => <Chip key={x} on={f.types.includes(x)} onClick={() => set({ types: toggle(f.types, x) })}>{t(`types.${x}`)}</Chip>)}</div>
      </section>
      <section className="fgroup">
        <h3>{t('filters.cuisine')}</h3>
        <div className="chips">{CUISINES.map((x) => <Chip key={x} on={f.cuisines.includes(x)} onClick={() => set({ cuisines: toggle(f.cuisines, x) })}>{t(`cuisines.${x}`)}</Chip>)}</div>
      </section>
      <section className="fgroup">
        <h3>{t('filters.difficulty')}</h3>
        <div className="chips">{[1, 2, 3].map((d) => <Chip key={d} on={f.difficulty.includes(d)} onClick={() => set({ difficulty: toggle(f.difficulty, d) })}>{t(`difficulty.${d}`)}</Chip>)}</div>
      </section>
      <section className="fgroup">
        <h3>{t('filters.equipment')}</h3>
        <div className="chips">
          <Chip on={f.noOven} onClick={() => set({ noOven: !f.noOven })}>{t('filters.noOven')}</Chip>
          <Chip on={f.onePan} onClick={() => set({ onePan: !f.onePan })}>{t('filters.onePan')}</Chip>
          <Chip on={f.multicooker} onClick={() => set({ multicooker: !f.multicooker })}>{t('filters.multicooker')}</Chip>
        </div>
      </section>
      <p className="hint">{t('filters.profileNote')}</p>
    </Sheet>
  );
}

/** Кнопка «Фильтры» с числом включённых групп. */
export function FilterButton({ onClick }: { onClick: () => void }) {
  const n = activeGroups(useStore().filters).length;
  return (
    <button className={`chip filter-btn${n ? ' on' : ''}`} onClick={onClick}>
      <Icon name="filter" size={16} />{t('filters.title')}{n > 0 && <b className="badge">{n}</b>}
    </button>
  );
}

const groupLabel = (g: FilterGroup) => t(`filters.groups.${g}`);

/** Вместо пустого экрана: какой фильтр снять и ближайшие подходящие блюда. */
export function NoResults({ pool }: { pool: readonly Recipe[] }) {
  const s = useStore();
  const hidden = useMemo(() => new Set(s.hidden), [s.hidden]);
  const options = useMemo(() => relaxOptions(pool, s.prefs, s.filters, hidden), [pool, s.prefs, s.filters, hidden]);
  const near = useMemo(() => nearest(pool, s.prefs, s.filters, hidden, 6), [pool, s.prefs, s.filters, hidden]);
  const hasFilters = activeGroups(s.filters).length > 0;
  return (
    <div className="empty">
      <div className="empty-emoji">🍽️</div>
      <h2>{t('empty.title')}</h2>
      <p>{t(hasFilters ? 'empty.relax' : 'empty.profile')}</p>
      <div className="relax">
        {options.map((o) => (
          <button key={o.group} className="btn soft" onClick={() => setFilters(clearGroup(s.filters, o.group))}>
            {t('empty.remove', { name: groupLabel(o.group) })} <span className="muted">{tn('counts.dishes', o.count)}</span>
          </button>
        ))}
        {hasFilters && <button className="btn ghost" onClick={() => setFilters(emptyFilters)}>{t('filters.resetAll')}</button>}
        {!hasFilters && <a className="btn soft" href="#/profile">{t('empty.openProfile')}</a>}
      </div>
      {near.length > 0 && <>
        <h3 className="section-title">{t('empty.nearest')}</h3>
        <div className="rows">{near.map((r) => <RecipeCard key={r.id} r={r} variant="row" />)}</div>
      </>}
    </div>
  );
}

// ---------- поиск продукта с подсказками ----------
export function ProductSearch({ onPick, exclude, placeholder }: { onPick: (p: Product) => void; exclude?: readonly string[]; placeholder: string }) {
  const { products } = useDb();
  const [q, setQ] = useState('');
  const found = useMemo(() => searchProducts(products, q, getLang(), 8).filter((p) => !exclude?.includes(p.id)), [products, q, exclude]);
  const pick = (p: Product) => { onPick(p); setQ(''); };
  return (
    <div className="psearch">
      <label className="input">
        <Icon name="search" size={18} />
        <input
          type="search" value={q} placeholder={placeholder} enterKeyHint="done" autoComplete="off"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && found[0]) pick(found[0]); }}
        />
      </label>
      {q.trim() !== '' && (
        <ul className="suggest">
          {found.map((p) => (
            <li key={p.id}><button onClick={() => pick(p)}><Icon name="plus" size={16} />{productName(p)}<span className="muted">{t(`categories.${p.cat}`)}</span></button></li>
          ))}
          {found.length === 0 && <li className="muted pad">{t('pantry.notFound')}</li>}
        </ul>
      )}
    </div>
  );
}

// ---------- нижняя навигация ----------
const TABS = [
  { id: 'today', path: '/', icon: 'today' },
  { id: 'pantry', path: '/pantry', icon: 'pantry' },
  { id: 'catalog', path: '/catalog', icon: 'catalog' },
  { id: 'saved', path: '/saved', icon: 'heart' },
  { id: 'profile', path: '/profile', icon: 'user' },
];

export function BottomNav({ active }: { active: string }) {
  const shoppingLeft = useStore().shopping.filter((x) => !x.done).length;
  return (
    <nav className="nav" aria-label={t('nav.label')}>
      {TABS.map((tab) => (
        <a key={tab.id} href={`#${tab.path}`} className={active === tab.id ? 'on' : ''} aria-current={active === tab.id ? 'page' : undefined}>
          <span className="nav-icon"><Icon name={tab.icon} size={24} />{tab.id === 'saved' && shoppingLeft > 0 && <b className="dot" />}</span>
          <span>{t(`nav.${tab.id}`)}</span>
        </a>
      ))}
    </nav>
  );
}

// ---------- таймеры и плашка обновления поверх экрана ----------
/** Плашка «Доступна новая версия». Живёт в стеке TimerBar, поэтому не показывается в режиме «Готовлю». */
function UpdateBanner() {
  return (
    <div className="update-pill" role="status">
      <Icon name="refresh" size={18} />
      <span className="grow">{t('pwa.updateAvailable')}</span>
      <button className="btn primary small" onClick={installUpdate}>{t('pwa.update')}</button>
      <button className="icon-btn small" onClick={dismissUpdate} aria-label={t('common.close')}><Icon name="x" size={16} /></button>
    </div>
  );
}

export function TimerBar({ withNav }: { withNav: boolean }) {
  const { timers, now } = useTimers();
  const { byId } = useDb();
  const updateReady = useUpdateReady();
  if (!timers.length && !updateReady) return null;
  return (
    <div className={`timerbar${withNav ? ' above-nav' : ''}`}>
      {updateReady && <UpdateBanner />}
      {timers.map((tm) => (
        <div key={tm.key} className={`timer-pill${tm.done ? ' done' : ''}`}>
          <a href={`#/cook/${tm.recipeId}/${tm.step}`}>
            <Icon name="timer" size={18} />
            <b>{tm.done ? t('timer.done') : formatLeft(tm.endsAt - now)}</b>
            <span>{L(byId.get(tm.recipeId)?.name)} · {t('cook.stepN', { n: tm.step + 1 })}</span>
          </a>
          <button className="icon-btn small" onClick={() => stopTimer(tm.key)} aria-label={t('timer.stop')}><Icon name="x" size={16} /></button>
        </div>
      ))}
    </div>
  );
}

export function Toast() {
  const toast = useToast();
  return toast ? <div key={toast.id} className="toast" role="status">{toast.text}</div> : null;
}

/** Баннер «Добавить на главный экран». Показывается, только когда браузер готов установить приложение. */
export function InstallBanner() {
  const can = useCanInstall();
  const dismissed = useStore().installDismissed;
  if (!can || dismissed) return null;
  return (
    <div className="install">
      <div className="install-icon">🍲</div>
      <div className="grow"><b>{t('install.title')}</b><p>{t('install.text')}</p></div>
      <button className="btn primary small" onClick={() => void promptInstall()}>{t('install.button')}</button>
      <button className="icon-btn small" onClick={() => update({ installDismissed: true })} aria-label={t('common.close')}><Icon name="x" size={16} /></button>
    </div>
  );
}

/** Подгружает элементы списка порциями по мере прокрутки, чтобы длинный каталог открывался мгновенно. */
export function useIncremental(total: number, step = 24, resetKey = ''): { shown: number; sentinel: ReactNode } {
  const [shown, setShown] = useState(step);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setShown(step), [resetKey, step]);
  useEffect(() => {
    const el = ref.current;
    if (!el || shown >= total) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setShown((n) => n + step); }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, total, step]);
  return { shown: Math.min(shown, total), sentinel: shown < total ? <div ref={ref} className="sentinel" /> : null };
}

export { ALLERGENS };
