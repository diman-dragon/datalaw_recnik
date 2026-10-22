import { t } from './i18n.ts';
import { LOCALE, SpeechError, speak } from './lib/speech.ts';
import { toCyrillic, toLatin } from './lib/text.ts';
import { showToast } from './store.ts';

/** Озвучивает текст; ошибки показывает понятным сообщением (а не «синтез не установлен» на любой сбой). */
export async function say(text: string, locale: string): Promise<void> {
  try {
    await speak(text, locale);
  } catch (e) {
    const kind = e instanceof SpeechError ? e.kind : 'failed';
    showToast(t(kind === 'lang' ? 'toastNoVoice' : kind === 'engine' ? 'toastNoEngine' : 'toastSpeechFailed'));
  }
}

/** Сербская озвучка: sr-RS, а если голоса нет — хорватский или боснийский. */
export async function saySerbian(text: string): Promise<void> {
  let last: unknown;
  const lat = toLatin(text);
  const cyr = toCyrillic(lat);
  // sr-RS лучше читает кириллицу, хорватский/боснийский — латиницу
  for (const [loc, spoken] of [[LOCALE.sr, cyr], ...LOCALE.srFallback.map((l) => [l, lat] as const)] as ReadonlyArray<readonly [string, string]>) {
    try {
      await speak(spoken, loc);
      return;
    } catch (e) {
      last = e;
      if (!(e instanceof SpeechError) || e.kind !== 'lang') break; // другие сбои не лечатся сменой языка
    }
  }
  const kind = last instanceof SpeechError ? last.kind : 'failed';
  showToast(t(kind === 'lang' ? 'toastNoVoice' : kind === 'engine' ? 'toastNoEngine' : 'toastSpeechFailed'));
}
