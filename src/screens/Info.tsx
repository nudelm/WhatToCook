// Онбординг, «О приложении» и политика конфиденциальности.
import { useEffect, useState } from 'react';
import { ALLERGENS, FILTER_DIETS } from '../constants';
import { loadCredits, useDb } from '../data';
import { L, t, tn } from '../i18n';
import { back } from '../router';
import { setPrefs, toggle, update, useStore } from '../store';
import type { PhotoCredit } from '../types';
import { Chip, TopBar } from '../ui';

export function Onboarding() {
  const s = useStore();
  const [i, setI] = useState(0);
  const finish = () => update({ onboarded: true });
  const last = i === 2;
  return (
    <div className="onboarding">
      <div className="ob-top"><button className="link" onClick={finish}>{t('onboarding.skip')}</button></div>
      <div className="ob-slide" key={i}>
        <div className="ob-emoji">{['🍲', '🥗', '🧺'][i]}</div>
        <h1>{t(`onboarding.s${i + 1}.title`)}</h1>
        <p>{t(`onboarding.s${i + 1}.text`)}</p>
        {i === 1 && (
          <div className="ob-prefs">
            <div className="chips center">
              {FILTER_DIETS.map((d) => <Chip key={d} on={s.prefs.diets.includes(d)} onClick={() => setPrefs({ diets: toggle(s.prefs.diets, d) })}>{t(`diets.${d}`)}</Chip>)}
            </div>
            <p className="hint center">{t('onboarding.allergens')}</p>
            <div className="chips center">
              {ALLERGENS.slice(0, 8).map((a) => <Chip key={a} on={s.prefs.allergens.includes(a)} onClick={() => setPrefs({ allergens: toggle(s.prefs.allergens, a) })}>{t(`allergens.${a}`)}</Chip>)}
            </div>
          </div>
        )}
      </div>
      <div className="ob-bottom">
        <div className="dots" aria-hidden="true">{[0, 1, 2].map((d) => <i key={d} className={d === i ? 'on' : ''} />)}</div>
        <button className="btn primary big block-btn" onClick={() => (last ? finish() : setI(i + 1))}>{t(last ? 'onboarding.start' : 'onboarding.next')}</button>
      </div>
    </div>
  );
}

export function About() {
  const { recipes, products, byId } = useDb();
  const [credits, setCredits] = useState<PhotoCredit[] | null>(null);
  useEffect(() => { void loadCredits().then(setCredits); }, []);
  return (
    <div className="page text-page">
      <TopBar title={t('about.title')} onBack={() => back('/profile')} />
      <p className="lead">{t('about.intro')}</p>
      <p>{tn('about.stats', recipes.length, { products: products.length })}</p>
      <h2>{t('about.kcalTitle')}</h2>
      <p>{t('about.kcalText')}</p>
      <p className="disclaimer">{t('profile.disclaimer')}</p>
      <h2>{t('about.offlineTitle')}</h2>
      <p>{t('about.offlineText')}</p>
      <h2>{t('about.photosTitle')}</h2>
      <p>{t('about.photosText')}</p>
      {credits === null && <p className="muted">{t('common.loading')}</p>}
      {credits && credits.length === 0 && <p className="muted">{t('about.noPhotos')}</p>}
      {credits && credits.length > 0 && (
        <ul className="credits">
          {credits.map((c) => (
            <li key={c.id}>
              <a href={`#/recipe/${c.id}`}>{L(byId.get(c.id)?.name)}</a>
              <span> — <a href={c.source} target="_blank" rel="noopener noreferrer">{c.author}</a>, {c.licenseUrl ? <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer">{c.license}</a> : c.license}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">{t('about.version', { v: __APP_VERSION__ })}</p>
    </div>
  );
}

export function Privacy() {
  return (
    <div className="page text-page">
      <TopBar title={t('privacy.title')} onBack={() => back('/profile')} />
      {['p1', 'p2', 'p3', 'p4', 'p5'].map((k) => <p key={k}>{t(`privacy.${k}`)}</p>)}
    </div>
  );
}
