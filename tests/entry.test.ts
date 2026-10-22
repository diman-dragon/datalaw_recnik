import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAND_LEVEL, WORDS_OF_THE_DAY, exactMeanings, firstEnglish, frequencyBand, hasExact, headwords, topRussian, wordOfTheDay } from '../src/lib/entry.ts';
import type { Entry } from '../src/lib/types.ts';

const pas: Entry = {
  w: 'pas',
  z: 46,
  p: '/pâs/',
  m: [
    { t: 'noun', e: 'dog', s: 'domestic animal', ru: [{ w: 'собака', x: 'f' }, { w: 'пёс', x: 'm' }] },
    { t: 'noun', e: 'friend', ru: [{ w: 'друг' }, { w: 'собака' }] },
    { t: 'noun', e: 'cat', a: 1, ru: [{ w: 'кот' }] },
  ],
  d: [{ t: 'noun', g: ['dog, a very long definition that must be cut by the limit'] }],
};

test('headwords по выбору письма', () => {
  assert.deepEqual(headwords({ w: 'kuća' }, 'lat'), ['kuća', 'кућа']);
  assert.deepEqual(headwords({ w: 'kuća' }, 'cyr'), ['кућа', 'kuća']);
  assert.deepEqual(headwords({ w: 'injekcija', c: 'инјекција' }, 'cyr'), ['инјекција', 'injekcija']);
});

test('точные значения выше приблизительных', () => {
  assert.equal(exactMeanings(pas).length, 2);
  assert.ok(hasExact(pas));
  assert.ok(!hasExact({ w: 'x', m: [{ t: 'noun', e: 'a', a: 1, ru: [{ w: 'б' }] }] }));
  assert.ok(!hasExact(null));
});

test('topRussian: по одному из значения, без повторов', () => {
  assert.deepEqual(topRussian(pas, 4), ['собака', 'друг', 'пёс']);
  assert.deepEqual(topRussian(pas, 2), ['собака', 'друг']);
  // нет точных — берём приблизительные
  assert.deepEqual(topRussian({ w: 'x', m: [{ t: 'noun', e: 'a', a: 1, ru: [{ w: 'кот' }] }] }), ['кот']);
  assert.deepEqual(topRussian(undefined), []);
});

test('firstEnglish обрезает', () => {
  assert.equal(firstEnglish(pas, 10), 'dog, a ve…');
  assert.equal(firstEnglish(null), undefined);
});

test('frequencyBand', () => {
  assert.equal(frequencyBand(undefined), undefined);
  assert.equal(frequencyBand(55), 'veryCommon');
  assert.equal(frequencyBand(45), 'common');
  assert.equal(frequencyBand(33), 'uncommon');
  assert.equal(frequencyBand(20), 'rare');
  assert.equal(BAND_LEVEL.veryCommon, 4);
});

test('wordOfTheDay детерминирован и циклически смещается', () => {
  assert.equal(wordOfTheDay(), wordOfTheDay(0));
  assert.equal(wordOfTheDay(WORDS_OF_THE_DAY.length), wordOfTheDay(0));
  assert.notEqual(wordOfTheDay(1), wordOfTheDay(0));
  assert.ok(WORDS_OF_THE_DAY.includes(wordOfTheDay(-5)));
});
