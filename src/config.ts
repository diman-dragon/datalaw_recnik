/**
 * Откуда приложение берёт словарь, когда он не скачан на устройство.
 * Файлы публикует workflow `Android` (job `data`) в ветку `dictionary` публичного репозитория.
 * Переопределение при сборке: VITE_DATA_URL=https://…/data/
 */
const DEFAULT_DATA_URL = 'https://raw.githubusercontent.com/diman-dragon/datalaw_recnik/dictionary/';

const env = import.meta.env as Record<string, string | undefined> | undefined;

const raw = env?.['VITE_DATA_URL'] || DEFAULT_DATA_URL;

export const DATA_URL: string = raw.endsWith('/') ? raw : `${raw}/`;
