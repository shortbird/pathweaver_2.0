/**
 * A child's Friends policy, the parent's side
 * (/api/connections/children/<id>/policy).
 *
 * The consent is the flip to enabled=true, logged to the parent by name on
 * the server. Everything else here is the boundaries: ask-me-first, who may
 * send the child a request, whether friends may comment. Turning it off
 * revokes every live friendship, and `friendsCount` is the number the
 * confirm names before it does.
 */

import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

export interface FriendPolicy {
  student_id: string;
  enabled: boolean;
  approval_mode: 'auto' | 'ask_first';
  request_sources: string[];
  friends_can: string[];
  origin: 'child' | 'org' | 'none' | 'module_off';
  reason: string | null;
  who_can_enable: 'parent' | 'org_admin' | 'self' | 'nobody' | null;
}

export interface PolicyPatch {
  enabled?: boolean;
  approval_mode?: 'auto' | 'ask_first';
  request_sources?: string[];
  friends_can?: string[];
}

export const REQUEST_SOURCES: { key: string; label: string; help: string }[] = [
  { key: 'classmates', label: 'Classmates', help: 'Students in the same class' },
  { key: 'code', label: 'A code shown in person', help: 'An 8-letter code that expires in a week' },
  { key: 'link', label: 'An invite link', help: 'The same code, shared as a link' },
  { key: 'school', label: 'Anyone at their school', help: 'Only if the school has turned this on' },
];

/** The body of a success_response envelope ({data: {data}}), or a bare body. */
function unwrap<T>(res: { data?: { data?: unknown } | unknown }): T {
  const body = res?.data as { data?: unknown } | undefined;
  return ((body && typeof body === 'object' && 'data' in body ? body.data : body) ?? {}) as T;
}

export function useFriendPolicy(childId: string | null | undefined) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [policy, setPolicy] = useState<FriendPolicy | null>(null);
  const [canSet, setCanSet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refetch = useCallback(async () => {
    if (!isAuthenticated || !childId) { setLoading(false); return; }
    try {
      const res = await api.get(`/api/connections/children/${childId}/policy`);
      const d = unwrap<{ policy?: FriendPolicy; can_set?: boolean }>(res);
      setPolicy(d.policy || null);
      setCanSet(!!d.can_set);
    } catch {
      setPolicy(null);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, childId]);

  useEffect(() => { refetch(); }, [refetch]);

  /** Write a change. Resolves to the number of friendships revoked (0 unless
   *  Friends was just turned off). */
  const save = useCallback(async (patch: PolicyPatch): Promise<number> => {
    if (!childId) return 0;
    setSaving(true);
    try {
      const res = await api.put(`/api/connections/children/${childId}/policy`, patch);
      const d = unwrap<{ policy?: FriendPolicy; revoked_count?: number }>(res);
      if (d.policy) setPolicy(d.policy);
      return d.revoked_count || 0;
    } finally {
      setSaving(false);
    }
  }, [childId]);

  /** How many friends the child has right now, for the off confirm. */
  const friendsCount = useCallback(async (): Promise<number> => {
    if (!childId) return 0;
    try {
      const res = await api.get(`/api/connections/children/${childId}/friends-count`);
      return unwrap<{ active?: number }>(res).active || 0;
    } catch {
      return 0;
    }
  }, [childId]);

  return { policy, canSet, loading, saving, refetch, save, friendsCount };
}
