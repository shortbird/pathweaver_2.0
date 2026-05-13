/**
 * useObserverStudents - List of students this observer is linked to.
 *
 * Used by the observer's Activity tab "Students" segment and by the
 * bounty creation kid selector.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '@/src/services/api';

export interface ObserverStudent {
  id: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string | null;
  last_active_at?: string | null;
  pending_count?: number;
}

interface RawObserverLink {
  student_id?: string;
  id?: string;
  student?: {
    id?: string;
    display_name?: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string | null;
    last_active_at?: string | null;
  };
  display_name?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string | null;
  last_active_at?: string | null;
  pending_count?: number;
}

function normalize(link: RawObserverLink): ObserverStudent | null {
  const id = link.student?.id || link.student_id || link.id;
  if (!id) return null;
  const s = link.student || {};
  return {
    id,
    display_name: s.display_name || link.display_name,
    first_name: s.first_name || link.first_name,
    last_name: s.last_name || link.last_name,
    avatar_url: s.avatar_url || link.avatar_url || null,
    last_active_at: s.last_active_at || link.last_active_at || null,
    pending_count: link.pending_count,
  };
}

export function useObserverStudents(enabled: boolean = true) {
  const [students, setStudents] = useState<ObserverStudent[]>([]);
  const [loading, setLoading] = useState(enabled);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const { data } = await api.get('/api/observers/my-students');
      const raw: RawObserverLink[] = data?.students || [];
      const normalized = raw.map(normalize).filter((s): s is ObserverStudent => s !== null);
      setStudents(normalized);
    } catch {
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { students, loading, refetch };
}
