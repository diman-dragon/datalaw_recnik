import { readFileSync, rmSync } from 'node:fs';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import preact from '@preact/preset-vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/** Словарь живёт на ветке dictionary репозитория и скачивается из приложения — в APK его не кладём. */
const noBundledData = (): Plugin => ({
  name: 'no-bundled-data',
  apply: 'build',
  closeBundle() {
    rmSync(new URL('./dist/data', import.meta.url), { recursive: true, force: true });
  },
});

export default defineConfig({
  plugins: [preact(), noBundledData()],
  // Относительные пути: приложение грузится из https://localhost внутри WebView
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    // шарды данных — тысячи мелких JSON: не считаем размер каждого
    reportCompressedSize: false,
  },
  server: { host: true, port: 5173 },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
