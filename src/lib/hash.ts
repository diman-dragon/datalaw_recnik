/** FNV-1a 32 бит по UTF-8 — обязан совпадать с fnv1a() в scripts/build_data.py. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function shardOf(key: string, count: number): number {
  return fnv1a(key) % count;
}

export const SHARDS = { e: 256, r: 128, s: 128 } as const;

export const shardName = (index: number): string => String(index).padStart(3, '0');
