import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SpeechError, setNativeSpeech, speak } from '../src/lib/speech.ts';

type G = Record<string, unknown>;
const g = globalThis as unknown as G;

class FakeUtterance {
  text: string;
  lang = '';
  rate = 1;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function fakeSynth(opts: { voices: Array<{ lang: string; localService: boolean }>; lateVoices?: boolean; error?: string }) {
  const listeners: Array<() => void> = [];
  let voices = opts.lateVoices ? [] : opts.voices;
  const spoken: FakeUtterance[] = [];
  const synth = {
    getVoices: () => voices,
    cancel: () => undefined,
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    removeEventListener: () => undefined,
    speak(u: FakeUtterance) {
      spoken.push(u);
      queueMicrotask(() => (opts.error ? u.onerror?.({ error: opts.error }) : u.onend?.()));
    },
  };
  g.speechSynthesis = synth;
  g.SpeechSynthesisUtterance = FakeUtterance;
  return {
    spoken,
    publish() {
      voices = opts.voices;
      for (const l of listeners) l();
    },
  };
}

afterEach(() => {
  setNativeSpeech(null);
  delete g.speechSynthesis;
  delete g.SpeechSynthesisUtterance;
});

test('web: голоса приходят позже (voiceschanged) — озвучка всё равно работает', async () => {
  const f = fakeSynth({ voices: [{ lang: 'en_US', localService: true }], lateVoices: true });
  const p = speak('hello', 'en-US');
  setTimeout(() => f.publish(), 10);
  await p;
  assert.equal(f.spoken.length, 1);
  assert.ok(f.spoken[0]!.voice);
});

test('web: список голосов пуст — всё равно говорим по lang', async () => {
  const f = fakeSynth({ voices: [], lateVoices: true });
  await speak('hello', 'en-US');
  assert.equal(f.spoken[0]!.lang, 'en-US');
});

test('web: нужного языка нет среди голосов → SpeechError(lang)', async () => {
  fakeSynth({ voices: [{ lang: 'de-DE', localService: true }] });
  await assert.rejects(speak('hello', 'en-US'), (e: unknown) => e instanceof SpeechError && e.kind === 'lang');
});

test('web: language-unavailable → lang, прочее → failed, canceled → не ошибка', async () => {
  fakeSynth({ voices: [{ lang: 'en-US', localService: true }], error: 'language-unavailable' });
  await assert.rejects(speak('a', 'en-US'), (e: unknown) => e instanceof SpeechError && e.kind === 'lang');
  fakeSynth({ voices: [{ lang: 'en-US', localService: true }], error: 'synthesis-failed' });
  await assert.rejects(speak('a', 'en-US'), (e: unknown) => e instanceof SpeechError && e.kind === 'failed');
  fakeSynth({ voices: [{ lang: 'en-US', localService: true }], error: 'canceled' });
  await speak('a', 'en-US');
});

test('нет ни нативного, ни web синтезатора → engine', async () => {
  await assert.rejects(speak('a', 'en-US'), (e: unknown) => e instanceof SpeechError && e.kind === 'engine');
});

test('native: успех не трогает web', async () => {
  const calls: string[] = [];
  setNativeSpeech({ speak: async (o) => void calls.push(`${o.lang}:${o.text}`), stop: async () => undefined });
  await speak('hello', 'en-GB');
  assert.deepEqual(calls, ['en-GB:hello']);
});

test('native: LANG_UNAVAILABLE → lang без обращения к web', async () => {
  const f = fakeSynth({ voices: [{ lang: 'en-US', localService: true }] });
  setNativeSpeech({ speak: async () => Promise.reject({ code: 'LANG_UNAVAILABLE' }), stop: async () => undefined });
  await assert.rejects(speak('a', 'ru-RU'), (e: unknown) => e instanceof SpeechError && e.kind === 'lang');
  assert.equal(f.spoken.length, 0);
});

test('native: сбой движка → запасной web-путь', async () => {
  const f = fakeSynth({ voices: [{ lang: 'en-US', localService: true }] });
  setNativeSpeech({ speak: async () => Promise.reject({ code: 'FAILED' }), stop: async () => undefined });
  await speak('a', 'en-US');
  assert.equal(f.spoken.length, 1);
});
