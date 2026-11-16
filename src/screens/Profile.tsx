import { ALLERGENS, FILTER_DIETS } from '../constants';
import { useDb } from '../data';
import { L, LANGS, setLang, t, tn } from '../i18n';
import { promptInstall, toast, useCanInstall } from '../pwa';
import { isStaple } from '../engine/pantry';
import { resetAll, setPrefs, toggle, toggleAlways, unhideRecipe, update, useStore, type State } from '../store';
import type { Product, Recipe } from '../types';
import { Chip, Icon, ProductSearch, Segmented, productName, useAlways } from '../ui';

export function Profile() {
  const { byId, products, productMap } = useDb();
  const always = useAlways();
  // «Есть всегда»: список по умолчанию из справочника (его можно выключать) плюс то, что добавил пользователь.
  const s = useStore();
  const alwaysList = [...products.filter(isStaple), ...s.always.on.map((id) => productMap.get(id)).filter((p): p is Product => !!p && !isStaple(p))];
  const canInstall = useCanInstall();
  const excluded = s.prefs.excluded.map((id) => productMap.get(id)).filter((p): p is Product => !!p);
  const hidden = s.hidden.map((id) => byId.get(id)).filter((r): r is Recipe => !!r);

  return (
    <div className="page">
      <header className="hello">
        <h1>{t('profile.title')}</h1>
        <p className="lead">{t('profile.lead')}</p>
      </header>

      <section className="block">
        <h2>{t('profile.diets')}</h2>
        <div className="chips">
          {FILTER_DIETS.map((d) => <Chip key={d} on={s.prefs.diets.includes(d)} onClick={() => setPrefs({ diets: toggle(s.prefs.diets, d) })}>{t(`diets.${d}`)}</Chip>)}
        </div>
      </section>

      <section className="block">
        <h2>{t('profile.allergens')}</h2>
        <p className="hint">{t('profile.allergensHint')}</p>
        <div className="chips">
          {ALLERGENS.map((a) => <Chip key={a} on={s.prefs.allergens.includes(a)} onClick={() => setPrefs({ allergens: toggle(s.prefs.allergens, a) })}>{t(`allergens.${a}`)}</Chip>)}
        </div>
      </section>

      <section className="block">
        <h2>{t('profile.excluded')}</h2>
        <p className="hint">{t('profile.excludedHint')}</p>
        <ProductSearch onPick={(p) => setPrefs({ excluded: [...s.prefs.excluded, p.id] })} exclude={s.prefs.excluded} placeholder={t('profile.excludedPlaceholder')} />
        {excluded.length > 0 && (
          <div className="chips">
            {excluded.map((p) => (
              <button key={p.id} className="chip on removable" onClick={() => setPrefs({ excluded: s.prefs.excluded.filter((x) => x !== p.id) })} aria-label={t('pantry.remove', { name: productName(p) })}>{productName(p)}<Icon name="x" size={14} /></button>
            ))}
          </div>
        )}
      </section>

      <section className="block">
        <h2>{t('profile.always')}</h2>
        <p className="hint">{t('profile.alwaysHint')}</p>
        <div className="chips">
          {alwaysList.map((p) => <Chip key={p.id} on={always.has(p.id)} onClick={() => toggleAlways(p.id, isStaple(p))}>{productName(p)}</Chip>)}
        </div>
        <ProductSearch onPick={(p) => { if (!always.has(p.id)) toggleAlways(p.id, isStaple(p)); }} exclude={[...always]} placeholder={t('profile.alwaysPlaceholder')} />
      </section>

      <section className="block">
        <h2>{t('profile.kcalGoal')}</h2>
        <p className="hint">{t('profile.kcalGoalHint')}</p>
        <label className="input narrow">
          <input
            type="number" inputMode="numeric" min={0} max={9000} step={50} placeholder="2000"
            value={s.kcalGoal || ''}
            onChange={(e) => update({ kcalGoal: Math.max(0, Math.min(9000, Math.round(Number(e.target.value) || 0))) })}
          />
          <span className="muted">{t('profile.kcalPerDay')}</span>
        </label>
        <p className="disclaimer">{t('profile.disclaimer')}</p>
      </section>

      <section className="block">
        <h2>{t('profile.theme')}</h2>
        <Segmented<State['theme']>
          value={s.theme}
          onChange={(v) => update({ theme: v })}
          options={[{ id: 'auto', label: t('profile.themeAuto') }, { id: 'light', label: t('profile.themeLight') }, { id: 'dark', label: t('profile.themeDark') }]}
        />
      </section>

      <section className="block">
        <h2>{t('profile.language')}</h2>
        <label className="input narrow">
          <select value={s.lang} onChange={(e) => { setLang(e.target.value); update({ lang: e.target.value }); }}>
            {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </label>
      </section>

      {hidden.length > 0 && (
        <section className="block">
          <h2>{t('profile.hidden')}</h2>
          <p className="hint">{tn('profile.hiddenCount', hidden.length)}</p>
          <ul className="plain-list">
            {hidden.map((r) => (
              <li key={r.id}>
                <span className="grow">{r.emoji} {L(r.name)}</span>
                <button className="link" onClick={() => unhideRecipe(r.id)}>{t('profile.restore')}</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="block">
        <h2>{t('profile.app')}</h2>
        <ul className="menu">
          {canInstall && <li><button onClick={() => void promptInstall()}><Icon name="download" />{t('install.button')}<Icon name="chevron" size={18} /></button></li>}
          <li><a href="#/about"><Icon name="info" />{t('about.title')}<Icon name="chevron" size={18} /></a></li>
          <li><a href="#/privacy"><Icon name="shield" />{t('privacy.title')}<Icon name="chevron" size={18} /></a></li>
          <li><button onClick={() => update({ onboarded: false })}><Icon name="today" />{t('profile.showOnboarding')}<Icon name="chevron" size={18} /></button></li>
          <li><button className="danger" onClick={() => { if (window.confirm(t('profile.resetConfirm'))) { resetAll(); toast(t('profile.resetDone')); } }}><Icon name="trash" />{t('profile.reset')}</button></li>
        </ul>
      </section>
    </div>
  );
}
