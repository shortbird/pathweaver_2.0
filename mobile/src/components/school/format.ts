/**
 * Date labels for the school feed. Mirrors the web SchoolCommunity component:
 * the wall-clock rule and the cross-year rule are behavior, not styling —
 * regressing either shows families the wrong day.
 *
 * EVENT_STAMPS_ARE_WALL_CLOCK
 * ---------------------------
 * `sis_events.start_at` does NOT name an instant. The office types "10:00" into
 * the SIS calendar form and routes/sis/events.py stores that string verbatim
 * into a timestamptz column, so Postgres tags it +00 without converting: 10am
 * assembly is on the row as `10:00:00+00`. The stamp is a wall clock wearing a
 * UTC label.
 *
 * So read it in UTC and it says 10:00, which is what the office meant and what
 * /school-calendar has always displayed (it slices the ISO string rather than
 * parsing it). Read it as an instant — `new Date(...)` then format in local
 * time — and it says 4:00 AM in Denver.
 *
 * That second reading is what these formatters used to do for timed events,
 * and a parent reported the 10am Hang Time on his calendar as 4am (Perch
 * 1d0d41a9). The all-day half of the rule was already here, from the same bug
 * one layer up: "NO CLASS - LABOR DAY" on the 7th rendered as Sun, Sep 6. The
 * principle was right; it just had not been carried to events with a time on
 * them.
 *
 * The real repair is upstream — store a true instant, converted through
 * `organizations.timezone`, and migrate the ~66 existing rows. Until that
 * happens, every reader of these columns must agree to read the wall clock,
 * because a calendar that disagrees with itself is worse than one that is
 * uniformly naive.
 */

import type { SchoolEvent } from '@/src/hooks/useSchool';

export const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return ''; }
};

export const fmtWhen = (e: Pick<SchoolEvent, 'start_at' | 'all_day'>): string => {
  if (!e.start_at) return '';
  const d = new Date(e.start_at);
  if (Number.isNaN(d.getTime())) return '';
  try {
    // EVERY part of this stamp is read in UTC, timed events included. See
    // EVENT_STAMPS_ARE_WALL_CLOCK below: start_at holds the wall clock the
    // office typed, tagged +00, so UTC is where that wall clock is legible.
    const opts: Intl.DateTimeFormatOptions = {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
    };
    // A school calendar runs across New Year. Without the year, "Mon, Jan 11"
    // under "Mon, Dec 14" reads as out of order instead of as next year.
    if (d.getUTCFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    const day = d.toLocaleDateString(undefined, opts);
    if (e.all_day) return `${day} · all day`;
    const time = d.toLocaleTimeString(undefined, {
      hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
    });
    return `${day} · ${time}`;
  } catch { return ''; }
};
