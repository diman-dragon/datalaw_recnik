import { Header } from '../components/Header.tsx';
import { Icon } from '../components/Icon.tsx';
import { EmptyState } from '../components/ui.tsx';
import { t } from '../i18n.ts';
import { showWord } from '../lib/text.ts';
import { openWord } from '../router.ts';
import { clearHistory, history, settings, useStore } from '../store.ts';
import type { HistoryItem } from '../store.ts';

const startOfDay = (ms: number): number => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

function groupByDay(items: HistoryItem[], locale: string): Array<{ label: string; items: HistoryItem[] }> {
  const today = startOfDay(Date.now());
  const groups = new Map<number, HistoryItem[]>();
  for (const it of items) {
    const day = startOfDay(it.at);
    const bucket = groups.get(day);
    if (bucket) bucket.push(it);
    else groups.set(day, [it]);
  }
  return [...groups.entries()].map(([day, list]) => {
    const diff = Math.round((today - day) / 86_400_000);
    const label =
      diff === 0
        ? t('dayToday')
        : diff === 1
          ? t('dayYesterday')
          : new Date(day).toLocaleDateString(locale, { day: 'numeric', month: 'long' });
    return { label, items: list };
  });
}

export function HistoryScreen() {
  const items = useStore(history);
  const s = useStore(settings);
  const groups = groupByDay(items, s.uiLang);

  return (
    <>
      <Header
        title={t('historyTitle')}
        actions={
          items.length > 0 ? (
            <button
              type="button"
              class="iconbtn"
              aria-label={t('historyClear')}
              onClick={() => {
                if (window.confirm(t('historyClearConfirm'))) clearHistory();
              }}
            >
              <Icon name="trash" />
            </button>
          ) : null
        }
      />
      {items.length === 0 ? (
        <EmptyState icon="history" text={t('historyEmpty')} />
      ) : (
        groups.map((g) => (
          <section class="section" key={g.label}>
            <h2 class="section__title">{g.label}</h2>
            <ul class="list">
              {g.items.map((it) => (
                <li key={it.word}>
                  <button type="button" class="row" onClick={() => openWord(it.word)}>
                    <span class="row__main" lang="sr">
                      {showWord(it.word, s.script)}
                    </span>
                    <Icon name="arrow-right" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
