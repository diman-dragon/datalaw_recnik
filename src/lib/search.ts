/**
 * Поиск по отсортированному списку слов: префикс (бинарный поиск) и исправление опечаток
 * (расстояние Дамерау–Левенштейна). Всё в памяти, без сети.
 */

export interface WordIndex {
  /** ключи, отсортированы по возрастанию */
  words: string[];
  /** оценка (Zipf × 10) */
  score: number[];
  /** отображаемое написание, если отличается от ключа (русское «ё») */
  label: Map<number, string>;
}

export function parseWordList(text: string): WordIndex {
  const words: string[] = [];
  const score: number[] = [];
  const label = new Map<number, string>();
  for (const line of text.split('\n')) {
    if (!line) continue;
    const [key, s, shown] = line.split('\t');
    if (!key) continue;
    if (shown) label.set(words.length, shown);
    words.push(key);
    score.push(Number(s) || 0);
  }
  return { words, score, label };
}

/** Первая позиция, где words[i] >= key. */
export function lowerBound(words: string[], key: string): number {
  let lo = 0;
  let hi = words.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((words[mid] as string) < key) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function indexOfWord(ix: WordIndex, key: string): number {
  const i = lowerBound(ix.words, key);
  return ix.words[i] === key ? i : -1;
}

export const hasWord = (ix: WordIndex, key: string): boolean => indexOfWord(ix, key) >= 0;

export function labelAt(ix: WordIndex, i: number): string {
  return ix.label.get(i) ?? (ix.words[i] as string);
}

export interface Hit {
  key: string;
  label: string;
  score: number;
}

/** Слова, начинающиеся с prefix; частотные — выше, затем короткие. */
export function prefixSearch(ix: WordIndex, prefix: string, limit = 8): Hit[] {
  if (!prefix) return [];
  const found: number[] = [];
  for (let i = lowerBound(ix.words, prefix); i < ix.words.length && found.length < 600; i++) {
    if (!(ix.words[i] as string).startsWith(prefix)) break;
    found.push(i);
  }
  found.sort(
    (a, b) =>
      (ix.score[b] as number) - (ix.score[a] as number) ||
      (ix.words[a] as string).length - (ix.words[b] as string).length ||
      ((ix.words[a] as string) < (ix.words[b] as string) ? -1 : 1),
  );
  return found.slice(0, limit).map((i) => ({
    key: ix.words[i] as string,
    label: labelAt(ix, i),
    score: ix.score[i] as number,
  }));
}

/** Расстояние Дамерау–Левенштейна (OSA) с досрочным выходом, если оно больше max. */
export function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min((prev[j] as number) + 1, (cur[j - 1] as number) + 1, (prev[j - 1] as number) + cost);
      if (i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
        v = Math.min(v, (prev2[j - 2] as number) + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[lb] as number;
}

/** «Возможно, вы искали…»: близкие по написанию слова словаря. */
export function suggestSimilar(ix: WordIndex, word: string, limit = 6): Hit[] {
  if (word.length < 2) return [];
  const max = word.length <= 4 ? 1 : 2;
  const found: Array<{ i: number; d: number }> = [];
  for (let i = 0; i < ix.words.length; i++) {
    const w = ix.words[i] as string;
    if (Math.abs(w.length - word.length) > max) continue;
    // первая буква почти всегда верна — отсекаем 90% кандидатов дёшево
    if (word.length > 3 && w[0] !== word[0] && w[1] !== word[0]) continue;
    const d = editDistance(word, w, max);
    if (d <= max) found.push({ i, d });
  }
  found.sort((a, b) => a.d - b.d || (ix.score[b.i] as number) - (ix.score[a.i] as number));
  return found.slice(0, limit).map(({ i }) => ({
    key: ix.words[i] as string,
    label: labelAt(ix, i),
    score: ix.score[i] as number,
  }));
}
