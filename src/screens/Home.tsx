import { useEffect, useState } from 'preact/hooks';
import { Icon, LogoMark } from '../components/Icon.tsx';
import { Chip, ErrorBox, Skeleton } from '../components/ui.tsx';
import { useDebounced, useResource } from '../hooks.ts';
import { t } from '../i18n.ts';
import { getEntry, loadRuIndex, loadSrIndex } from '../lib/data.ts';
import { packInfo } from '../lib/pack.ts';
import { DataUnavailableError } from '../lib/source.ts';
import { WORDS_OF_THE_DAY, headwords, topRussian, wordOfTheDay } from '../lib/entry.ts';
import { indexOfWord, prefixSearch } from '../lib/search.ts';
import { cyrillicKind, detectScript, foldSr, normalizeRu, showWord } from '../lib/text.ts';
import { tap } from '../native.ts';
import { openSettingsPage } from './Settings.tsx';
import { navigate, openWord } from '../router.ts';
import { history, settings, updateSettings, useStore } from '../store.ts';

function WordOfTheDay() {
  const s = useStore(settings);
  const [offset, setOffset] = useState(0);
  const word = wordOfTheDay(offset);
  const res = useResource(`entry:${word}`, () => getEntry(word));
  const entry = res.data ?? null;
  if (res.status === 'ready' && !entry) {
    // слова нет в собранном словаре (например, образец данных) — не показываем пустую карточку
    return null;
  }
  const [main] = entry ? headwords(entry, s.script) : [showWord(word, s.script)];
  const ru = topRussian(entry, 3).join(' · ');

  return (
    <section class="card wotd">
      <div class="wotd__top">
        <span class="eyebrow">
          <Icon name="sparkle" size={14} /> {t('homeWotd')}
        </span>
        <button
          type="button"
          class="iconbtn iconbtn--sm"
          aria-label={t('homeRandom')}
          onClick={() => {
            tap();
            setOffset((o) => o + 1 + Math.floor(Math.random() * (WORDS_OF_THE_DAY.length - 1)));
          }}
        >
          <Icon name="shuffle" size={18} />
        </button>
      </div>
      <button type="button" class="wotd__main" onClick={() => openWord(word)}>
        <span class="wotd__word" lang="sr">
          {main}
        </span>
        {entry?.p ? <span class="ipa">{entry.p}</span> : null}
        {res.status === 'loading' ? <Skeleton lines={2} /> : null}
        {ru ? (
          <span class="wotd__ru" lang="ru">
            {ru}
          </span>
        ) : null}
      </button>
    </section>
  );
}

interface Suggestion {
  /** serbian — открыть слово; russian — обратный поиск */
  kind: 'serbian' | 'russian';
  key: string;
  /** сербское слово — латиницей (ключ статьи); русское — как в словаре */
  label: string;
}

