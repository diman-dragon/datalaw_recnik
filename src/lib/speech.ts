/**
 * Озвучка системным синтезатором речи Android (офлайн, если голоса установлены).
 * Два пути:
 *   1) нативный плагин RecnikSpeech (android.speech.tts.TextToSpeech) — основной в приложении;
 *   2) Web Speech API (speechSynthesis) — для браузера и как запасной вариант.
 * Модуль не зависит от Capacitor: нативная реализация подключается через setNativeSpeech().
 */

export const LOCALE = {
  sr: 'sr-RS',
  /** Запасные: на многих устройствах нет сербского голоса, а хорватский/боснийский звучат почти так же. */
  srFallback: ['hr-HR', 'bs-BA'],
  ru: 'ru-RU',
} as const;

/** lang — нет голоса/данных для этого языка; engine — в системе вообще нет синтезатора; failed — сбой воспроизведения. */
export type SpeechErrorKind = 'lang' | 'engine' | 'failed';

export class SpeechError extends Error {
  readonly kind: SpeechErrorKind;
  constructor(kind: SpeechErrorKind, message?: string) {
    super(message ?? kind);
    this.name = 'SpeechError';
    this.kind = kind;
  }
}

export interface NativeSpeech {
  speak(options: { text: string; lang: string; rate: number }): Promise<void>;
  stop(): Promise<void>;
}

let native: NativeSpeech | null = null;
export const setNativeSpeech = (impl: NativeSpeech | null): void => {
  native = impl;
};

const synth = (): SpeechSynthesis | undefined => (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;

export const hasSpeech = (): boolean => native !== null || synth() !== undefined;

export function stopSpeaking(): void {
  void native?.stop().catch(() => undefined);
  synth()?.cancel();
}

const norm = (lang: string) => lang.toLowerCase().replace('_', '-');

function pickVoice(voices: SpeechSynthesisVoice[], locale: string): SpeechSynthesisVoice | undefined {
  const want = norm(locale);
  return (
    voices.find((v) => norm(v.lang) === want && v.localService) ??
    voices.find((v) => norm(v.lang) === want) ??
    voices.find((v) => norm(v.lang).startsWith(want.slice(0, 2)))
  );
}

/** Голоса в WebView подгружаются асинхронно: первый getVoices() часто пуст — ждём voiceschanged. */
function loadVoices(s: SpeechSynthesis, timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  const now = s.getVoices();
  if (now.length > 0) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      s.removeEventListener?.('voiceschanged', done);
      clearTimeout(timer);
      resolve(s.getVoices());
    };
    const timer = setTimeout(done, timeoutMs);
    s.addEventListener?.('voiceschanged', done);
  });
}

async function speakWeb(text: string, locale: string, rate: number): Promise<void> {
  const s = synth();
  const Utterance = (globalThis as { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance }).SpeechSynthesisUtterance;
  if (!s || !Utterance) throw new SpeechError('engine');
  const voices = await loadVoices(s);
  // Список голосов может остаться пустым даже при рабочем синтезаторе — тогда просто говорим по lang
  const voice = pickVoice(voices, locale);
  if (voices.length > 0 && !voice) throw new SpeechError('lang');
  s.cancel();
  return new Promise<void>((resolve, reject) => {
    const u = new Utterance(text);
    u.lang = locale;
    u.rate = rate;
    if (voice) u.voice = voice;
    u.onend = () => resolve();
    u.onerror = (e) => {
      const err = (e as { error?: string }).error;
      // отмена новым запросом — не ошибка
      if (err === 'canceled' || err === 'interrupted') resolve();
      else if (err === 'language-unavailable' || err === 'voice-unavailable') reject(new SpeechError('lang'));
      else reject(new SpeechError('failed', err));
    };
    s.speak(u);
  });
}

function asSpeechError(e: unknown): SpeechError {
  if (e instanceof SpeechError) return e;
  const code = (e as { code?: string } | null)?.code;
  if (code === 'LANG_UNAVAILABLE') return new SpeechError('lang');
  if (code === 'NO_ENGINE') return new SpeechError('engine');
  return new SpeechError('failed', (e as { message?: string } | null)?.message);
}

export async function speak(text: string, locale: string, rate = 0.92): Promise<void> {
  if (native) {
    try {
      await native.speak({ text, lang: locale, rate });
      return;
    } catch (e) {
      const err = asSpeechError(e);
      // нет языка — это окончательный ответ системы; при сбое движка пробуем Web Speech
      if (err.kind === 'lang' || !synth()) throw err;
    }
  }
  await speakWeb(text, locale, rate);
}
