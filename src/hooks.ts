import { useEffect, useRef, useState } from 'preact/hooks';

export interface Resource<T> {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: T | undefined;
  error: unknown;
  reload: () => void;
}

interface State<T> {
  key: string | null;
  status: Resource<T>['status'];
  data?: T;
  error?: unknown;
}

/** Результаты за сессию: возврат на экран не повторяет чтение данных. */
const memo = new Map<string, unknown>();
const MEMO_LIMIT = 300;

function remember(key: string, value: unknown) {
  if (memo.size >= MEMO_LIMIT) {
    const oldest = memo.keys().next().value;
    if (oldest !== undefined) memo.delete(oldest);
  }
  memo.set(key, value);
}

/**
 * Асинхронная загрузка по ключу с сессионным мемо.
 * key = null — ничего не грузим (ленивые вкладки).
 */
export function useResource<T>(key: string | null, loader: () => Promise<T>): Resource<T> {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<State<T>>({ key: null, status: 'idle' });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    if (key === null) {
      setState({ key, status: 'idle' });
      return;
    }
    if (tick === 0 && memo.has(key)) {
      setState({ key, status: 'ready', data: memo.get(key) as T });
      return;
    }
    let cancelled = false;
    setState({ key, status: 'loading' });
    loaderRef.current().then(
      (data) => {
        remember(key, data);
        if (!cancelled) setState({ key, status: 'ready', data });
      },
      (error: unknown) => {
        if (!cancelled) setState({ key, status: 'error', error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, tick]);

  const reload = () => {
    if (key !== null) memo.delete(key);
    setTick((n) => n + 1);
  };
  const current = state.key === key;
  // Кадр до эффекта: если результат уже в мемо — показываем сразу, без вспышки скелетона
  if (key !== null && !current && tick === 0 && memo.has(key)) {
    return { status: 'ready', data: memo.get(key) as T, error: undefined, reload };
  }
  return {
    status: key === null ? 'idle' : current ? state.status : 'loading',
    data: current ? state.data : undefined,
    error: current ? state.error : undefined,
    reload,
  };
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
