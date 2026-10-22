import { toCyrillic } from './text.ts';
import type { ScriptPref } from './text.ts';
import type { Entry, Meaning } from './types.ts';

/** [основное написание, второе написание] по выбору письма. */
export function headwords(entry: Pick<Entry, 'w' | 'c'>, pref: ScriptPref): [string, string] {
  const cyr = entry.c ?? toCyrillic(entry.w);
  return pref === 'cyr' ? [cyr, entry.w] : [entry.w, cyr];
}

export const exactMeanings = (entry: Entry | null | undefined): Meaning[] => (entry?.m ?? []).filter((m) => !m.a);
export const hasExact = (entry: Entry | null | undefined): boolean => exactMeanings(entry).length > 0;

/** Самые частые русские переводы: по одному из каждого значения, сначала точные; без повторов. */
export function topRussian(entry: Entry | null | undefined, limit = 4): string[] {
  const exact = exactMeanings(entry);
  const groups = exact.length > 0 ? exact : (entry?.m ?? []);
  const seen = new Set<string>();
  const out: string[] = [];
  const rounds = Math.max(0, ...groups.map((g) => g.ru.length));
  for (let i = 0; i < rounds && out.length < limit; i++) {
    for (const g of groups) {
      const term = g.ru[i];
      if (!term) continue;
      const key = term.w.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(term.w);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Первое английское определение (для подсказок). */
export function firstEnglish(entry: Entry | null | undefined, max = 90): string | undefined {
  const g = entry?.d?.[0]?.g[0];
  if (!g) return undefined;
  return g.length > max ? `${g.slice(0, max - 1)}…` : g;
}

export type FrequencyBand = 'veryCommon' | 'common' | 'uncommon' | 'rare';

/** z — Zipf × 10: 50+ — «i», «je»; 40+ — обычная лексика; 30+ — редкая; ниже — очень редкая. */
export function frequencyBand(z: number | undefined): FrequencyBand | undefined {
  if (z === undefined || z <= 0) return undefined;
  if (z >= 50) return 'veryCommon';
  if (z >= 40) return 'common';
  if (z >= 30) return 'uncommon';
  return 'rare';
}

export const BAND_LEVEL: Record<FrequencyBand, 1 | 2 | 3 | 4> = {
  veryCommon: 4,
  common: 3,
  uncommon: 2,
  rare: 1,
};

/** Слова дня; показываются, если есть в собранных данных. */
export const WORDS_OF_THE_DAY: readonly string[] = [
  'ljubav', 'sreća', 'prijatelj', 'more', 'planina', 'vreme', 'radost', 'tišina', 'nada', 'sunce',
  'mesec', 'zvezda', 'kiša', 'vetar', 'knjiga', 'putovanje', 'porodica', 'hrana', 'grad', 'reka',
  'snaga', 'sloboda', 'mir', 'san', 'dom', 'srce', 'duša', 'put', 'ptica', 'cvet', 'drvo', 'zima',
  'proleće', 'leto', 'jesen', 'jutro', 'veče', 'noć', 'osmeh', 'priča', 'pesma', 'muzika', 'škola',
  'učitelj', 'jezik', 'reč', 'misao', 'sećanje', 'čudo', 'tajna', 'hrabrost', 'strpljenje', 'mudrost',
  'pravda', 'istina', 'život', 'svet', 'ostrvo', 'jezero', 'oblak', 'sneg', 'vatra', 'voda', 'zemlja',
];

function dayNumber(d = new Date()): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

export function wordOfTheDay(offset = 0): string {
  const n = WORDS_OF_THE_DAY.length;
  return WORDS_OF_THE_DAY[(((dayNumber() + offset) % n) + n) % n] ?? 'ljubav';
}
