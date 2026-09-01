/**
 * A member's class schedule — when their classes meet and which room.
 *
 * iCreate asked for this during family orientation (2026-08-18): the times and
 * rooms were in the SIS all along, but nothing on mobile ever showed them, so
 * families arrived not knowing where to go.
 *
 * Two audiences, two endpoints, deliberately:
 *
 *   student   /api/student/classes — their own enrollments. Carries `meetings`
 *             since class_service._attach_schedule. NOTE the prefix: the
 *             blueprint mounts at /api/student, not /api/classes. This was
 *             shipped as /api/classes/student/classes and 404'd for every
 *             student until the client-path test caught it.
 *   guardian  /api/sis/parent/students/<id>/schedule — one call per child.
 *             This route already returned meetings (it backs the web schedule
 *             builder), so a guardian's schedule needs no backend change.
 *
 * Anyone who is neither gets an empty list rather than a failed request.
 */
import { useState, useEffect, useCallback } from 'react';
import api from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';
import { useMyChildren } from './useParent';

export interface ClassMeeting {
  day_of_week: number | null;
  specific_date?: string | null;
  start_time: string | null;
  end_time: string | null;
  location?: string | null;
}

export interface ScheduledClass {
  id: string;
  name: string;
  location?: string | null;
  meetings: ClassMeeting[];
  teacher_name?: string | null;
}

/**
 * The school's add/drop window for this child, as the read-only schedule sees
 * it. `open` is computed server-side in the ORG's timezone — a Sept 8 deadline
 * has to survive the evening of Sept 8 in Utah, not end at 6pm when a UTC box
 * rolls over.
 */
export interface AddDropInfo {
  open: boolean;
  deadline: string | null;
  /** The family already has an unresolved request in for this child. */
  pending: boolean;
}

