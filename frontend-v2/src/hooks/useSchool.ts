/**
 * School hooks — everything the mobile School surface reads and writes.
 *
 * The School page is per-organization: /api/auth/me attaches `user.school`
 * for members of a SIS school (see authStore.User.school), and every screen
 * here is offered only when that is set. Data comes from the same endpoints
 * the web /school hub uses; all of them accept Bearer auth.
 *
 * Bespoke useState hooks, matching useFeed/useNotifications — react-query is
 * not wired up in this app.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';
import { useIsObserver } from '@/src/hooks/useStartSomething';

// ── Types (server shapes, family-safe projections) ──

export interface SchoolOrg {
  organization_id: string;
  organization_name: string | null;
  is_guardian: boolean;
  post_registration_flow: 'goals' | 'schedule';
  logo_url: string | null;
}

export interface SchoolAnnouncement {
  id: string;
  title: string;
  body: string | null;
  pinned: boolean;
  priority: string;
  created_at: string;
}

export interface SchoolEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string | null;
  end_at: string | null;
  all_day: boolean;
  category?: string | null;
  categories?: string[] | null;
}

export interface LostFoundItem {
  id: string;
  description: string;
  image_url: string | null;
  category: string | null;
  date_found: string | null;
  location_found: string | null;
  created_at: string;
  days_until_donation?: number | null;
}

export interface RecognitionItem {
  id: string;
  type: string;
  recipient_name: string | null;
  message: string | null;
  created_at: string;
}

export interface CarpoolPost {
  id: string;
  type: 'offer' | 'need';
  message: string;
  area: string | null;
  days: string | null;
  author_name: string | null;
  created_at: string;
  mine?: boolean;
}

export interface SchoolFeed {
  announcements: SchoolAnnouncement[];
  events: SchoolEvent[];
  lost_found: LostFoundItem[];
  recognition: RecognitionItem[];
  carpool: CarpoolPost[];
}

export interface ArchivedMessage {
  id: string;
  title: string;
  message?: string;
  content?: string;
  created_at: string;
}

export interface AbsenceStudent {
  student_id: string;
  name: string;
}

export interface Absence {
  id: string;
  absence_date: string;
  class_id: string | null;
  class_name?: string | null;
  reason: string | null;
}

export interface AbsenceClass {
  class_id: string;
  name: string;
}

/** True when the board holds anything a family can see. */
export const hasCommunityContent = (feed: SchoolFeed | null): boolean => Boolean(
  feed && (['announcements', 'lost_found', 'recognition', 'events', 'carpool'] as const)
    .some((k) => (feed[k] || []).length > 0),
);

// ── The gate ──

/**
 * The user's school, or null when there is nothing to show. Observers are
 * excluded in v1: the archive endpoint rejects them, and their shell has no
 * school entry point.
 */
export function useSchool() {
  const user = useAuthStore((s) => s.user);
  const isObserver = useIsObserver();
  if (isObserver) return null;
  return user?.school ?? null;
}

// ── The hub: school context + community feed + carpool actions ──

