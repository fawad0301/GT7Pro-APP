import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Loads data from the native engine, refreshes when the app returns to the foreground and on an
 * interval while visible. Errors are surfaced, never thrown into render.
 */
export function useCoachData<T>(load: () => Promise<T>, deps: unknown[] = [], intervalMs = 30000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') refresh();
    });
    const id = intervalMs > 0 ? setInterval(refresh, intervalMs) : undefined;
    return () => {
      sub.remove();
      if (id) clearInterval(id);
    };
  }, [refresh, intervalMs]);

  return { data, error, refresh };
}