export interface StudentSchedule {
  student_id: string;
  student_name: string;
  classes: ScheduledClass[];
  organization_id?: string | null;
  add_drop?: AddDropInfo;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Monday" for the stored 0=Sun..6=Sat, or null for a one-off dated meeting. */
export function dayName(dow: number | null | undefined): string | null {
  return dow === null || dow === undefined ? null : DAYS[dow] ?? null;
}

/** "9:00 AM" from the stored "09:00". Left as-is if it isn't HH:MM. */
export function formatTime(t: string | null | undefined): string {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = Number(h);
  if (Number.isNaN(hour)) return t;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m ?? '00'} ${suffix}`;
}

/** "9:00 AM – 10:30 AM", or just the start when no end is recorded. */
export function meetingTime(m: ClassMeeting): string {
  const start = formatTime(m.start_time);
  const end = formatTime(m.end_time);
  if (start && end) return `${start} – ${end}`;
  return start || end || '';
}

function normalizeClass(raw: any): ScheduledClass {
  const instructor = raw.primary_instructor;
  return {
    id: raw.id,
    name: raw.name || 'Class',
    location: raw.location ?? null,
    meetings: Array.isArray(raw.meetings) ? raw.meetings : [],
    teacher_name:
      raw.teacher_name
      || instructor?.name
      || [instructor?.first_name, instructor?.last_name].filter(Boolean).join(' ')
      || null,
  };
}

export interface ScheduleDay {
  key: string;
  label: string;
  rows: { cls: ScheduledClass; meeting: ClassMeeting | null }[];
}

/** Monday-first, Sunday last — the order a school week reads in. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * The same classes regrouped BY DAY, each day in time order.
 *
 * The class-by-class list this sits beside answers "when does Pottery meet?";
 * families ask the inverse — "where is she at 10:30 on Tuesday?" — and were
 * having to read every card and re-sort in their heads (iCreate parent,
 * 2026-08-25: "super clunky... at least separated by days and ideally in
 * schedule order").
 *
 * Mirrors the web helper in components/schedule/WeeklySchedule.jsx so the two
 * platforms group and order a schedule identically. Dated one-offs group by
 * their date rather than by weekday, so a single Saturday trip does not read as
 * "every Saturday"; classes with no usable meeting land in a trailing group
 * instead of disappearing.
 */
export function meetingsByDay(classes: ScheduledClass[] = []): ScheduleDay[] {
  const groups = new Map<string, ScheduleDay & { order: number; sub: string }>();
  const unscheduled: ScheduleDay['rows'] = [];

  const toMin = (t?: string | null): number | null => {
    if (!t) return null;
    const [h, m] = String(t).split(':').map(Number);
    return Number.isNaN(h) ? null : h * 60 + (m || 0);
  };

  for (const cls of classes) {
    let placed = false;
    for (const m of cls.meetings || []) {
      const hasDay = m.day_of_week !== null && m.day_of_week !== undefined && !!dayName(m.day_of_week);
      if (!hasDay && !m.specific_date) continue;
      const key = hasDay ? `d${m.day_of_week}` : `x${m.specific_date}`;
      const label = (hasDay ? dayName(m.day_of_week) : m.specific_date) || '';
      const order = hasDay ? DAY_ORDER.indexOf(m.day_of_week as number) : 100;
      if (!groups.has(key)) groups.set(key, { key, label, order, sub: m.specific_date || '', rows: [] });
      groups.get(key)!.rows.push({ cls, meeting: m });
      placed = true;
    }
    if (!placed) unscheduled.push({ cls, meeting: null });
  }

  const ordered = [...groups.values()].sort(
    (a, b) => (a.order - b.order) || a.sub.localeCompare(b.sub));

  for (const g of ordered) {
    // A meeting with no start time sinks within its day rather than sorting as
    // midnight and heading the list.
    g.rows.sort((a, b) => {
      const sa = toMin(a.meeting?.start_time);
      const sb = toMin(b.meeting?.start_time);
      if (sa == null || sb == null) return sa == null ? 1 : -1;
      return sa - sb || (a.cls.name || '').localeCompare(b.cls.name || '');
    });
  }

  if (unscheduled.length) {
    unscheduled.sort((a, b) => (a.cls.name || '').localeCompare(b.cls.name || ''));
    ordered.push({ key: 'unscheduled', label: 'Not scheduled yet', order: 999, sub: '', rows: unscheduled });
  }
  return ordered.map(({ key, label, rows }) => ({ key, label, rows }));
}

/** Classes with at least one meeting sort first — a class with no times
 *  recorded is real, but it isn't what somebody opened a schedule to find. */
function bySchedulePresence(a: ScheduledClass, b: ScheduledClass) {
  if (!a.meetings.length !== !b.meetings.length) return a.meetings.length ? -1 : 1;
  return (a.name || '').localeCompare(b.name || '');
}

export function useClassSchedule(organizationId?: string | null) {
  const user = useAuthStore((s) => s.user);
  const { children, loading: childrenLoading } = useMyChildren();
  const [schedules, setSchedules] = useState<StudentSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  const role = (user as any)?.org_role || (user as any)?.role;
  const isStudent = role === 'student';
  const orgId = organizationId || (user as any)?.organization_id;

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      if (isStudent) {
        const { data } = await api.get('/api/student/classes');
        setSchedules([{
          student_id: (user as any).id,
          student_name: 'My schedule',
          classes: (data?.classes || []).map(normalizeClass).sort(bySchedulePresence),
        }]);
        return;
      }

      if (!children.length || !orgId) { setSchedules([]); return; }
      // Add/drop requests the family already has open, one call for the whole
      // family rather than one per child. Best-effort: a school with no
      // add/drop window still gets its schedule.
      const pendingByStudent = new Set<string>();
      try {
        const { data } = await api.get('/api/sis/parent/forms',
          { params: { organization_id: orgId } });
        for (const f of data?.submissions || []) {
          if (f.form_type === 'schedule_change' && f.status !== 'resolved' && f.student_user_id) {
            pendingByStudent.add(f.student_user_id);
          }
        }
      } catch {
        /* the request button still works without this */
      }
      // One request per child, and one slow child must not blank the rest.
      const results = await Promise.all(children.map(async (kid: any) => {
        try {
          const { data } = await api.get(
            `/api/sis/parent/students/${kid.id}/schedule`,
            { params: { organization_id: orgId } },
          );
          return {
            student_id: kid.id,
            student_name: kid.display_name || kid.first_name || 'Student',
            classes: (data?.classes || []).map(normalizeClass).sort(bySchedulePresence),
            organization_id: orgId,
            add_drop: {
              open: !!data?.add_drop_open,
              deadline: data?.add_drop_deadline || null,
              pending: pendingByStudent.has(kid.id),
            },
          };
        } catch {
          return null;
        }
      }));
      setSchedules(results.filter(Boolean) as StudentSchedule[]);
    } catch {
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, [user, isStudent, orgId, children]);

  useEffect(() => {
    if (!isStudent && childrenLoading) return;
    load();
  }, [load, isStudent, childrenLoading]);

  const hasAny = schedules.some((s) => s.classes.length > 0);
  return { schedules, loading: loading || (!isStudent && childrenLoading), hasAny, refresh: load };
}
