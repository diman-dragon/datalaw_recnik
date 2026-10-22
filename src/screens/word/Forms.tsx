import { formTagLabel, t } from '../../i18n.ts';
import type { Entry } from '../../lib/types.ts';
import { showWord } from '../../lib/text.ts';
import { settings, useStore } from '../../store.ts';

export function Forms({ entry }: { entry: Entry }) {
  const s = useStore(settings);
  const forms = entry.f ?? [];
  if (forms.length === 0) return <p class="muted block">{t('formsNone')}</p>;
  return (
    <section class="block">
      <h3 class="block__title">{t('formsTitle')}</h3>
      <div class="forms">
        {forms.map(([form, tags], i) => (
          <div class="forms__row" key={`${form}:${i}`}>
            <span lang="sr">{showWord(form, s.script)}</span>
            <span class="forms__tag">{formTagLabel(tags)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