export function useSchoolHub() {
  const [org, setOrg] = useState<SchoolOrg | null>(null);
  const [feed, setFeed] = useState<SchoolFeed | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [canPost, setCanPost] = useState(false);
  const [canModerate, setCanModerate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const school = useAuthStore((s) => s.user?.school);

  const fetchContext = useCallback(async () => {
    try {
      const { data } = await api.get('/api/sis/school/context');
      if (data?.success) setOrg((data.orgs || [])[0] || null);
    } catch {
      // Not a SIS school, or the lookup is down — the hub degrades to the feed.
    }
  }, []);

  const fetchFeed = useCallback(async () => {
    try {
      const { data } = await api.get('/api/sis/community/feed');
      if (data?.success) {
        setFeed(data.feed || null);
        setCanPost(Boolean(data.can_post_carpool));
        setCanModerate(Boolean(data.can_moderate));
        if (data.organization_name) setOrgName(data.organization_name);
      }
    } catch {
      // No board for this user; sections simply don't render.
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      await Promise.all([fetchContext(), fetchFeed()]);
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [fetchContext, fetchFeed]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchContext(), fetchFeed()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchContext, fetchFeed]);

  const postCarpool = useCallback(async (form: { type: string; message: string; area?: string; days?: string }) => {
    await api.post('/api/sis/community/feed/carpool', form);
    await fetchFeed();
  }, [fetchFeed]);

  const removeCarpool = useCallback(async (id: string) => {
    await api.delete(`/api/sis/community/feed/carpool/${id}`);
    await fetchFeed();
  }, [fetchFeed]);

  const messageCarpool = useCallback(async (id: string, message: string) => {
    await api.post(`/api/sis/community/feed/carpool/${id}/message`, { message });
  }, []);

  const carpool = useMemo(() => ({
    posts: feed?.carpool || [],
    canPost,
    canModerate,
    post: postCarpool,
    remove: removeCarpool,
    message: messageCarpool,
  }), [feed?.carpool, canPost, canModerate, postCarpool, removeCarpool, messageCarpool]);

  return {
    org,
    feed,
    carpool,
    loading,
    refreshing,
    refresh,
    schoolName: school?.name || org?.organization_name || orgName,
    isGuardian: Boolean(org?.is_guardian),
  };
}

// ── The message archive: offset pagination + search ──

const ARCHIVE_PAGE_SIZE = 20;

export function useSchoolArchive() {
  const [announcements, setAnnouncements] = useState<ArchivedMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // Guards a stale page-1 response landing after the query changed.
  const requestRef = useRef(0);

  const fetchPage = useCallback(async (offset: number, q: string, append: boolean) => {
    const requestId = ++requestRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/announcements/archive', {
        params: { limit: ARCHIVE_PAGE_SIZE, offset, ...(q ? { q } : {}) },
      });
      if (requestId !== requestRef.current) return;
      if (data?.success) {
        setAnnouncements((prev) => (append ? [...prev, ...(data.announcements || [])] : (data.announcements || [])));
        setTotal(data.total || 0);
        if (data.organization_name) setOrgName(data.organization_name);
      } else {
        setError(data?.error || 'Could not load messages');
      }
    } catch (e: any) {
      if (requestId !== requestRef.current) return;
      setError(e?.response?.data?.error || 'Could not load messages');
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchPage(0, query.trim(), false);
  }, [query, fetchPage]);

  const hasMore = announcements.length < total;

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    await fetchPage(announcements.length, query.trim(), true);
  }, [loading, loadingMore, hasMore, announcements.length, query, fetchPage]);

  const refresh = useCallback(async () => {
    await fetchPage(0, query.trim(), false);
  }, [query, fetchPage]);

  return { announcements, total, hasMore, loading, loadingMore, error, query, setQuery, loadMore, refresh, orgName };
}

// ── Absences: guardian context + report/cancel ──

export function useSchoolAbsences() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [orgId, setOrgId] = useState<string>('');
  const [studentId, setStudentId] = useState<string>('');
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [classes, setClasses] = useState<AbsenceClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.get('/api/sis/parent/context')
      .then((r) => {
        if (!active) return;
        const list = r.data?.orgs || [];
        setOrgs(list);
        if (list.length) {
          setOrgId(list[0].organization_id);
          if (list[0].students?.length) setStudentId(list[0].students[0].student_id);
        }
      })
      .catch(() => { if (active) setError('Could not load absences'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const org = useMemo(() => orgs.find((o) => o.organization_id === orgId), [orgs, orgId]);
  const students: AbsenceStudent[] = org?.students || [];

  const loadAbsences = useCallback(async () => {
    if (!orgId || !studentId) { setAbsences([]); setClasses([]); return; }
    try {
      const r = await api.get(`/api/sis/parent/absences?organization_id=${orgId}&student_user_id=${studentId}`);
      setAbsences(r.data?.absences || []);
      setClasses(r.data?.classes || []);
    } catch {
      setError('Could not load absences');
    }
  }, [orgId, studentId]);

  useEffect(() => { loadAbsences(); }, [loadAbsences]);

  const report = useCallback(async (form: { absence_date: string; class_id: string | null; reason: string | null }) => {
    await api.post('/api/sis/parent/absences', {
      organization_id: orgId,
      student_user_id: studentId,
      absence_date: form.absence_date,
      class_id: form.class_id || null,
      reason: form.reason || null,
    });
    await loadAbsences();
  }, [orgId, studentId, loadAbsences]);

  const cancel = useCallback(async (id: string) => {
    await api.delete(`/api/sis/parent/absences/${id}`);
    await loadAbsences();
  }, [loadAbsences]);

  return {
    orgs, orgId, setOrgId,
    students, studentId, setStudentId,
    absences, classes,
    orgName: org?.organization_name || null,
    loading, error,
    report, cancel,
  };
}
