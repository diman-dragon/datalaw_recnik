import { Preferences } from '@capacitor/preferences';
import { useEffect, useState } from 'preact/hooks';
import type { ScriptPref } from './lib/text.ts';

/* ───────────── Мини-стор ───────────── */

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(fn: () => void): () => void;
}

function createStore<T>(initial: T, onChange?: (value: T) => void): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
      onChange?.(value);
      for (const l of listeners) l();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  const [, force] = useState(0);
  useEffect(() => store.subscribe(() => force((n) => n + 1)), [store]);
  return store.get();
}

/** Стор, сохраняемый в SharedPreferences (Android) / localStorage (браузер). */
function persisted<T>(key: string, initial: T, revive: (raw: unknown) => T) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const store = createStore<T>(initial, (value) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void Preferences.set({ key, value: JSON.stringify(value) });
    }, 120);
  });
  const hydrate = async () => {
    const { value } = await Preferences.get({ key });
    if (!value) return;
    try {
      // set() вызовет onChange и перезапишет то же значение — это безвредно
      store.set(revive(JSON.parse(value)));
    } catch {
      /* битые данные — остаёмся на значениях по умолчанию */
    }
  };
  return { store, hydrate };
}

/* ───────────── Настройки ───────────── */

/** auto — по системе (светлая — светло-коричневая, тёмная — AMOLED) */
export type ThemeMode = 'auto' | 'light' | 'amoled';
export type UiLang = 'ru' | 'en';
export type { ScriptPref } from './lib/text.ts';

export interface Settings {
  theme: ThemeMode;
  uiLang: UiLang;
  /** Как показывать сербские слова: латиница или кириллица */
  script: ScriptPref;
  haptics: boolean;
  /** Показывать карточку «скачайте словарь для офлайна» на главном */
  offlineHint: boolean;
}

function defaultSettings(): Settings {
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'ru').toLowerCase();
  return {
    theme: 'auto',
    uiLang: nav.startsWith('ru') ? 'ru' : 'en',
    script: 'lat',
    haptics: true,
    offlineHint: true,
  };
}

function reviveSettings(raw: unknown): Settings {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Settings>;
  return {
    theme: r.theme === 'light' || r.theme === 'amoled' || r.theme === 'auto' ? r.theme : base.theme,
    uiLang: r.uiLang === 'ru' || r.uiLang === 'en' ? r.uiLang : base.uiLang,
    script: r.script === 'cyr' || r.script === 'lat' ? r.script : base.script,
    haptics: typeof r.haptics === 'boolean' ? r.haptics : base.haptics,
    offlineHint: typeof r.offlineHint === 'boolean' ? r.offlineHint : base.offlineHint,
  };
}

/* ───────────── Мои слова и история ───────────── */

export interface SavedWord {
  word: string;
  at: number;
  /** Короткое значение — для списка */
  gloss?: string;
}

export interface HistoryItem {
  word: string;
  at: number;
}

const reviveList =
  <T extends { word: string; at: number }>() =>
  (raw: unknown): T[] =>
    Array.isArray(raw)
      ? (raw as T[]).filter((x) => x && typeof x.word === 'string' && typeof x.at === 'number')
      : [];

const settingsP = persisted<Settings>('datalaw_recnik.settings', defaultSettings(), reviveSettings);
const savedP = persisted<SavedWord[]>('datalaw_recnik.saved', [], reviveList<SavedWord>());
const historyP = persisted<HistoryItem[]>('datalaw_recnik.history', [], reviveList<HistoryItem>());

export const settings = settingsP.store;
export const saved = savedP.store;
export const history = historyP.store;

export async function hydrateStores(): Promise<void> {
  await Promise.all([settingsP.hydrate(), savedP.hydrate(), historyP.hydrate()]);
}

export function updateSettings(patch: Partial<Settings>): void {
  settings.set((prev) => ({ ...prev, ...patch }));
}

export function isSaved(list: SavedWord[], word: string): boolean {
  return list.some((s) => s.word === word);
}

/** true — слово добавлено, false — удалено */
export function toggleSaved(word: string, gloss?: string): boolean {
  const exists = isSaved(saved.get(), word);
  saved.set((prev) => {
    if (exists) return prev.filter((s) => s.word !== word);
    const item: SavedWord = { word, at: Date.now() };
    if (gloss) item.gloss = gloss;
    return [item, ...prev];
  });
  return !exists;
}

export function pushHistory(word: string): void {
  history.set((prev) => [{ word, at: Date.now() }, ...prev.filter((h) => h.word !== word)].slice(0, 300));
}

export function clearHistory(): void {
  history.set([]);
}

/* ───────────── Тосты ───────────── */

export interface Toast {
  id: number;
  text: string;
}
export const toast = createStore<Toast | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(text: string): void {
  clearTimeout(toastTimer);
  toast.set({ id: Date.now(), text });
  toastTimer = setTimeout(() => toast.set(null), 2200);
}
