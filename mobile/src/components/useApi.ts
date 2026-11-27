import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { api, errorMessage } from '../api/client';

/** Tải dữ liệu từ API; tự tải lại mỗi khi màn hình được mở lại */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(path));
  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setError('');
      setData(await api<T>(path));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  return { data, setData, error, loading, reload };
}
