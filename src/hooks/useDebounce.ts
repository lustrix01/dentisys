import { useRef, useEffect, useState } from 'react';

/**
 * Returns a debounced value that updates after the specified delay.
 * @param value The input value to debounce.
 * @param delay Delay in milliseconds.
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debounced, setDebounced] = useState<T>(value);
  const handler = useRef<number | null>(null);

  useEffect(() => {
    if (handler) clearTimeout(handler);
    handler = window.setTimeout(() => setDebounced(value), delay);
    return () => {
      if (handler) clearTimeout(handler);
    };
  }, [value, delay]);

  return debounced;
}
