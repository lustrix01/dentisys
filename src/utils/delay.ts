// src/utils/delay.ts
export function delay<T>(result: T, minMs = 300, maxMs = 800): Promise<T> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise<T>((resolve) => setTimeout(() => resolve(result), ms));
}
