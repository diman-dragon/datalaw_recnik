import { useEffect, useState } from 'preact/hooks';

export type Route =
  | { name: 'home' }
  | { name: 'word'; word: string }
  | { name: 'find'; query: string }
  | { name: 'saved' }
  | { name: 'history' }
  | { name: 'settings' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const [head, ...rest] = path.split('/');
  const arg = rest.length > 0 ? safeDecode(rest.join('/')) : '';
  switch (head) {
    case 'w':
      return arg ? { name: 'word', word: arg } : { name: 'home' };
    case 'find':
      return arg ? { name: 'find', query: arg } : { name: 'home' };
    case 'saved':
      return { name: 'saved' };
    case 'history':
      return { name: 'history' };
    case 'settings':
    case 'about':
      return { name: 'settings' };
    default:
      return { name: 'home' };
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'word':
      return `#/w/${encodeURIComponent(route.word)}`;
    case 'find':
      return `#/find/${encodeURIComponent(route.query)}`;
    case 'saved':
      return '#/saved';
    case 'history':
      return '#/history';
    case 'settings':
      return '#/settings';
  }
}

export function navigate(route: Route, replace = false): void {
  const href = hrefFor(route);
  if (replace) location.replace(href);
  else location.hash = href;
}

export const openWord = (word: string, replace = false): void => navigate({ name: 'word', word }, replace);

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/** Корневой экран вкладки — для нижней навигации. */
export function tabOf(route: Route): 'home' | 'saved' | 'history' | 'settings' | null {
  switch (route.name) {
    case 'home':
    case 'saved':
    case 'history':
    case 'settings':
      return route.name;
    default:
      return null;
  }
}
