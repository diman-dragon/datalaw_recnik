#!/usr/bin/env node
// Увеличивает последний знак версии: 0.0.1 → 0.0.2. Запуск: npm run bump
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(file, 'utf8'));
const parts = pkg.version.split('.').map(Number);
if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n))) {
  throw new Error(`Неожиданный формат версии: ${pkg.version}`);
}
parts[2] += 1;
const next = parts.join('.');
writeFileSync(file, `${JSON.stringify({ ...pkg, version: next }, null, 2)}\n`);
console.log(`${pkg.version} → ${next}`);
