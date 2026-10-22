import { useState } from 'preact/hooks';
import { Header } from '../components/Header.tsx';
import { Icon } from '../components/Icon.tsx';
import { EmptyState } from '../components/ui.tsx';
import { t, wordsCount } from '../i18n.ts';
import { shareText, tap } from '../native.ts';
import { openWord } from '../router.ts';
import { foldSr, showWord } from '../lib/text.ts';
import { saved, settings, showToast, toggleSaved, useStore } from '../store.ts';

export function SavedScreen() {
  const list = useStore(saved);
  const sc = useStore(settings).script;
  const [filter, setFilter] = useState('');

  const f = filter.trim().toLowerCase();
  const ff = foldSr(f);
  const items = f
    ? list.filter((x) => (ff !== '' && foldSr(x.word).includes(ff)) || (x.gloss ?? '').toLowerCase().includes(f))
    : list;

  const share = async () => {
    const text = list.map((x) => (x.gloss ? `${showWord(x.word, sc)} — ${x.gloss}` : showWord(x.word, sc))).join('\n');
    try {
      if ((await shareText(t('savedTitle'), text)) === 'copied') showToast(t('toastCopied'));
    } catch {
      /* отмена */
    }
  };

  return (
    <>
      <Header
        title={t('savedTitle')}
        actions={
          list.length > 0 ? (
            <button type="button" class="iconbtn" onClick={() => void share()} aria-label={t('savedExport')}>
              <Icon name="share" />
            </button>
          ) : null
        }
      />
      {list.length === 0 ? (
        <EmptyState icon="star" text={t('savedEmpty')} />
      ) : (
        <>
          <p class="muted">{wordsCount(list.length)}</p>
          <input
            class="input"
            type="search"
            placeholder={t('savedFilter')}
            value={filter}
            onInput={(e) => setFilter(e.currentTarget.value)}
            aria-label={t('savedFilter')}
          />
          {items.length === 0 ? <p class="muted">{t('savedNoMatch')}</p> : null}
          <ul class="list">
            {items.map((x) => (
              <li key={x.word} class="row row--split">
                <button type="button" class="row__open" onClick={() => openWord(x.word)}>
                  <span class="row__main" lang="sr">
                    {showWord(x.word, sc)}
                  </span>
                  {x.gloss ? (
                    <span class="row__sub" lang="ru">
                      {x.gloss}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  class="iconbtn is-on"
                  aria-label={t('removeFromSaved')}
                  onClick={() => {
                    tap();
                    toggleSaved(x.word);
                  }}
                >
                  <Icon name="star" filled />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
