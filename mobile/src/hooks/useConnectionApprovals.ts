/**
 * Peer connections, the approver's side (/api/connections/approvals).
 *
 * The endpoint answers with the rows that name the CALLER as approver:
 * `pending` (a child of theirs wants to connect and is waiting on their yes)
 * and `approved` (connections they said yes to, which they may end at any
 * time). Until 2026-09-15 the app had no surface for this at all -- the web
 * had a page of its own, and a parent on the phone got an email pointing at
 * it. The Family tab reads this once for the count on each child's card;
 * the child's Friends screen (parent/friends/<id>) renders the requests in
 * full (components/family/ChildConnections) and answers them.
 *
 * Ending a friendship is the Friends list's Remove (hooks/useFriends
 * .revoke, in student scope); the approver-side revoke this hook carried
 * was the same call from a second surface and went with the card list.
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

  return { data, loading, busy, refetch, decide };
}

/** The rows about one child, for that child's card. */
export function forChild(data: ConnectionApprovals | null | undefined, childId: string): ConnectionApprovals {
  return {
    pending: (data?.pending || []).filter((r) => r.child?.id === childId),
    approved: (data?.approved || []).filter((r) => r.child?.id === childId),
  };
}