export function HomeScreen() {
  const hist = useStore(history);
  const s = useStore(settings);
  const [text, setText] = useState('');
  const q = text.trim();
  const script = detectScript(q);
  const kind = script === 'cyrillic' ? cyrillicKind(q) : 'serbian';
  const srKey = script === 'other' ? '' : foldSr(q);
  const ruKey = script === 'cyrillic' && kind !== 'serbian' ? normalizeRu(q) : '';
  const debounced = useDebounced(`${srKey}|${ruKey}`, 60);

  const srIx = useResource('index:sr', loadSrIndex);
  const ruIx = useResource('index:ru', loadRuIndex);

  const wantSr = kind !== 'russian';
  const wantRu = ruKey !== '';
  const limit = wantSr && wantRu ? 4 : 8;
  const hits: Suggestion[] =
    debounced === `${srKey}|${ruKey}`
      ? [
          ...(wantSr && srKey && srIx.data
            ? prefixSearch(srIx.data, srKey, limit).map((h): Suggestion => ({ kind: 'serbian', key: h.key, label: h.label }))
            : []),
          ...(wantRu && ruIx.data
            ? prefixSearch(ruIx.data, ruKey, limit).map((h): Suggestion => ({ kind: 'russian', key: h.key, label: h.label }))
            : []),
        ]
      : [];

  const go = (hit: Suggestion) => {
    tap();
    if (hit.kind === 'russian') navigate({ name: 'find', query: hit.key });
    else openWord(hit.label);
  };

  const submit = (e: Event) => {
    e.preventDefault();
    if (!srKey && !ruKey) return;
    const srExact = wantSr && srKey && srIx.data ? indexOfWord(srIx.data, srKey) : -1;
    const ruExact = wantRu && ruIx.data ? indexOfWord(ruIx.data, ruKey) >= 0 : false;
    if (srExact >= 0) {
      const exact = hits.find((h) => h.kind === 'serbian' && h.key === srKey);
      go(exact ?? { kind: 'serbian', key: srKey, label: q });
    } else if (ruExact) go({ kind: 'russian', key: ruKey, label: ruKey });
    else if (hits[0]) go(hits[0]);
    else if (wantSr) go({ kind: 'serbian', key: srKey, label: q });
    else go({ kind: 'russian', key: ruKey, label: ruKey });
  };

  const failed = srIx.status === 'error' ? srIx : ruIx.status === 'error' ? ruIx : null;
  const retry = () => {
    if (srIx.status === 'error') srIx.reload();
    if (ruIx.status === 'error') ruIx.reload();
  };
  const hintOn = s.offlineHint;
  const [packed, setPacked] = useState(true);
  useEffect(() => {
    void packInfo().then((i) => setPacked(i.installed));
  }, []);

  return (
    <>
      <section class="hero">
        <div class="hero__bar">
          <div class="hero__brand">
            <LogoMark size={30} />
            <span>{t('appName')}</span>
          </div>
          <button type="button" class="iconbtn" onClick={() => navigate({ name: 'settings' })} aria-label={t('openSettings')}>
            <Icon name="settings" />
          </button>
        </div>
        <h1 class="hero__title">{t('homeHeadline')}</h1>
        <p class="hero__sub">{t('homeSub')}</p>

        <form class="search" onSubmit={submit} role="search">
          <Icon name="search" size={20} class="search__icon" />
          <input
            class="search__input"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autocomplete="off"
            autocapitalize="none"
            spellcheck={false}
            placeholder={t('searchPlaceholder')}
            value={text}
            onInput={(e) => setText(e.currentTarget.value)}
            aria-label={t('searchPlaceholder')}
          />
          {text ? (
            <button type="button" class="search__clear" onClick={() => setText('')} aria-label={t('searchClear')}>
              <Icon name="close" size={18} />
            </button>
          ) : null}
        </form>

        {hits.length > 0 ? (
          <ul class="suggest">
            {hits.map((h) => (
              <li key={`${h.kind}:${h.key}`}>
                <button type="button" class="suggest__item" onClick={() => go(h)}>
                  <Icon name={h.kind === 'russian' ? 'translate' : 'search'} size={18} />
                  <span lang={h.kind === 'russian' ? 'ru' : 'sr'}>{h.kind === 'russian' ? h.label : showWord(h.label, s.script)}</span>
                  {wantSr && wantRu ? <small class="src-tag">{h.kind === 'russian' ? t('tagRussian') : t('tagSerbian')}</small> : null}
                  <Icon name="arrow-ul" size={16} class="suggest__fill" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {failed ? (
        <ErrorBox
          offline={failed.error instanceof DataUnavailableError}
          onRetry={retry}
          onSettings={() => navigate({ name: 'settings' })}
        />
      ) : null}

      {q.length === 0 && !failed ? (
        <>
          {!packed && hintOn ? (
            <section class="card hint">
              <h2>{t('offlineHintTitle')}</h2>
              <p>{t('offlineHintBody')}</p>
              <div class="actions">
                <button type="button" class="btn btn--primary" onClick={() => {
                    openSettingsPage('data');
                    navigate({ name: 'settings' });
                  }}
                >
                  {t('offlineHintAction')}
                </button>
                <button type="button" class="btn btn--text" onClick={() => updateSettings({ offlineHint: false })}>
                  {t('offlineHintDismiss')}
                </button>
              </div>
            </section>
          ) : null}
          <WordOfTheDay />

          {hist.length > 0 ? (
            <section class="section">
              <h2 class="section__title">{t('homeRecent')}</h2>
              <div class="chips">
                {hist.slice(0, 10).map((h) => (
                  <Chip key={h.word} lang="sr" onClick={() => openWord(h.word)}>
                    {showWord(h.word, s.script)}
                  </Chip>
                ))}
              </div>
            </section>
          ) : null}

          <section class="card tip">
            <h2>{t('homeTipTitle')}</h2>
            <p>{t('homeTipBody')}</p>
          </section>
          <p class="src src--center">{t('attribution')}</p>
        </>
      ) : null}
    </>
  );
}
