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
import { useRefetchOnForeground } from './useRefetchOnForeground';

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
  /** Hydrated client-side so a multi-child list can say whose absence it is. */
  student_name?: string;
}

export interface AbsenceClass {
  class_id: string;
  name: string;
}

/** One display row: a run of consecutive reported days for one child. */
export interface AbsenceRun extends Absence {
  end_date: string;
  ids: string[];
}

// Timezone-safe day increment for YYYY-MM-DD strings (Date('YYYY-MM-DD') is UTC).
const nextDay = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1, d + 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

/**
 * A range report is stored one row per day; fold consecutive days with the
 * same child, class, and reason back into one display row so a two-week trip
 * is one line with one Cancel, not fourteen.
 */
export const groupAbsenceRuns = (list: Absence[]): AbsenceRun[] => {
  const sorted = [...list].sort((a, b) => (
    (a.student_name || '').localeCompare(b.student_name || '')
    || a.absence_date.localeCompare(b.absence_date)
  ));
  const runs: AbsenceRun[] = [];
  for (const a of sorted) {
    const prev = runs[runs.length - 1];
    if (prev && prev.student_name === a.student_name
        && (prev.class_id || null) === (a.class_id || null)
        && (prev.reason || null) === (a.reason || null)
        && nextDay(prev.end_date) === a.absence_date) {
      prev.end_date = a.absence_date;
      prev.ids.push(a.id);
    } else {
      runs.push({ ...a, end_date: a.absence_date, ids: [a.id] });
    }
  }
  return runs.sort((x, y) => x.absence_date.localeCompare(y.absence_date));
};

/** True when the board holds anything a family can see. */
export const hasCommunityContent = (feed: SchoolFeed | null): boolean => Boolean(
  feed && (['announcements', 'lost_found', 'recognition', 'events', 'carpool'] as const)
    .some((k) => (feed[k] || []).length > 0),
);

/** True when the school page has anything to show — board content OR sent
 *  messages (the unified feed draws on both). */
export const hasSchoolContent = (
  feed: SchoolFeed | null,
  messages: ArchivedMessage[],
): boolean => hasCommunityContent(feed) || messages.length > 0;

// ── The gate ──

// The superadmin preview's org name, resolved once per session from the
// context listing. Module-level so the header button and the sidebar don't
// each pay a fetch; undefined = never fetched, null = fetch in flight/empty.
let previewNameCache: string | null | undefined;
const previewNameListeners = new Set<(name: string | null) => void>();
export const __resetSchoolPreviewCache = () => { previewNameCache = undefined; };

/**
 * The user's school, or null when there is nothing to show.
 *
 * Per-organization: /me attaches `school` for members of ANY org, but the
 * mobile School surface is offered only where the org opted in via
 * feature_flags.sis_settings.school_homepage (`school.homepage` — iCreate
 * first). Superadmins always see it, as the preview (the backend context
 * call lists the opted-in orgs for them, and this hook resolves that org's
 * NAME so no label ever has to say "school" — the org's own name is the
 * word, per iCreate: "we are an education center"). Observers are excluded
 * in v1: the archive endpoint rejects them, and their shell has no school
 * entry point.
 */
export function useSchool() {
  const user = useAuthStore((s) => s.user);
  const isObserver = useIsObserver();
  const isSuperadmin = user?.role === 'superadmin';
  const [previewName, setPreviewName] = useState<string | null>(previewNameCache ?? null);

  useEffect(() => {
    if (!isSuperadmin) return undefined;
    const listener = (name: string | null) => setPreviewName(name);
    previewNameListeners.add(listener);
    if (previewNameCache === undefined) {
      previewNameCache = null;
      api.get('/api/sis/school/context')
        .then(({ data }) => {
          previewNameCache = ((data?.orgs || [])[0]?.organization_name as string) || null;
          previewNameListeners.forEach((l) => l(previewNameCache ?? null));
        })
        .catch(() => { previewNameCache = undefined; /* retry on next mount */ });
    } else {
      setPreviewName(previewNameCache);
    }
    return () => { previewNameListeners.delete(listener); };
  }, [isSuperadmin]);

  if (isObserver) return null;
  if (isSuperadmin) return { id: '', name: previewName, homepage: true };
  const school = user?.school;
  return school?.homepage ? school : null;
}

