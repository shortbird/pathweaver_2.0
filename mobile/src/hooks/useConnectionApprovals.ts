/**
 * Peer connections, the approver's side (/api/connections/approvals).
 *
 * The endpoint answers with the rows that name the CALLER as approver:
 * `pending` (a child of theirs wants to connect and is waiting on their yes)
 * and `approved` (connections they said yes to, which they may end at any
 * time). Until 2026-09-15 the app had no surface for this at all -- the web
 * had a page of its own, and a parent on the phone got an email pointing at
 * it. Each request renders on the card of the child it is about
 * (components/family/ChildConnections), the way the web dashboard does it.
 *
 * Read once at the Family tab and handed down, so ten children do not make
 * ten reads of the same list.
 */

import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useRefetchOnForeground } from './useRefetchOnForeground';

export interface ConnectionParty {
  id: string;
  display_name: string;
}

export interface PendingConnection {
  id: string;
  connection_id: string;
  child: ConnectionParty;
  peer: ConnectionParty;
  approver_kind?: 'parent' | 'org_admin';
  requested_at?: string;
}

export interface ApprovedConnection {
  connection_id: string;
  child: ConnectionParty;
  peer: ConnectionParty;
  approved_at?: string;
}

export interface ConnectionApprovals {
  pending: PendingConnection[];
  approved: ApprovedConnection[];
}

const EMPTY: ConnectionApprovals = { pending: [], approved: [] };

export function useConnectionApprovals() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [data, setData] = useState<ConnectionApprovals>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    try {
      const res = await api.get('/api/connections/approvals');
      const d = res.data?.data || res.data || {};
      setData({ pending: d.pending || [], approved: d.approved || [] });
    } catch {
      setData(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { refetch(); }, [refetch]);
  useRefetchOnForeground(refetch);

  /** Approve (true) or decline (false) one pending connection. */
  const decide = useCallback(async (connectionId: string, approve: boolean) => {
    setBusy(true);
    try {
      await api.post(`/api/connections/${connectionId}/approve`, { approve });
      await refetch();
    } finally {
      setBusy(false);
    }
  }, [refetch]);

  /** End a connection the caller approved. Either side's approver may. */
  const revoke = useCallback(async (connectionId: string) => {
    setBusy(true);
    try {
      await api.post(`/api/connections/${connectionId}/revoke`, {});
      await refetch();
    } finally {
      setBusy(false);
    }
  }, [refetch]);

  return { data, loading, busy, refetch, decide, revoke };
}

/** The rows about one child, for that child's card. */
export function forChild(data: ConnectionApprovals | null | undefined, childId: string): ConnectionApprovals {
  return {
    pending: (data?.pending || []).filter((r) => r.child?.id === childId),
    approved: (data?.approved || []).filter((r) => r.child?.id === childId),
  };
}
