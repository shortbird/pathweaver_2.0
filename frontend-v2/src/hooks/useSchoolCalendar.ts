/**
 * The school's calendar, a month at a time.
 *
 * iCreate, 2026-09-04 (e223b6db): "Can we get the calendar to show up on the
 * app?" The hub showed the next three dates and said the full calendar lived on
 * the web, which is no answer for a parent standing in a car park.
 *
 * Same endpoint the web family calendar reads (/api/sis/parent/events), windowed
 * to the month on screen — a school's calendar is populated years out (iCreate's
 * runs to April 2027) and fetching all of it to show one month would be most of
 * a megabyte for nothing.
 */

import { useCallback, useEffect, useState } from 'react';
import api from '@/src/services/api';
import type { SchoolEvent } from './useSchool';

/** '2026-09' -> the ISO first day of that month and of the next one. */
export const monthWindow = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const next = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
  return { from: `${month}-01`, to: `${next}-01` };
};

export const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Step a 'YYYY-MM' string by whole months, without Date's day-overflow. */
export const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};

/** The local calendar date an event sits on.
 *
 * An all-day event is stored date-only, as 00:00 UTC: it names a date, not an
 * instant, so it is read back in UTC. Converted to local time it becomes the
 * previous evening anywhere west of Greenwich — which is how "NO CLASS - LABOR
 * DAY" once showed up on the Sunday.
 */
export const eventDay = (e: SchoolEvent): string => {
  if (!e.start_at) return '';
  const d = new Date(e.start_at);
  if (Number.isNaN(d.getTime())) return '';
  if (e.all_day) return d.toISOString().slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export interface CalendarDay {
  date: string;
  events: SchoolEvent[];
}

/** Events grouped into the days they fall on, earliest first. Days with
 * nothing on them are left out — an agenda, not a grid. */
export const groupByDay = (events: SchoolEvent[]): CalendarDay[] => {
  const byDay = new Map<string, SchoolEvent[]>();
  for (const e of events) {
    const day = eventDay(e);
    if (!day) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(e);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      // All-day items lead the day: they frame it, rather than slotting into a
      // time nobody set.
      events: list.sort((x, y) => (
        Number(Boolean(y.all_day)) - Number(Boolean(x.all_day))
        || (x.start_at || '').localeCompare(y.start_at || '')
      )),
    }));
};

export function useSchoolCalendar(organizationId: string | undefined) {
  const [month, setMonth] = useState(thisMonth());
  const [days, setDays] = useState<CalendarDay[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { from, to } = monthWindow(month);
    try {
      const { data } = await api.get('/api/sis/parent/events', {
        params: { organization_id: organizationId, from, to },
      });
      setDays(groupByDay(data?.events || []));
    } catch {
      setError('That calendar could not be loaded.');
      setDays([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId, month]);

  useEffect(() => { load(); }, [load]);

  return { month, setMonth, days, loading, error, reload: load };
}
