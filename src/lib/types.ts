/** Форматы данных (см. scripts/build_data.py). Короткие ключи — для компактности JSON. */

export interface RuTerm {
  /** русский перевод */
  w: string;
  /** пометки: m f n pl pf impf … */
  x?: string;
}

/** Значение: русские переводы + английский «мостик», через который они найдены. */
export interface Meaning {
  /** часть речи (noun, verb, adjective …) */
  t: string;
  /** английское слово-мостик */
  e: string;
  /** уточнение значения (по английской статье) */
  s?: string;
  ru: RuTerm[];
  /** 1 — приблизительный перевод (через английское слово, а не из одного значения) */
  a?: 1;
}

export interface Definition {
  t: string;
  /** английские определения сербской статьи */
  g: string[];
}

export interface Entry {
  /** написание латиницей (ключ статьи) */
  w: string;
  /** кириллица, если отличается от обычной транслитерации */
  c?: string;
  /** Zipf-частотность × 10 */
  z?: number;
  /** транскрипция IPA */
  p?: string;
  /** пометки рода/вида: m f n pl pf impf anim inan */
  gd?: string;
  m?: Meaning[];
  d?: Definition[];
  /** формы слова [форма, грамматические теги] */
  f?: Array<[string, string]>;
  /** перенаправление: это форма другого слова */
  r?: string[];
  /** пояснение формы («genitive singular») */
  rg?: string;
}

export interface Meta {
  schema: number;
  built: string;
  words: number;
  forms: number;
  exact: number;
  approx: number;
  ruTerms: number;
  sentences: number;
  frequency: boolean;
  sources: string[];
}

export type SentencePair = [sr: string, ru: string];
