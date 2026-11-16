import { useEffect, useState } from 'react';
import { DbContext, loadDb, type Db } from './data';
import { L, setLang, t } from './i18n';
import { toast } from './pwa';
import { useRoute } from './router';
import { Catalog } from './screens/Catalog';
import { Cook } from './screens/Cook';
import { About, Onboarding, Privacy } from './screens/Info';
import { Pantry } from './screens/Pantry';
import { Profile } from './screens/Profile';
import { RecipeView } from './screens/RecipeView';
import { Saved } from './screens/Saved';
import { Today } from './screens/Today';
import { useStore } from './store';
import { setTimerDoneHandler } from './timers';
import { BottomNav, TimerBar, Toast } from './ui';

const THEME_COLORS = { light: '#FAF5EC', dark: '#17110D' };

export function App() {
  const s = useStore();
  const route = useRoute();
  const [db, setDb] = useState<Db | null>(null);
  const [failed, setFailed] = useState(false);

  const load = () => { setFailed(false); loadDb().then(setDb).catch(() => setFailed(true)); };
  useEffect(load, []);
  useEffect(() => setLang(s.lang), [s.lang]);

  // Тема: «как в системе», светлая или тёмная.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme = s.theme === 'auto' ? (media.matches ? 'dark' : 'light') : s.theme;
      document.documentElement.dataset.theme = theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [s.theme]);

  useEffect(() => {
    if (!db) return;
    setTimerDoneHandler((tm) => toast(t('timer.finished', { name: L(db.byId.get(tm.recipeId)?.name) })));
  }, [db]);

  if (failed) {
    return (
      <div className="splash">
        <div className="empty-emoji">📡</div>
        <h2>{t('common.loadError')}</h2>
        <p>{t('common.loadErrorText')}</p>
        <button className="btn primary" onClick={load}>{t('common.retry')}</button>
      </div>
    );
  }
  if (!db) return <div className="splash"><div className="splash-pot">🍲</div><p>{t('common.loading')}</p></div>;

  const [section, arg, arg2] = route.parts;
  let tab = 'today';
  let screen;
  switch (section) {
    case 'pantry': tab = 'pantry'; screen = <Pantry />; break;
    case 'catalog': tab = 'catalog'; screen = <Catalog />; break;
    case 'saved': tab = 'saved'; screen = <Saved tab={arg === 'shopping' || arg === 'plan' ? arg : 'favorites'} />; break;
    case 'profile': tab = 'profile'; screen = <Profile />; break;
    case 'about': tab = 'profile'; screen = <About />; break;
    case 'privacy': tab = 'profile'; screen = <Privacy />; break;
    case 'recipe': tab = ''; screen = <RecipeView key={arg} id={arg ?? ''} />; break;
    case 'cook': tab = ''; screen = <Cook key={arg} id={arg ?? ''} start={Number(arg2) || 0} />; break;
    default: screen = <Today />;
  }
  const withNav = tab !== '';

  return (
    <DbContext.Provider value={db}>
      {!s.onboarded ? <Onboarding /> : (
        <div className={`app${withNav ? ' with-nav' : ''}`}>
          <div className="screen" key={section === 'saved' ? 'saved' : route.path}>{screen}</div>
          {section !== 'cook' && <TimerBar withNav={withNav} />}
          {withNav && <BottomNav active={tab} />}
        </div>
      )}
      <Toast />
    </DbContext.Provider>
  );
}
