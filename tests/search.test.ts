import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  editDistance,
  hasWord,
  indexOfWord,
  labelAt,
  lowerBound,
  parseWordList,
  prefixSearch,
  suggestSimilar,
} from '../src/lib/search.ts';

const en = parseWordList(
  ['bank\t49', 'blue\t49', 'café\t35', 'hello\t49', 'help\t52', 'helmet\t38', 'hell\t45', 'house\t53', 'run\t51', 'walk\t48', ''].join('\n'),
);
const ru = parseWordList(['дом\t53', 'ежик\t30\tёжик', 'еж\t31\tёж', 'привет\t49'].join('\n'));

test('parseWordList + бинарный поиск', () => {
  assert.equal(en.words.length, 10);
  assert.equal(lowerBound(en.words, 'hel'), 3);
  assert.equal(indexOfWord(en, 'house'), 7);
  assert.equal(indexOfWord(en, 'zebra'), -1);
  assert.ok(hasWord(en, 'café'));
  assert.ok(!hasWord(en, 'caf'));
});

test('prefixSearch: сначала частотные, затем короткие', () => {
  assert.deepEqual(
    prefixSearch(en, 'hel', 10).map((h) => h.key),
    ['help', 'hello', 'hell', 'helmet'],
  );
  assert.deepEqual(prefixSearch(en, 'hel', 2).map((h) => h.key), ['help', 'hello']);
  assert.deepEqual(prefixSearch(en, 'x'), []);
  assert.deepEqual(prefixSearch(en, ''), []);
});

test('русские подсказки показывают написание с ё', () => {
  const hits = prefixSearch(ru, 'еж');
  assert.deepEqual(hits.map((h) => h.label), ['ёж', 'ёжик']);
  assert.equal(labelAt(ru, indexOfWord(ru, 'дом')), 'дом');
});

test('editDistance (Дамерау–Левенштейн)', () => {
  assert.equal(editDistance('hello', 'hello', 2), 0);
  assert.equal(editDistance('helo', 'hello', 2), 1);
  assert.equal(editDistance('hlelo', 'hello', 2), 1, 'перестановка = 1');
  assert.equal(editDistance('kitten', 'sitting', 3), 3);
  assert.equal(editDistance('abc', 'abcdefg', 2), 3, 'досрочный выход: > max');
});

test('suggestSimilar: опечатки', () => {
  // «helo» одинаково близко к help и hello (расстояние 1) — важно, что оба предложены
  assert.ok(suggestSimilar(en, 'helo').map((h) => h.key).includes('hello'));
  assert.equal(suggestSimilar(en, 'hosue')[0]?.key, 'house');
  assert.equal(suggestSimilar(en, 'wlak')[0]?.key, 'walk');
  assert.deepEqual(suggestSimilar(en, 'qqqqqq'), []);
});
