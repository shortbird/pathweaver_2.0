/**
 * The family photo across the top of the Family tab
 * (/api/parent/family-cover). One per parent account; the API signs the
 * stored pointer on read, so `url` is ready to render.
 */

import { useCallback, useEffect, useState } from 'react';
import { familyCoverAPI, type PickedFile } from '../services/api';
import { useAuthStore } from '../stores/authStore';

export function useFamilyCover() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    try {
      const { data } = await familyCoverAPI.get();
      setUrl(data?.family_cover_url || null);
    } catch {
      setUrl(null);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { refetch(); }, [refetch]);

  const upload = useCallback(async (file: PickedFile) => {
    setBusy(true);
    try {
      const body = await familyCoverAPI.upload(file);
      setUrl(body?.family_cover_url || null);
    } finally {
      setBusy(false);
    }
  }, []);

  const remove = useCallback(async () => {
    setBusy(true);
    try {
      await familyCoverAPI.remove();
      setUrl(null);
    } finally {
      setBusy(false);
    }
  }, []);

  return { url, loading, busy, upload, remove, refetch };
}
