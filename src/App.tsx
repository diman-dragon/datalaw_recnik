import { useEffect, useRef } from 'preact/hooks';
import { Icon } from './components/Icon.tsx';
import type { IconName } from './components/Icon.tsx';
import { t } from './i18n.ts';
import { syncStatusBar, tap } from './native.ts';
import { navigate, tabOf, useRoute } from './router.ts';
import { FindScreen } from './screens/Find.tsx';
import { HistoryScreen } from './screens/History.tsx';
import { HomeScreen } from './screens/Home.tsx';
import { SavedScreen } from './screens/Saved.tsx';
import { SettingsScreen } from './screens/Settings.tsx';
import { WordScreen } from './screens/Word.tsx';
import { settings, toast, useStore } from './store.ts';
import type { Route } from './router.ts';

const TABS: ReadonlyArray<{ name: 'home' | 'saved' | 'history' | 'settings'; icon: IconName; label: Parameters<typeof t>[0] }> = [
  { name: 'home', icon: 'search', label: 'navSearch' },
  { name: 'saved', icon: 'star', label: 'navSaved' },
  { name: 'history', icon: 'history', label: 'navHistory' },
  { name: 'settings', icon: 'settings', label: 'navSettings' },
];

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <HomeScreen />;
    case 'word':
      return <WordScreen key={route.word} word={route.word} />;
    case 'find':
      return <FindScreen key={route.query} query={route.query} />;
    case 'saved':
      return <SavedScreen />;
    case 'history':
      return <HistoryScreen />;
    case 'settings':
      return <SettingsScreen />;
  }
}

/** Применяет тему и язык документа, синхронизирует цвет иконок статус-бара. */
function useAppearance() {
  const s = useStore(settings);
  useEffect(() => {
    const root = document.documentElement;
    // light — светло-коричневая, dark — AMOLED; auto — по системе
    const forced = s.theme === 'light' ? 'light' : s.theme === 'amoled' ? 'dark' : '';
    if (forced) root.dataset['theme'] = forced;
    else delete root.dataset['theme'];
    try {
      localStorage.setItem('datalaw_recnik-theme', forced);
    } catch {
      /* хранилище недоступно */
    }
    root.lang = s.uiLang;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => syncStatusBar(forced === 'dark' || (forced === '' && mq.matches));
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [s.theme, s.uiLang]);
}

/** Свайп влево/вправо по основным экранам переключает вкладки нижней навигации. */
function useTabSwipe(order: ReadonlyArray<string>, active: string | null) {
  const start = useRef<{ x: number; y: number; ok: boolean } | null>(null);
  return {
    onTouchStart(e: TouchEvent) {
      const t0 = e.touches[0];
      if (!t0 || active === null || active === 'settings') return void (start.current = null);
      // жесты внутри горизонтально прокручиваемых полос не перехватываем
      const target = e.target as Element | null;
      const ok = !target?.closest('.chips, .set-tabs, .seg, input, textarea');
      start.current = { x: t0.clientX, y: t0.clientY, ok };
    },
    onTouchEnd(e: TouchEvent) {
      const s = start.current;
      start.current = null;
      const t1 = e.changedTouches[0];
      if (!s || !s.ok || !t1 || active === null) return;
      const dx = t1.clientX - s.x;
      const dy = t1.clientY - s.y;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      const i = order.indexOf(active) + (dx < 0 ? 1 : -1);
      const next = order[i];
      if (next) {
        tap();
        navigate({ name: next as 'home' | 'saved' | 'history' | 'settings' }, true);
      }
    },
  };
}

export function App() {
  const route = useRoute();
  const current = useStore(toast);
  useStore(settings); // перерисовка при смене языка интерфейса
  useAppearance();

  const scroller = useRef<HTMLElement>(null);
  const routeKey = JSON.stringify(route);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [routeKey]);

  const activeTab = tabOf(route);
  const swipe = useTabSwipe(TABS.map((x) => x.name), activeTab);

  return (
    <div class="app">
      <main class={route.name === 'settings' ? 'screen screen--fill' : 'screen'} ref={scroller} onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd}>
        <div class={route.name === 'settings' ? 'screen__inner screen__inner--fill' : 'screen__inner'}>
          <Screen route={route} />
        </div>
      </main>

      {current ? (
        <div class="toast" key={current.id} role="status">
          {current.text}
        </div>
      ) : null}

      <nav class="tabbar" aria-label="Main">
        {TABS.map((tab) => (
          <button
            key={tab.name}
            type="button"
            class={activeTab === tab.name ? 'tabbar__item is-active' : 'tabbar__item'}
            aria-current={activeTab === tab.name ? 'page' : undefined}
            onClick={() => {
              tap();
              navigate({ name: tab.name }, true);
            }}
          >
            <span class="tabbar__icon">
              <Icon name={tab.icon} size={22} filled={activeTab === tab.name && tab.name === 'saved'} />
            </span>
            <span class="tabbar__label">{t(tab.label)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
