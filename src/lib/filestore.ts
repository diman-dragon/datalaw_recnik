/**
 * Файловое хранилище на IndexedDB с двумя областями:
 *   pack  — скачанный пользователем словарь (кнопка «Скачать для офлайна»); не вытесняется
 *   cache — кэш того, что читалось «на лету» онлайн; можно очищать и подрезать
 * Если IndexedDB недоступна (тесты, приватный режим) — работает в памяти.
 */

export type Area = 'pack' | 'cache';

interface Rec {
  path: string;
  text: string;
  at: number;
}

const DB_NAME = 'datalaw_recnik-files';
const AREAS: Area[] = ['pack', 'cache'];

let dbPromise: Promise<IDBDatabase> | null = null;
const memory: Record<Area, Map<string, Rec>> = { pack: new Map(), cache: new Map() };
let useMemory = typeof indexedDB === 'undefined';

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      for (const a of AREAS) req.result.createObjectStore(a, { keyPath: 'path' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run<T>(area: Area, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(area, mode);
    const req = fn(tx.objectStore(area));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Любая ошибка IndexedDB переводит хранилище в режим «в памяти» — приложение продолжает работать. */
async function guard<T>(idb: () => Promise<T>, mem: () => T): Promise<T> {
  if (useMemory) return mem();
  try {
    return await idb();
  } catch {
    useMemory = true;
    return mem();
  }
}

export const files = {
  async get(area: Area, path: string): Promise<string | undefined> {
    return guard(
      async () => (await run<Rec | undefined>(area, 'readonly', (s) => s.get(path)))?.text,
      () => memory[area].get(path)?.text,
    );
  },

  async has(area: Area, path: string): Promise<boolean> {
    return guard(
      async () => (await run<number>(area, 'readonly', (s) => s.count(path))) > 0,
      () => memory[area].has(path),
    );
  },

  async put(area: Area, path: string, text: string): Promise<void> {
    const rec: Rec = { path, text, at: Date.now() };
    await guard(
      async () => {
        await run(area, 'readwrite', (s) => s.put(rec));
      },
      () => {
        memory[area].set(path, rec);
      },
    );
  },

  async delete(area: Area, path: string): Promise<void> {
    await guard(
      async () => {
        await run(area, 'readwrite', (s) => s.delete(path));
      },
      () => {
        memory[area].delete(path);
      },
    );
  },

  async count(area: Area): Promise<number> {
    return guard(
      () => run<number>(area, 'readonly', (s) => s.count()),
      () => memory[area].size,
    );
  },

  async clear(area: Area): Promise<void> {
    await guard(
      async () => {
        await run(area, 'readwrite', (s) => s.clear());
      },
      () => {
        memory[area].clear();
      },
    );
  },

  /** Оставляет в кэше не более max самых свежих файлов. */
  async trim(area: Area, max: number): Promise<void> {
    await guard(
      async () => {
        const db = await openDb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(area, 'readwrite');
          const items: Array<{ path: string; at: number }> = [];
          const req = tx.objectStore(area).openCursor();
          req.onsuccess = () => {
            const cur = req.result;
            if (cur) {
              const r = cur.value as Rec;
              items.push({ path: r.path, at: r.at });
              cur.continue();
              return;
            }
            items.sort((a, b) => a.at - b.at);
            for (const it of items.slice(0, Math.max(0, items.length - max))) tx.objectStore(area).delete(it.path);
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      },
      () => {
        const m = memory[area];
        const sorted = [...m.values()].sort((a, b) => a.at - b.at);
        for (const r of sorted.slice(0, Math.max(0, sorted.length - max))) m.delete(r.path);
      },
    );
  },
};
