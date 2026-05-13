/**
 * useFerpaApprovals - Pending portfolio visibility consent requests for parents.
 *
 * FERPA compliance: parents must approve before minors can make their portfolios
 * publicly visible. This hook surfaces pending requests so the parent can act.
 */

import { useEffect, useState, useCallback } from 'react';
import api from '@/src/services/api';

export interface FerpaApprovalRequest {
  id: string;
  student_id?: string;
  student_name: string;
  requested_at: string;
  /** Optional context about what's being shared */
  context?: string;
}

export function useFerpaApprovals() {
  const [requests, setRequests] = useState<FerpaApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/api/parental-consent/visibility-approval/pending');
      setRequests(data?.pending_requests || []);
    } catch {
      // Soft-fail: a parent without consent endpoints just sees an empty list.
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const respond = useCallback(async (
    requestId: string,
    approved: boolean,
    reason?: string,
  ) => {
    await api.post(`/api/parental-consent/visibility-approval/${requestId}/respond`, {
      approved,
      ...(reason ? { reason } : {}),
    });
    setRequests((prev) => prev.filter((r) => r.id !== requestId));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { requests, loading, refetch, respond, count: requests.length };
}
