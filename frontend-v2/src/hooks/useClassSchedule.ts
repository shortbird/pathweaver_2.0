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

export interface StudentSchedule {
  student_id: string;
  student_name: string;
  classes: ScheduledClass[];
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
