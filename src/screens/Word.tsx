import { useEffect, useState } from 'preact/hooks';
import { Header } from '../components/Header.tsx';
import { Icon } from '../components/Icon.tsx';
import { Chip, ErrorBox, Segmented, Skeleton } from '../components/ui.tsx';
import { useResource } from '../hooks.ts';
import type { StringKey } from '../i18n.ts';
import { markLabel, t } from '../i18n.ts';
import { findEntry, loadSrIndex } from '../lib/data.ts';
import { BAND_LEVEL, frequencyBand, headwords, topRussian } from '../lib/entry.ts';
import type { FrequencyBand } from '../lib/entry.ts';
import { suggestSimilar } from '../lib/search.ts';
import { stopSpeaking } from '../lib/speech.ts';
import { DataUnavailableError } from '../lib/source.ts';
import { foldSr, showWord } from '../lib/text.ts';
import { shareText, tap } from '../native.ts';
import { navigate, openWord } from '../router.ts';
import { saySerbian } from '../speakUi.ts';
import { isSaved, pushHistory, saved, settings, showToast, toggleSaved, useStore } from '../store.ts';
import { Examples } from './word/Examples.tsx';
import { Forms } from './word/Forms.tsx';
import { Meanings } from './word/Meanings.tsx';

const FREQ_KEY: Record<FrequencyBand, StringKey> = {
  veryCommon: 'freqVeryCommon',
  common: 'freqCommon',
  uncommon: 'freqUncommon',
  rare: 'freqRare',
};

type Tab = 'mean' | 'forms' | 'ex';

function NotFound({ word }: { word: string }) {
  const s = useStore(settings);
  const ix = useResource('index:sr', loadSrIndex);
  const options = ix.data ? suggestSimilar(ix.data, foldSr(word), 8) : [];
  return (
    <div class="empty">
      <div class="empty__icon">
        <Icon name="search" size={30} />
      </div>
      <h2>{t('wordNotFound')}</h2>
      {options.length > 0 ? (
        <>
          <p>{t('wordNotFoundHint')}</p>
          <div class="chips chips--center">
            {options.map((h) => (
              <Chip key={h.key} tone="teal" lang="sr" onClick={() => openWord(h.label, true)}>
                {showWord(h.label, s.script)}
              </Chip>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function WordScreen({ word }: { word: string }) {
  const s = useStore(settings);
  const savedList = useStore(saved);
  const [tab, setTab] = useState<Tab>('mean');
  const [playing, setPlaying] = useState(false);

  const res = useResource(`entry:${word}`, () => findEntry(word));
  const entry = res.data ?? null;
  const isForm = !!entry?.r;
  const key = entry?.w ?? '';

  useEffect(() => {
    if (res.status === 'ready' && entry) pushHistory(entry.w);
  }, [res.status, entry]);

  useEffect(() => () => stopSpeaking(), [word]);

  const [main, alt] = entry ? headwords(entry, s.script) : [showWord(word, s.script), ''];
  const isFav = isSaved(savedList, key);
  const band = frequencyBand(entry?.z);
  const glossLine = topRussian(entry, 4).join(' · ');

  const onPronounce = async () => {
    tap();
    setPlaying(true);
    try {
      await saySerbian(main);
    } finally {
      setPlaying(false);
    }
  };

  const onToggleSaved = () => {
    if (!entry) return;
    tap('medium');
    const nowSaved = toggleSaved(entry.w, glossLine || undefined);
    showToast(nowSaved ? t('toastSaved') : t('toastRemoved'));
  };

  const onShare = async () => {
    if (!entry) return;
    const lines = [`${entry.w} / ${headwords(entry, 'cyr')[0]}${entry.p ? `  ${entry.p}` : ''}`];
    if (glossLine) lines.push(glossLine);
    try {
      if ((await shareText(entry.w, lines.join('\n'))) === 'copied') showToast(t('toastCopied'));
    } catch {
      /* пользователь закрыл меню */
    }
  };

  const tabs: ReadonlyArray<{ value: Tab; label: string }> = [
    { value: 'mean', label: t('tabMeanings') },
    { value: 'forms', label: t('tabForms') },
    { value: 'ex', label: t('tabExamples') },
  ];

  return (
    <>
      <Header
        back
        actions={
          entry ? (
            <>
              <button type="button" class="iconbtn" onClick={() => void onShare()} aria-label={t('share')}>
                <Icon name="share" />
              </button>
              <button
                type="button"
                class={isFav ? 'iconbtn is-on' : 'iconbtn'}
                onClick={onToggleSaved}
                aria-label={isFav ? t('removeFromSaved') : t('addToSaved')}
                aria-pressed={isFav}
              >
                <Icon name="star" filled={isFav} />
              </button>
            </>
          ) : null
        }
      />

      <section class="word-head">
        <h2 class="word-title" lang="sr">
          {main}
        </h2>
        {alt && alt !== main ? (
          <p class="word-alt" lang="sr">
            {alt}
          </p>
        ) : null}
        <div class="ipa-row">
          <button
            type="button"
            class={playing ? 'speak is-playing' : 'speak'}
            onClick={() => void onPronounce()}
            aria-label={t('pronounce')}
          >
            <Icon name="volume" size={22} />
          </button>
          {entry?.p ? <span class="ipa">{entry.p}</span> : null}
          {entry?.gd ? (
            <span class="word-marks">
              {entry.gd.split(' ').map((g) => (
                <span class="mark" key={g}>
                  {markLabel(g)}
                </span>
              ))}
            </span>
          ) : null}
        </div>
        {glossLine ? (
          <p class="word-gloss" lang="ru">
            {glossLine}
          </p>
        ) : null}
        {band ? (
          <div class="meta-row">
            <span class="freq">
              <span class="freq__dots" aria-hidden="true">
                {[1, 2, 3, 4].map((i) => (
                  <i key={i} class={i <= BAND_LEVEL[band] ? 'on' : ''} />
                ))}
              </span>
              {t(FREQ_KEY[band])}
            </span>
          </div>
        ) : null}
      </section>

      {res.status === 'loading' ? <Skeleton lines={6} /> : null}

      {res.status === 'error' ? (
        <ErrorBox
          offline={res.error instanceof DataUnavailableError}
          onRetry={res.reload}
          onSettings={() => navigate({ name: 'settings' })}
        />
      ) : null}

      {res.status === 'ready' && !entry ? <NotFound word={word} /> : null}

      {isForm && entry ? (
        <div class="notice notice--form">
          <div class="notice__body">
            <strong>{t('formOf')}</strong>
            {entry.rg ? <span lang="en"> — {entry.rg}</span> : null}
          </div>
          {(entry.r ?? []).map((lemma) => (
            <Chip key={lemma} tone="teal" lang="sr" onClick={() => openWord(lemma, true)}>
              {t('openLemma')} {showWord(lemma, s.script)}
            </Chip>
          ))}
        </div>
      ) : null}

      {entry && !isForm ? (
        <>
          <Segmented<Tab> variant="tabs" value={tab} onChange={setTab} options={tabs} />
          <div class="tabpanel" role="tabpanel">
            {tab === 'mean' ? <Meanings entry={entry} /> : null}
            {tab === 'forms' ? <Forms entry={entry} /> : null}
            {tab === 'ex' ? <Examples foldKey={foldSr(entry.w)} /> : null}
          </div>
        </>
      ) : null}
    </>
  );
}
