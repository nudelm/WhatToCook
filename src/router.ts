// Простая навигация по адресу после «#»: #/catalog, #/recipe/borsch. Работает на любом хостинге без настройки.
import { useEffect, useLayoutEffect, useState } from 'react';

export interface Route { path: string; parts: string[] }

const read = (): Route => {
  const path = window.location.hash.replace(/^#/, '') || '/';
  return { path, parts: path.split('/').filter(Boolean) };
};

// Запоминаем прокрутку каждого экрана, чтобы при возврате «назад» список не прыгал в начало.
const scrollByPath = new Map<string, number>();
const stack: string[] = [read().path];
let restore: number | null = null;

export function useRoute(): Route {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => {
      const next = read();
      const prev = stack[stack.length - 1];
      scrollByPath.set(prev, window.scrollY);
      if (stack.length > 1 && stack[stack.length - 2] === next.path) {
        stack.pop(); // вернулись назад
        restore = scrollByPath.get(next.path) ?? 0;
      } else {
        stack.push(next.path);
        restore = 0;
      }
      setRoute(next);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  useLayoutEffect(() => {
    if (restore != null) { window.scrollTo(0, restore); restore = null; }
  }, [route.path]);
  return route;
}

export const go = (path: string): void => { window.location.hash = path; };
export const replace = (path: string): void => { window.location.replace(`#${path}`); };
export const back = (fallback = '/'): void => { if (stack.length > 1) window.history.back(); else go(fallback); };
