import { DATA_URL } from '../config.ts';
import { files } from './filestore.ts';

/** Нет сети или сервер не ответил — отличается от «такого файла нет». */
export class DataUnavailableError extends Error {
  constructor(message = 'Dictionary data unavailable') {
    super(message);
    this.name = 'DataUnavailableError';
  }
}

export const CACHE_LIMIT = 500;

/** Скачивает файл словаря с сервера. null — файла нет (404), исключение — нет связи. */
export async function fetchRemote(path: string, signal?: AbortSignal, bust = false): Promise<string | null> {
  let res: Response;
  try {
    const url = DATA_URL + path + (bust ? `?t=${Date.now()}` : '');
    res = await fetch(url, signal ? { signal } : undefined);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new DataUnavailableError();
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new DataUnavailableError(`HTTP ${res.status}`);
  const text = await res.text();
  // dev-сервер на отсутствующий файл отдаёт index.html — считаем, что файла нет
  return text.startsWith('<') ? null : text;
}

/**
 * Читает файл словаря: скачанный пакет → кэш → сеть (с записью в кэш).
 * null — такого файла нет; DataUnavailableError — нет ни пакета, ни связи.
 */
export async function readFile(path: string): Promise<string | null> {
  const packed = await files.get('pack', path);
  if (packed !== undefined) return packed;
  const cached = await files.get('cache', path);
  if (cached !== undefined) return cached;

  const text = await fetchRemote(path);
  if (text !== null) void files.put('cache', path, text);
  return text;
}