// ── The hub: school context + community feed + carpool actions ──

/**
 * `markRead` — only the hub screen itself reports read receipts (the feed is
 * on that screen); the carpool screen reuses this hook for the board and must
 * not mark messages nobody looked at.
 */
export function useSchoolHub(opts?: { markRead?: boolean }) {
  const markRead = Boolean(opts?.markRead);
  const [org, setOrg] = useState<SchoolOrg | null>(null);
  const [feed, setFeed] = useState<SchoolFeed | null>(null);
  const [messages, setMessages] = useState<ArchivedMessage[]>([]);
  const [orgName, setOrgName] = useState<string | null>(null);
  // Archive ids already reported as read this mount — read receipts are
  // per-person facts, so nothing is reported from the superadmin preview.
  const markedRef = useRef<Set<string>>(new Set());
  const [canPost, setCanPost] = useState(false);
  const [canModerate, setCanModerate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const school = useAuthStore((s) => s.user?.school);
  // Superadmins preview: they have no membership for the backend to resolve
  // an org from, so every feed read names the org (from the context listing)
  // and renders the parent view — mirroring the web SchoolPage preview.
  const isSuperadmin = useAuthStore((s) => s.user?.role === 'superadmin');
  const feedParamsRef = useRef<Record<string, string> | null>(null);

  const fetchContext = useCallback(async (): Promise<SchoolOrg | null> => {
    try {
      const { data } = await api.get('/api/sis/school/context');
      if (data?.success) {
        const first = (data.orgs || [])[0] || null;
        setOrg(first);
        return first;
      }
    } catch {
      // Not a SIS school, or the lookup is down — the hub degrades to the feed.
    }
    return null;
  }, []);

  const fetchFeed = useCallback(async (params?: Record<string, string> | null) => {
    try {
      const { data } = params
        ? await api.get('/api/sis/community/feed', { params })
        : await api.get('/api/sis/community/feed');
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

  // The most recent sent messages, folded into the unified feed alongside the
  // board. First page only — the archive screen owns search and older pages.
  const fetchMessages = useCallback(async (params?: Record<string, string> | null) => {
    try {
      const { data } = await api.get('/api/announcements/archive', {
        params: { limit: 20, offset: 0, ...(params || {}) },
      });
      if (data?.success) {
        const items: ArchivedMessage[] = data.announcements || [];
        setMessages(items);
        if (data.organization_name) setOrgName(data.organization_name);
        // Read receipts: report what reached this member's screen, once.
        // Never from the superadmin preview (params names a previewed org).
        if (markRead && !params) {
          const ids = items.map((m) => m.id).filter((id) => !markedRef.current.has(id));
          if (ids.length) {
            ids.forEach((id) => markedRef.current.add(id));
            api.post('/api/announcements/mark-read', { announcement_ids: ids.slice(0, 50) })
              .catch(() => { /* receipts are best-effort */ });
          }
        }
      }
    } catch {
      // The board still stands without the archive.
    }
  }, [markRead]);

  const loadAll = useCallback(async () => {
    if (isSuperadmin) {
      // Sequential on purpose: the feed read can't be issued until the
      // context listing has named an org to preview.
      const first = await fetchContext();
      feedParamsRef.current = first
        ? { organization_id: first.organization_id, view_as: 'parent' }
        : null;
      if (first) {
        await Promise.all([
          fetchFeed(feedParamsRef.current),
          fetchMessages(feedParamsRef.current),
        ]);
      }
    } else {
      await Promise.all([fetchContext(), fetchFeed(), fetchMessages()]);
    }
  }, [isSuperadmin, fetchContext, fetchFeed, fetchMessages]);

  useEffect(() => {
    let active = true;
    (async () => {
      await loadAll();
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [loadAll]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);

  const postCarpool = useCallback(async (form: { type: string; message: string; area?: string; days?: string }) => {
    await api.post('/api/sis/community/feed/carpool', form);
    await fetchFeed(feedParamsRef.current);
  }, [fetchFeed]);

  const removeCarpool = useCallback(async (id: string) => {
    await api.delete(`/api/sis/community/feed/carpool/${id}`);
    await fetchFeed(feedParamsRef.current);
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

  useRefetchOnForeground(refresh);

  return {
    org,
    feed,
    messages,
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

export function useSchoolArchive(options?: { organizationId?: string }) {
  // Superadmin preview: the archive resolves the org from membership, which a
  // superadmin lacks — so the preview names it (backend allows the param for
  // superadmins only) and renders the parent view's audience filtering.
  const organizationId = options?.organizationId;
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
        params: {
          limit: ARCHIVE_PAGE_SIZE,
          offset,
          ...(q ? { q } : {}),
          ...(organizationId ? { organization_id: organizationId, view_as: 'parent' } : {}),
        },
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
  }, [organizationId]);

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
  const [studentIds, setStudentIds] = useState<string[]>([]);
  // Per-child data for every child in the org, so toggling a chip never waits
  // on a fetch. {student_id: {absences, classes}}.
  const [byStudent, setByStudent] = useState<Record<string, { absences: Absence[]; classes: AbsenceClass[] }>>({});
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
          if (list[0].students?.length) setStudentIds([list[0].students[0].student_id]);
        }
      })
      .catch(() => { if (active) setError('Could not load absences'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const org = useMemo(() => orgs.find((o) => o.organization_id === orgId), [orgs, orgId]);
  // Memoized: loadAbsences depends on this, and a fresh [] every render would
  // re-run its effect (and setState) in a loop.
  const students: AbsenceStudent[] = useMemo(() => org?.students || [], [org]);

  // Keep the selection valid when the org changes.
  useEffect(() => {
    if (!students.length) return;
    setStudentIds((prev) => {
      const valid = prev.filter((sid) => students.some((s) => s.student_id === sid));
      return valid.length ? valid : [students[0].student_id];
    });
  }, [students]);

  const loadAbsences = useCallback(async () => {
    if (!orgId || !students.length) { setByStudent({}); return; }
    try {
      const entries = await Promise.all(students.map(async (s) => {
        const r = await api.get(`/api/sis/parent/absences?organization_id=${orgId}&student_user_id=${s.student_id}`);
        return [s.student_id, {
          absences: r.data?.absences || [],
          classes: r.data?.classes || [],
        }] as const;
      }));
      setByStudent(Object.fromEntries(entries));
    } catch {
      setError('Could not load absences');
    }
  }, [orgId, students]);

  useEffect(() => { loadAbsences(); }, [loadAbsences]);

  const toggleStudent = useCallback((sid: string) => {
    setStudentIds((prev) => (
      prev.includes(sid) ? prev.filter((id) => id !== sid) : [...prev, sid]
    ));
  }, []);

  // Classes every selected child is enrolled in — a class-specific absence for
  // several children only makes sense when they share the class.
  const classes = useMemo(() => {
    const lists = studentIds.map((sid) => byStudent[sid]?.classes || []);
    if (!lists.length) return [];
    return lists[0].filter((c) => lists.every((l) => l.some((x) => x.class_id === c.class_id)));
  }, [studentIds, byStudent]);

  // Upcoming absences across every selected child, consecutive days folded
  // into one range row, soonest first.
  const absences = useMemo(() => groupAbsenceRuns(
    studentIds.flatMap((sid) => (byStudent[sid]?.absences || []).map((a) => ({
      ...a,
      student_name: students.find((s) => s.student_id === sid)?.name,
    }))),
  ), [studentIds, byStudent, students]);

  const report = useCallback(async (form: {
    absence_date: string; end_date?: string | null; class_id: string | null; reason: string | null;
  }) => {
    const r = await api.post('/api/sis/parent/absences', {
      organization_id: orgId,
      student_user_ids: studentIds,
      absence_date: form.absence_date,
      end_date: form.end_date && form.end_date !== form.absence_date ? form.end_date : null,
      class_id: form.class_id || null,
      reason: form.reason || null,
    });
    await loadAbsences();
    return r.data;
  }, [orgId, studentIds, loadAbsences]);

  // One call for the whole run — a cancelled two-week trip is one office
  // notification, not fourteen.
  const cancel = useCallback(async (ids: string[]) => {
    await api.post('/api/sis/parent/absences/cancel', { absence_ids: ids });
    await loadAbsences();
  }, [loadAbsences]);

  return {
    orgs, orgId, setOrgId,
    students, studentIds, toggleStudent,
    absences, classes,
    orgName: org?.organization_name || null,
    loading, error,
    report, cancel,
  };
}
