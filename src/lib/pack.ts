import { runDownload, isManifest } from './download.ts';
import type { Manifest, Progress } from './download.ts';
import { files } from './filestore.ts';
import { DataUnavailableError, fetchRemote } from './source.ts';

/** Скачанный на устройство словарь («пакет»). Признак готовности — manifest.json в области pack. */
const DONE = 'manifest.json';
const STARTED = '.version';

export interface PackInfo {
  installed: boolean;
  version?: string;
  files?: number;
  bytes?: number;
}

export async function packInfo(): Promise<PackInfo> {
  const raw = await files.get('pack', DONE);
  if (!raw) return { installed: false };
  try {
    const m: unknown = JSON.parse(raw);
    if (isManifest(m)) return { installed: true, version: m.version, files: m.files.length, bytes: m.total };
  } catch {
    /* повреждён — считаем, что не установлен */
  }
  return { installed: false };
}

/** Актуальный манифест на сервере (без кэша). */
export async function fetchManifest(signal?: AbortSignal): Promise<Manifest> {
  const text = await fetchRemote(DONE, signal, true);
  if (text === null) throw new DataUnavailableError('manifest.json not found');
  const m: unknown = JSON.parse(text);
  if (!isManifest(m)) throw new DataUnavailableError('bad manifest');
  return m;
}

export async function installPack(onProgress: (p: Progress) => void, signal?: AbortSignal): Promise<Manifest> {
  const manifest = await fetchManifest(signal);

  // Новая версия словаря — начинаем с чистого листа; та же версия — докачиваем недостающее
  const started = await files.get('pack', STARTED);
  if (started !== manifest.version) {
    await files.clear('pack');
    await files.put('pack', STARTED, manifest.version);
  } else {
    await files.delete('pack', DONE);
  }

  await runDownload(
    manifest,
    {
      async fetchText(path, sig) {
        const text = await fetchRemote(path, sig);
        if (text === null) throw new DataUnavailableError(`missing ${path}`);
        return text;
      },
      has: (path) => files.has('pack', path),
      put: (path, text) => files.put('pack', path, text),
    },
    onProgress,
    signal ? { signal } : {},
  );

  await files.put('pack', DONE, JSON.stringify(manifest));
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* необязательно */
  }
  return manifest;
}

export async function removePack(): Promise<void> {
  await files.clear('pack');
}

export const cacheCount = (): Promise<number> => files.count('cache');
export const clearCache = (): Promise<void> => files.clear('cache');
