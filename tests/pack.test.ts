import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DATA_URL } from '../src/config.ts';
import { files } from '../src/lib/filestore.ts';
import { cacheCount, fetchManifest, installPack, packInfo, removePack } from '../src/lib/pack.ts';
import { DataUnavailableError, readFile } from '../src/lib/source.ts';
import type { Progress } from '../src/lib/download.ts';

/** Сервер словаря эмулируем: Python собирает образец, fetch отдаёт его файлы по DATA_URL. */
let dir = '';
let online = true;
const requests: string[] = [];
const realFetch = globalThis.fetch;

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'recnik-pack-'));
  execFileSync('python3', ['scripts/build_data.py', '--sample', '--out', dir], { stdio: 'ignore' });
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    requests.push(url);
    if (!online) throw new TypeError('network down');
    assert.ok(url.startsWith(DATA_URL), `неожиданный адрес: ${url}`);
    const path = url.slice(DATA_URL.length).split('?')[0]!;
    const file = join(dir, path);
    if (!existsSync(file)) return new Response('Not Found', { status: 404 });
    return new Response(readFileSync(file, 'utf8'), { status: 200 });
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  rmSync(dir, { recursive: true, force: true });
});

test('онлайн: чтение «на лету» с записью в кэш', async () => {
  requests.length = 0;
  const text = await readFile('words.txt');
  assert.ok(text?.includes('zdravo'));
  assert.equal(requests.length, 1);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(await cacheCount(), 1);
  await readFile('words.txt');
  assert.equal(requests.length, 1, 'второй раз — из кэша');
});

test('404 → null, нет сети → DataUnavailableError', async () => {
  assert.equal(await readFile('e/999.json'), null);
  online = false;
  await assert.rejects(readFile('e/998.json'), DataUnavailableError);
  online = true;
});

test('манифест и установка пакета', async () => {
  assert.equal((await packInfo()).installed, false);
  const manifest = await fetchManifest();
  const seen: Progress[] = [];
  await installPack((p) => seen.push(p));
  const info = await packInfo();
  assert.equal(info.installed, true);
  assert.equal(info.version, manifest.version);
  assert.equal(info.files, manifest.files.length);
  assert.equal(seen[seen.length - 1]!.files, manifest.files.length);
  for (const [path] of manifest.files) assert.ok(await files.has('pack', path), path);
});

test('с установленным пакетом сеть не нужна', async () => {
  online = false;
  requests.length = 0;
  const text = await readFile('rwords.txt');
  assert.ok(text?.includes('привет'));
  assert.equal(requests.length, 0);
  online = true;
});

test('повторная установка той же версии докачивает без лишних запросов', async () => {
  requests.length = 0;
  await installPack(() => undefined);
  // только манифест — все файлы уже на месте
  assert.equal(requests.filter((u) => !u.includes('manifest.json')).length, 0);
  assert.equal((await packInfo()).installed, true);
});

test('удаление пакета', async () => {
  await removePack();
  assert.equal((await packInfo()).installed, false);
  assert.equal(await files.has('pack', 'words.txt'), false);
});

test('filestore: подрезка кэша оставляет свежие', async () => {
  await files.clear('cache');
  for (let i = 0; i < 5; i++) {
    await files.put('cache', `f${i}`, String(i));
    await new Promise((r) => setTimeout(r, 2));
  }
  await files.trim('cache', 2);
  assert.equal(await files.count('cache'), 2);
  assert.ok(await files.has('cache', 'f4'));
  assert.ok(!(await files.has('cache', 'f0')));
});
