/**
 * Письмо и ключи поиска. Обязано совпадать с scripts/build_data.py
 * (to_latin / to_cyrillic / clean_sr / fold_sr / norm_ru) — проверяется общими золотыми таблицами в тестах.
 */
const EDGE = /^[\s"'“”«»(\[]+|[\s"'“”«»)\].,;:!?]+$/g;

const CYR = 'абвгдђежзијклљмнњопрстћуфхцчџш';
const LAT = ['a', 'b', 'v', 'g', 'd', 'đ', 'e', 'ž', 'z', 'i', 'j', 'k', 'l', 'lj', 'm', 'n', 'nj', 'o', 'p', 'r', 's', 't', 'ć', 'u', 'f', 'h', 'c', 'č', 'dž', 'š'];
const C2L = new Map<string, string>();
const L2C = new Map<string, string>();
[...CYR].forEach((c, i) => {
  C2L.set(c, LAT[i] as string);
  L2C.set(LAT[i] as string, c);
});

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Сербская кириллица → латиница (остальное без изменений); регистр сохраняется. */
export function toLatin(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFC')) {
    const low = ch.toLowerCase();
    const lat = C2L.get(low);
    out += lat === undefined ? ch : ch !== low ? capital(lat) : lat;
  }
  return out;
}

/** Латиница → сербская кириллица (lj, nj, dž — одна буква). */
export function toCyrillic(text: string): string {
  const t = text.normalize('NFC');
  let out = '';
  for (let i = 0; i < t.length; i++) {
    const two = t.slice(i, i + 2).toLowerCase();
    if (two === 'lj' || two === 'nj' || two === 'dž') {
      const c = L2C.get(two) as string;
      out += (t[i] as string) !== (t[i] as string).toLowerCase() ? c.toUpperCase() : c;
      i += 1;
      continue;
    }
    const ch = t[i] as string;
    const c = L2C.get(ch.toLowerCase());
    out += c === undefined ? ch : ch !== ch.toLowerCase() ? c.toUpperCase() : c;
  }
  return out;
}

const KEEP_MARK = new Set(['ć', 'č', 'š', 'ž']);

/** Убирает знаки ударения, оставляя č ć š ž. */
function stripMarks(s: string): string {
  const out: string[] = [];
  for (const ch of s.normalize('NFD')) {
    if (/\p{Mn}/u.test(ch)) {
      const prev = out[out.length - 1];
      if (prev !== undefined && KEEP_MARK.has(prev + ch)) out.push(ch);
      continue;
    }
    out.push(ch);
  }
  return out.join('').normalize('NFC');
}

/** Каноническое написание сербского слова: латиница, нижний регистр, без ударений. */
export function cleanSr(input: string): string {
  return stripMarks(toLatin(input).toLowerCase()).replace(/\s+/g, ' ').trim().replace(EDGE, '');
}

const FOLD: Record<string, string> = { č: 'c', ć: 'c', š: 's', ž: 'z', đ: 'dj' };

/** Ключ поиска: любое письмо → латиница без диакритики (đ → dj). */
export function foldSr(input: string): string {
  return cleanSr(input).replace(/[čćšžđ]/g, (m) => FOLD[m] as string);
}

/** Ключ русского термина — как norm_ru(): без ударений, ё → е. */
export function normalizeRu(input: string): string {
  return input
    .normalize('NFC')
    .replace(/[́̀]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(EDGE, '')
    .toLowerCase()
    .replace(/ё/g, 'е');
}

export type Script = 'latin' | 'cyrillic' | 'other';

/** Определяет, в какой письменности введён запрос (по первой букве). */
export function detectScript(text: string): Script {
  const m = /\p{L}/u.exec(text);
  if (!m) return 'other';
  if (/\p{Script=Cyrillic}/u.test(m[0])) return 'cyrillic';
  if (/\p{Script=Latin}/u.test(m[0])) return 'latin';
  return 'other';
}

/** Кириллица: сербская (ђ ј љ њ ћ џ), русская (ё ы э ъ ь щ ю я й) или общая для обоих языков. */
export function cyrillicKind(text: string): 'serbian' | 'russian' | 'both' {
  if (/[ђјљњћџ]/i.test(text)) return 'serbian';
  if (/[ёыэъьщюяй]/i.test(text)) return 'russian';
  return 'both';
}

export type ScriptPref = 'lat' | 'cyr';

/** Слово в выбранной пользователем письменности (для списков). */
export function showWord(lat: string, pref: ScriptPref): string {
  return pref === 'cyr' ? toCyrillic(lat) : lat;
}

/** Предложение/фраза в выбранной письменности (любой исходной). */
export function showText(text: string, pref: ScriptPref): string {
  return pref === 'cyr' ? toCyrillic(toLatin(text)) : toLatin(text);
}
