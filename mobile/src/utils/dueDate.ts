/**
 * Due dates on class quests and class quest tasks (ticket 26c91e25).
 *
 * A teacher sets one due date per task per class on web. The student sees it
 * as a chip on the task and in the dashboard's Upcoming card. The date arrives
 * as an ISO datetime (or, from an older payload, a bare YYYY-MM-DD) and is
 * shown in the device's own timezone.
 */

/** A bare YYYY-MM-DD is "due that day": read it as the end of that local day,
 *  not midnight UTC, which is the evening before in every US timezone. */
export function parseDueDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s)
    ? new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)), 23, 59, 59)
    : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Tue, Oct 6" (with the year when it is not this year). Empty when unset. */
export function formatDueDate(raw: string | null | undefined, now: Date = new Date()): string {
  const d = parseDueDate(raw);
  if (!d) return '';
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  try { return d.toLocaleDateString(undefined, opts); } catch { return ''; }
}

export function isPastDue(raw: string | null | undefined, now: Date = new Date()): boolean {
  const d = parseDueDate(raw);
  return !!d && d.getTime() < now.getTime();
}
