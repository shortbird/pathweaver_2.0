/**
 * The school's document library, as a family sees it.
 *
 * The iCreate orientation quest tells families to "check the Family Guide,
 * Behavior Agreement and other docs found in the Resources section" — and the
 * mobile app had no such section, so that task had nowhere to go on a phone
 * (2026-08-18).
 *
 * `GET /api/sis/parent/resources` already existed for the web SIS: it filters
 * to audience families/all (staff knowledge-base entries never reach a family)
 * and signs the private `org-documents` bucket in one batched call, so a `url`
 * here is ready to open and nothing needs storage logic on the client.
 */
import { useState, useEffect, useCallback } from 'react';
import api from '@/src/services/api';

export interface SchoolResource {
  id: string;
  title: string;
  description?: string | null;
  url?: string | null;
  category?: string | null;
  sort_order?: number | null;
}

/** Documents grouped under their category heading, in the order the school
 *  set. Uncategorised entries collect under a final untitled group rather
 *  than inventing a name for them. */
export function groupByCategory(rows: SchoolResource[]) {
  const groups: { category: string | null; items: SchoolResource[] }[] = [];
  for (const r of rows) {
    const key = r.category || null;
    const existing = groups.find((g) => g.category === key);
    if (existing) existing.items.push(r);
    else groups.push({ category: key, items: [r] });
  }
  // Uncategorised last; everything else keeps the server's ordering.
  return groups.sort((a, b) => (a.category === null ? 1 : 0) - (b.category === null ? 1 : 0));
}

export function useSchoolResources(organizationId?: string | null) {
  const [resources, setResources] = useState<SchoolResource[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!organizationId) { setResources([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/api/sis/parent/resources', {
        params: { organization_id: organizationId },
      });
      setResources(data?.resources || []);
    } catch {
      // A missing document library must not cost the rest of the school page.
      setResources([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  return { resources, loading, refresh: load };
}
