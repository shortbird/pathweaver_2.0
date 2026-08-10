/**
 * Date labels for the school feed. Mirrors the web SchoolCommunity component:
 * the all-day-in-UTC rule and the cross-year rule are behavior, not styling —
 * regressing either shows families the wrong day.
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
    const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
    // All-day events are stored date-only (00:00 UTC); format them in UTC or
    // the date renders as the previous evening anywhere west of Greenwich.
    if (e.all_day) opts.timeZone = 'UTC';
    // A school calendar runs across New Year. Without the year, "Mon, Jan 11"
    // under "Mon, Dec 14" reads as out of order instead of as next year.
    const year = e.all_day ? d.getUTCFullYear() : d.getFullYear();
    if (year !== new Date().getFullYear()) opts.year = 'numeric';
    const day = d.toLocaleDateString(undefined, opts);
    if (e.all_day) return `${day} · all day`;
    return `${day} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  } catch { return ''; }
};
