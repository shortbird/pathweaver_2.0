/**
 * What an event's sign-up says on a family's calendar, in words.
 *
 * Apogee NoCo, SPARK Friday Excursions (2026-10-16): the list of the
 * semester's excursions shows, on every row, whether this family is signed up,
 * whether the trip is full, and how many spots are left. The web list and the
 * app agenda both draw that line, so the words live here once.
 *
 * Reads the fields the backend adds to each family event
 * (sis_event_rsvp_service.annotate_for_family): rsvp_spots_left (null = no
 * limit), rsvp_full, my_rsvp. "Full" never hides a family's own sign-up: a
 * family already in sees "Signed up" and can still change it.
 */

export interface RsvpEventShape {
  rsvp_enabled?: boolean | null;
  rsvp_mode?: string | null;
  rsvp_closes_at?: string | null;
  rsvp_spots_left?: number | null;
  rsvp_full?: boolean | null;
  my_rsvp?: { attending?: boolean; party_size?: number; student_ids?: string[] } | null;
}

export type RsvpTone = 'in' | 'out' | 'full' | 'closed' | 'open';

export interface RsvpStatus {
  tone: RsvpTone;
  label: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "3 spots left", or null when the event has no limit. */
export function spotsLeftText(event: RsvpEventShape): string | null {
  const left = event.rsvp_spots_left;
  if (left === null || left === undefined) return null;
  if (left <= 0) return 'Full';
  return `${plural(left, 'spot', 'spots')} left`;
}

/**
 * The one-line state of a family's sign-up, or null when the event is not
 * taking replies. `now` is injectable for tests.
 */
export function rsvpStatus(event: RsvpEventShape, now: Date = new Date()): RsvpStatus | null {
  if (!event.rsvp_enabled) return null;
  const mine = event.my_rsvp;
  const children = event.rsvp_mode === 'children';
  if (mine?.attending) {
    const n = children ? (mine.student_ids?.length || mine.party_size || 1) : (mine.party_size || 1);
    const who = children ? plural(n, 'child', 'children') : plural(n, 'person', 'people');
    return { tone: 'in', label: `Signed up · ${who}` };
  }
  const closed = Boolean(event.rsvp_closes_at && new Date(event.rsvp_closes_at) < now);
  if (closed) return { tone: 'closed', label: mine ? 'Not coming · replies closed' : 'Replies closed' };
  if (event.rsvp_full) return { tone: 'full', label: 'Full' };
  if (mine && !mine.attending) return { tone: 'out', label: 'Not coming' };
  const spots = spotsLeftText(event);
  return { tone: 'open', label: spots ? `Sign up · ${spots}` : 'Sign up' };
}
