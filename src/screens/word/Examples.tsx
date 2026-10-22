import { Icon } from '../../components/Icon.tsx';
import { Highlight, Skeleton } from '../../components/ui.tsx';
import { useResource } from '../../hooks.ts';
import { t } from '../../i18n.ts';
import { getSentences } from '../../lib/data.ts';
import { showText } from '../../lib/text.ts';
import { say, saySerbian } from '../../speakUi.ts';
import { LOCALE } from '../../lib/speech.ts';
import { settings, useStore } from '../../store.ts';

/** foldKey — ключ слова без диакритики (foldSr). */
export function Examples({ foldKey }: { foldKey: string }) {
  const s = useStore(settings);
  const sentences = useResource(`sent:${foldKey}`, () => getSentences(foldKey));
  const pairs = sentences.data ?? [];

  return (
    <div>
      {sentences.status === 'loading' ? <Skeleton lines={3} /> : null}

      {pairs.length > 0 ? (
        <section class="block">
          <h3 class="block__title">{t('exSentences')}</h3>
          <ul class="sentences">
            {pairs.map(([sr, ru]) => (
              <li class="sentence" key={sr}>
                <div class="sentence__main">
                  <p lang="sr">
                    <Highlight text={showText(sr, s.script)} foldKey={foldKey} />
                  </p>
                  <p class="sentence__tr" lang="ru">
                    {ru}
                  </p>
                </div>
                <button type="button" class="btn ghost sm-btn" onClick={() => void saySerbian(sr)} aria-label={t('pronounce')}>
                  <Icon name="volume" size={16} />
                  {t('tagSerbian')}
                </button>
                <button type="button" class="btn ghost sm-btn" onClick={() => void say(ru, LOCALE.ru)} aria-label={t('pronounce')}>
                  <Icon name="volume" size={16} />
                  {t('tagRussian')}
                </button>
              </li>
            ))}
          </ul>
          <p class="src">{t('exSource')}</p>
        </section>
      ) : null}

      {sentences.status === 'ready' && pairs.length === 0 ? <p class="muted block">{t('exNone')}</p> : null}
    </div>
  );
}
