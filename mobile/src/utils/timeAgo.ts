/**
 * Shared relative-time formatting for feed and comment surfaces.
 *
 * `Date.prototype.toLocaleDateString` / `toLocaleTimeString` construct a fresh
 * `Intl.DateTimeFormat` on every call, which is one of the most expensive calls
 * available on Hermes. The feed takes that path for every post older than a
 * week — i.e. for every card once you scroll past recent history — so the
 * formatters are built once here and reused. Lazily, so a runtime without
 * `Intl` fails at the call rather than at import.
 */

let monthDayFormatter: Intl.DateTimeFormat | null = null;
let hourMinuteFormatter: Intl.DateTimeFormat | null = null;

/** "Jun 17" */
export function formatMonthDay(date: Date): string {
  if (!monthDayFormatter) {
    monthDayFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  }
  return monthDayFormatter.format(date);
}

/** "Jun 17 3:04 PM" — the stamp shown on comments. */
export function formatMonthDayTime(date: Date): string {
  if (!hourMinuteFormatter) {
    hourMinuteFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return `${formatMonthDay(date)} ${hourMinuteFormatter.format(date)}`;
}

/** Compact stamp used on feed cards: "just now", "5m", "3h", "2d", "Jun 17". */
export function formatTimeAgo(timestamp: string): string {
  const then = new Date(timestamp);
  const diffMins = Math.floor((Date.now() - then.getTime()) / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return formatMonthDay(then);
}

/** Sentence-form stamp used on list rows: "Just now", "5m ago", "Jun 17". */
export function formatRelativeTime(iso?: string | null, emptyLabel = 'No activity yet'): string {
  if (!iso) return emptyLabel;
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatMonthDay(d);
}
