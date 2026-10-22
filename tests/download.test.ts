import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isManifest, runDownload } from '../src/lib/download.ts';
import type { DownloadIO, Manifest, Progress } from '../src/lib/download.ts';

const manifest: Manifest = {
  version: 'v1',
  total: 60,
  files: [
    ['a.json', 10],
    ['b.json', 10],
    ['c.json', 10],
    ['d.json', 10],
    ['e.json', 10],
    ['f.json', 10],
  ],
};

function fakeIO(opts: { failFirst?: Set<string>; have?: Set<string>; failAlways?: string } = {}) {
  const stored = new Map<string, string>();
  const attempts = new Map<string, number>();
  const io: DownloadIO = {
    async fetchText(path) {
      const n = (attempts.get(path) ?? 0) + 1;
      attempts.set(path, n);
      if (opts.failAlways === path) throw new Error('boom');
      if (opts.failFirst?.has(path) && n === 1) throw new Error('flaky');
      await new Promise((r) => setTimeout(r, 1));
      return `content:${path}`;
    },
    has: async (p) => opts.have?.has(p) === true || stored.has(p),
    put: async (p, t) => {
      stored.set(p, t);
    },
  };
  return { io, stored, attempts };
}

test('isManifest', () => {
  assert.ok(isManifest(manifest));
  assert.ok(!isManifest(null));
  assert.ok(!isManifest({ version: 'x', total: 1, files: [['a']] }));
  assert.ok(!isManifest({ version: 1, total: 1, files: [] }));
});

test('скачивает все файлы и сообщает прогресс', async () => {
  const { io, stored } = fakeIO();
  const seen: Progress[] = [];
  const n = await runDownload(manifest, io, (p) => seen.push(p), { concurrency: 3 });
  assert.equal(n, 6);
  assert.equal(stored.size, 6);
  const last = seen[seen.length - 1]!;
  assert.deepEqual(last, { files: 6, totalFiles: 6, bytes: 60, totalBytes: 60 });
  assert.equal(seen[0]!.files, 0);
  // прогресс монотонный
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i]!.bytes >= seen[i - 1]!.bytes);
});

test('докачка: готовые файлы пропускаются, но учитываются в прогрессе', async () => {
  const { io, attempts } = fakeIO({ have: new Set(['a.json', 'b.json']) });
  let last: Progress | undefined;
  const n = await runDownload(manifest, io, (p) => (last = p), { retryDelayMs: 1 });
  assert.equal(n, 4);
  assert.ok(!attempts.has('a.json'));
  assert.equal(last?.files, 6);
});

test('повтор после временной ошибки', async () => {
  const { io, attempts } = fakeIO({ failFirst: new Set(['c.json']) });
  const n = await runDownload(manifest, io, () => undefined, { retryDelayMs: 1 });
  assert.equal(n, 6);
  assert.equal(attempts.get('c.json'), 2);
});

test('постоянная ошибка прерывает загрузку', async () => {
  const { io } = fakeIO({ failAlways: 'd.json' });
  await assert.rejects(runDownload(manifest, io, () => undefined, { retries: 1, retryDelayMs: 1, concurrency: 2 }), /boom/);
});

test('отмена пользователем', async () => {
  const { io, stored } = fakeIO();
  const ctrl = new AbortController();
  const p = runDownload(manifest, io, (pr) => { if (pr.files >= 2) ctrl.abort(); }, { concurrency: 1, signal: ctrl.signal });
  await assert.rejects(p, (e: unknown) => e instanceof DOMException && e.name === 'AbortError');
  assert.ok(stored.size < 6);
});
