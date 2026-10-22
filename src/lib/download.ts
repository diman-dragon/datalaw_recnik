/**
 * Загрузка словаря «в офлайн»: по манифесту скачивает все файлы в пакет на устройстве.
 * Устойчиво к обрывам: уже скачанные файлы пропускаются, ошибки повторяются.
 */

export interface Manifest {
  /** метка сборки (ISO-время) */
  version: string;
  /** суммарный размер, байт */
  total: number;
  files: Array<[path: string, size: number]>;
}

export interface Progress {
  files: number;
  totalFiles: number;
  bytes: number;
  totalBytes: number;
}

export interface DownloadIO {
  fetchText(path: string, signal: AbortSignal): Promise<string>;
  has(path: string): Promise<boolean>;
  put(path: string, text: string): Promise<void>;
}

export interface DownloadOptions {
  concurrency?: number;
  retries?: number;
  retryDelayMs?: number;
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const aborted = () => new DOMException('Aborted', 'AbortError');

export function isManifest(x: unknown): x is Manifest {
  const m = x as Partial<Manifest> | null;
  return (
    !!m &&
    typeof m.version === 'string' &&
    typeof m.total === 'number' &&
    Array.isArray(m.files) &&
    m.files.every((f) => Array.isArray(f) && typeof f[0] === 'string' && typeof f[1] === 'number')
  );
}

/** Скачивает все файлы манифеста. Возвращает число реально загруженных (не пропущенных) файлов. */
export async function runDownload(
  manifest: Manifest,
  io: DownloadIO,
  onProgress: (p: Progress) => void,
  opts: DownloadOptions = {},
): Promise<number> {
  const concurrency = Math.max(1, opts.concurrency ?? 6);
  const retries = opts.retries ?? 2;
  const retryDelay = opts.retryDelayMs ?? 500;
  const outer = opts.signal;

  const ctrl = new AbortController();
  const forward = () => ctrl.abort();
  outer?.addEventListener('abort', forward, { once: true });
  if (outer?.aborted) ctrl.abort();

  const progress: Progress = { files: 0, totalFiles: manifest.files.length, bytes: 0, totalBytes: manifest.total };
  let next = 0;
  let downloaded = 0;
  let failure: unknown = null;
  onProgress({ ...progress });

  async function one(path: string, size: number): Promise<void> {
    if (!(await io.has(path))) {
      let lastError: unknown;
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (ctrl.signal.aborted) throw aborted();
        try {
          const text = await io.fetchText(path, ctrl.signal);
          await io.put(path, text);
          downloaded++;
          lastError = undefined;
          break;
        } catch (e) {
          if (ctrl.signal.aborted) throw aborted();
          lastError = e;
          if (attempt < retries) await sleep(retryDelay * (attempt + 1));
        }
      }
      if (lastError !== undefined) throw lastError;
    }
    progress.files += 1;
    progress.bytes += size;
    onProgress({ ...progress });
  }

  async function worker(): Promise<void> {
    while (failure === null && !ctrl.signal.aborted) {
      const i = next++;
      const item = manifest.files[i];
      if (!item) return;
      try {
        await one(item[0], item[1]);
      } catch (e) {
        failure ??= e;
        ctrl.abort(); // остановить остальных
        return;
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  } finally {
    outer?.removeEventListener('abort', forward);
  }
  if (outer?.aborted) throw aborted();
  if (failure !== null) throw failure;
  return downloaded;
}
