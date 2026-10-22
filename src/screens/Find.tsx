import { Header } from '../components/Header.tsx';
import { Icon } from '../components/Icon.tsx';
import { EmptyState, ErrorBox, Skeleton } from '../components/ui.tsx';
import { useResource } from '../hooks.ts';
import { t } from '../i18n.ts';
import { getEntry, getReverse } from '../lib/data.ts';
import { headwords, topRussian } from '../lib/entry.ts';
import { normalizeRu, showWord } from '../lib/text.ts';
import { DataUnavailableError } from '../lib/source.ts';
import { navigate, openWord } from '../router.ts';
import { settings, useStore } from '../store.ts';

function Row({ word }: { word: string }) {
  const s = useStore(settings);
  const res = useResource(`entry:${word}`, () => getEntry(word));
  const entry = res.data ?? null;
  const sub = entry && !entry.r ? topRussian(entry, 3).join(' · ') : '';
  return (
    <li>
      <button type="button" class="row" onClick={() => openWord(word)}>
        <span class="row__open-inner">
          <span class="row__main" lang="sr">
            {entry ? headwords(entry, s.script)[0] : showWord(word, s.script)}
          </span>
          {sub ? (
            <span class="row__sub" lang="ru">
              {sub}
            </span>
          ) : null}
        </span>
        <Icon name="arrow-right" size={18} />
      </button>
    </li>
  );
}

/** Обратный поиск: русское слово → английские эквиваленты (из переводов Викисловаря). */
export function FindScreen({ query }: { query: string }) {
  const key = normalizeRu(query);
  const res = useResource(`rev:${key}`, () => getReverse(key));
  const words = res.data ?? [];

  return (
    <>
      <Header back title={t('findTitle', { q: query })} />
      {res.status === 'loading' ? <Skeleton lines={4} /> : null}
      {res.status === 'error' ? (
        <ErrorBox
          offline={res.error instanceof DataUnavailableError}
          onRetry={res.reload}
          onSettings={() => navigate({ name: 'settings' })}
        />
      ) : null}
      {res.status === 'ready' && words.length === 0 ? <EmptyState icon="search" text={t('findEmpty')} /> : null}
      {words.length > 0 ? (
        <>
          <p class="muted">{t('findHint')}</p>
          <ul class="list">
            {words.slice(0, 40).map((w) => (
              <Row key={w} word={w} />
            ))}
          </ul>
          <p class="src">{t('mnSource')}</p>
        </>
      ) : null}
    </>
  );
}
