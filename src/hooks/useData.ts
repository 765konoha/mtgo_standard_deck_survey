import { useState, useEffect, useCallback } from 'react';
import type { CardSearchIndex, IndexData, Event, EventSummary } from '../types';

const DATA_BASE_PATH = './data';

export function useCardSearchIndex() {
  const [index, setIndex] = useState<CardSearchIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    fetch(`${DATA_BASE_PATH}/card-search-index.json`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res.json();
      })
      .then((json: CardSearchIndex) => {
        if (!json || !Array.isArray(json.cards)) {
          throw new Error('検索インデックスの形式が不正です');
        }
        if (mounted) setIndex(json);
      })
      .catch((err) => {
        // The deck list must keep working even if search data fails to load,
        // so we surface the error to disable search only, not the whole page.
        if (mounted) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return { index, loading, error };
}

export function useIndexData() {
  const [data, setData] = useState<IndexData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refetchKey, setRefetchKey] = useState(0);

  const refetch = useCallback(() => {
    setRefetchKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    fetch(`${DATA_BASE_PATH}/index.json`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res.json();
      })
      .then((json: IndexData) => {
        if (mounted) {
          setData(json);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [refetchKey]);

  return { data, loading, error, refetch };
}

export function useEventData(eventSummary: EventSummary | null) {
  const [data, setData] = useState<Event | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!eventSummary || eventSummary.status !== 'completed') {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let mounted = true;
    setLoading(true);
    setError(null);

    const dataFile = eventSummary.dataFile.startsWith('./')
      ? eventSummary.dataFile
      : `./${eventSummary.dataFile}`;

    fetch(`${DATA_BASE_PATH}/${dataFile.replace('./', '')}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res.json();
      })
      .then((json: Event) => {
        if (mounted) {
          setData(json);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [eventSummary]);

  return { data, loading, error };
}

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T) => {
      try {
        setStoredValue(value);
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.error(`Error saving to localStorage key "${key}":`, error);
      }
    },
    [key]
  );

  return [storedValue, setValue];
}
