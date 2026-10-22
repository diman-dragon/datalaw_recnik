import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a, shardName, shardOf } from '../src/lib/hash.ts';

// Золотые значения посчитаны Python-пайплайном (scripts/build_data.py) — шардирование обязано совпадать.
test('fnv1a совпадает с Python', () => {
  assert.equal(fnv1a(''), 2166136261);
  assert.equal(fnv1a('hello'), 1335831723);
  assert.equal(fnv1a('привет'), 2168984447);
});

test('shardOf / shardName', () => {
  assert.equal(shardOf('pas', 256), 251);
  assert.equal(shardOf('kuća', 256), 63);
  assert.equal(shardOf('собака', 128), 56);
  assert.equal(shardOf('kuca', 128), 81);
  assert.equal(shardName(7), '007');
});
