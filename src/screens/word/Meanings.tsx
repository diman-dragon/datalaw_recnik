import { Icon } from '../../components/Icon.tsx';
import { Chip } from '../../components/ui.tsx';
import { markLabel, posLabel, t } from '../../i18n.ts';
import { LOCALE } from '../../lib/speech.ts';
import type { Entry, Meaning } from '../../lib/types.ts';
import { tap } from '../../native.ts';
import { navigate } from '../../router.ts';
import { say } from '../../speakUi.ts';

/** Значения по частям речи; точные — выше приблизительных. */
function grouped(meanings: Meaning[]): Array<{ pos: string; items: Meaning[] }> {
  const order: string[] = [];
  const by = new Map<string, Meaning[]>();
  for (const m of meanings) {
    const list = by.get(m.t);
    if (list) list.push(m);
    else {
      order.push(m.t);
      by.set(m.t, [m]);
    }
  }
  return order.map((pos) => {
    const items = by.get(pos) ?? [];
    return { pos, items: [...items.filter((m) => !m.a), ...items.filter((m) => m.a)] };
  });
}

export function Meanings({ entry }: { entry: Entry }) {
  const meanings = entry.m ?? [];
  const defs = entry.d ?? [];

  return (
    <div>
      {meanings.length === 0 ? (
        <p class="muted block">{t('mnNone')}</p>
      ) : (
        <section class="block">
          {grouped(meanings).map((g) =>
            g.items.map((m, i) => (
              <div class="tr-group" key={`${g.pos}:${m.e}:${m.s ?? ''}:${i}`}>
                <div class="tr-gloss">
                  {i === 0 ? <span class="tr-pos">{posLabel(g.pos)}</span> : null}
                  {m.s ? <span lang="en">{m.s}</span> : <span class="mn-bridge" lang="en">{t('mnVia', { e: m.e })}</span>}
                  {m.a ? (
                    <span class="mn-approx" title={t('mnApproxNote')}>
                      ≈ {t('mnApprox')}
                    </span>
                  ) : null}
                </div>
                <div class="chips">
                  {m.ru.map((term) => (
                    <Chip
                      key={term.w}
                      tone={m.a ? 'neutral' : 'teal'}
                      lang="ru"
                      sub={term.x ? markLabel(term.x) : undefined}
                      onClick={() => navigate({ name: 'find', query: term.w })}
                    >
                      {term.w}
                    </Chip>
                  ))}
                  <button
                    type="button"
                    class="iconbtn iconbtn--sm"
                    aria-label={t('pronounce')}
                    onClick={() => {
                      tap();
                      void say(m.ru[0]?.w ?? '', LOCALE.ru);
                    }}
                  >
                    <Icon name="volume" size={18} />
                  </button>
                </div>
              </div>
            )),
          )}
          <p class="src">
            {t('mnTapHear')} · {t('mnSource')}
          </p>
        </section>
      )}

      {defs.length > 0 ? (
        <section class="block">
          <h3 class="block__title">{t('mnDefs')}</h3>
          <ul class="sentences">
            {defs.map((d, i) => (
              <li class="sentence" key={`${d.t}:${i}`}>
                <div class="sentence__main">
                  <p lang="en">
                    <span class="tr-pos">{posLabel(d.t)}</span> {d.g.join('; ')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
