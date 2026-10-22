import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSr, cyrillicKind, detectScript, foldSr, normalizeRu, showText, showWord, toCyrillic, toLatin } from '../src/lib/text.ts';

// Те же таблицы, что в scripts/test_build_data.py: письмо и ключи обязаны совпадать с Python.
const CLEAN: Array<[string, string, string]> = [
  ['Ђурђевак', 'đurđevak', 'djurdjevak'],
  ['Šećer', 'šećer', 'secer'],
  ['ЉУБАВ', 'ljubav', 'ljubav'],
  ['džem', 'džem', 'dzem'],
  ['Čovek', 'čovek', 'covek'],
  ['pȁs', 'pas', 'pas'],
  ['кућа', 'kuća', 'kuca'],
  ['Шума', 'šuma', 'suma'],
  ['ĐAK', 'đak', 'djak'],
  ['hvala!', 'hvala', 'hvala'],
  ['  Moja  kuća, ', 'moja kuća', 'moja kuca'],
  ['rȉječ', 'riječ', 'rijec'],
];

test('cleanSr / foldSr — как в Python', () => {
  for (const [raw, clean, fold] of CLEAN) {
    assert.equal(cleanSr(raw), clean, raw);
    assert.equal(foldSr(raw), fold, raw);
  }
});

test('транслитерация', () => {
  assert.equal(toCyrillic('Njegova kuća, ljubav i džem; đak'), 'Његова кућа, љубав и џем; ђак');
  assert.equal(toLatin('Његова кућа, љубав и џем; ђак'), 'Njegova kuća, ljubav i džem; đak');
  for (const w of ['srpski', 'žena', 'šuma', 'ćao', 'đak', 'hvala', 'lopta']) assert.equal(toLatin(toCyrillic(w)), w);
});

test('кириллица и латиница ищут одно и то же слово', () => {
  assert.equal(foldSr('кућа'), foldSr('kuća'));
  assert.equal(foldSr('kuca'), foldSr('кућа'));
  assert.equal(foldSr('đak'), foldSr('djak'));
  assert.equal(foldSr('džem'), foldSr('dzem'));
});

test('normalizeRu — как norm_ru в Python', () => {
  assert.equal(normalizeRu('  Моро́женое, '), 'мороженое');
  assert.equal(normalizeRu('Ёж'), 'еж');
  assert.equal(normalizeRu('ПРИВЕТ!'), 'привет');
});

test('detectScript и cyrillicKind', () => {
  assert.equal(detectScript('hvala'), 'latin');
  assert.equal(detectScript('хвала'), 'cyrillic');
  assert.equal(detectScript('123'), 'other');
  assert.equal(cyrillicKind('ђак'), 'serbian');
  assert.equal(cyrillicKind('щука'), 'russian');
  assert.equal(cyrillicKind('привет'), 'both');
  assert.equal(cyrillicKind('вода'), 'both');
});

test('showWord / showText по выбранному письму', () => {
  assert.equal(showWord('kuća', 'cyr'), 'кућа');
  assert.equal(showWord('kuća', 'lat'), 'kuća');
  assert.equal(showText('Моја кућа је близу реке.', 'lat'), 'Moja kuća je blizu reke.');
  assert.equal(showText('Molim te, daj mi vode.', 'cyr'), 'Молим те, дај ми воде.');
});
