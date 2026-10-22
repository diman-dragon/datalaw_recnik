import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SHARDS, shardName, shardOf } from '../src/lib/hash.ts';
import { foldSr, normalizeRu } from '../src/lib/text.ts';
import { hasWord, parseWordList, prefixSearch } from '../src/lib/search.ts';
import type { Entry, Meta, SentencePair } from '../src/lib/types.ts';

/** Сквозная проверка: Python собирает образец, TypeScript находит данные теми же шардами и ключами. */
let dir = '';

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'recnik-data-'));
  execFileSync('python3', ['scripts/build_data.py', '--sample', '--out', dir], { stdio: 'ignore' });
});
after(() => rmSync(dir, { recursive: true, force: true }));

const read = <T>(folder: 'e' | 'r' | 's', key: string): Record<string, T> =>
  JSON.parse(readFileSync(join(dir, folder, `${shardName(shardOf(key, SHARDS[folder]))}.json`), 'utf8')) as Record<string, T>;

test('meta и список слов', () => {
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as Meta;
  assert.equal(meta.words, 12);
  const ix = parseWordList(readFileSync(join(dir, 'words.txt'), 'utf8'));
  assert.ok(hasWord(ix, 'zdravo'));
  assert.equal(prefixSearch(ix, 'k').map((h) => h.label)[0], 'kuća');
});

test('«kuca» и «кућа» находят одну статью «kuća»', () => {
  const ix = parseWordList(readFileSync(join(dir, 'words.txt'), 'utf8'));
  for (const input of ['kuca', 'kuća', 'КУЋА', 'кућа']) {
    const hits = prefixSearch(ix, foldSr(input));
    assert.equal(hits[0]?.label, 'kuća', input);
  }
  const e = read<Entry>('e', 'kuća')['kuća'];
  assert.equal(e?.m?.[0]?.ru[0]?.w, 'дом');
});

test('форма слова ведёт к лемме', () => {
  assert.deepEqual(read<Entry>('e', 'psa')['psa']?.r, ['pas']);
});

test('обратный поиск по русскому слову (ё, ударения, регистр)', () => {
  const key = normalizeRu('Пёс');
  assert.deepEqual(read<string[]>('r', key)[key], ['pas']);
  const k2 = normalizeRu('Вода́');
  assert.deepEqual(read<string[]>('r', k2)[k2], ['voda']);
});

test('предложения ищутся по ключу без диакритики', () => {
  const key = foldSr('kuća');
  const s = read<SentencePair[]>('s', key)[key];
  assert.equal(s?.[0]?.[1], 'Мой дом находится рядом с рекой.');
});
