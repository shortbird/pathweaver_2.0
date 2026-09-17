/**
 * Age in whole years from a date-of-birth string (YYYY-MM-DD), as of today or
 * as of `asOf` (YYYY-MM-DD). Returns null when the DOB is missing or
 * unparseable — callers treat "unknown" differently from "under 13" (e.g. the
 * Custom Class gate shows the entry and asks for the birthday).
 *
 * `asOf` is how a school counts: a child's age for the year is their age on
 * the first day of school, so the registration funnel, the parent's Schedule
 * Builder and the office's CLP all pass `first_day_of_school` and agree on
 * which classes fit (M11, docs/sis/CONSOLIDATION_PLAN.md; before it, the CLP
 * and the student modal judged against today and offered different classes).
 * Both dates are read from their parts, never parsed as instants: a bare
 * 'YYYY-MM-DD' through new Date() is midnight UTC, which is the day before
 * west of Greenwich.
 */
export function ageFromDob(dob, asOf = null) {
  const birth = parts(dob);
  if (!birth) return null;
  const at = asOf ? parts(asOf) : todayParts();
  if (!at) return null;
  let age = at.y - birth.y;
  if (at.m < birth.m || (at.m === birth.m && at.d < birth.d)) age -= 1;
  return age;
}

function parts(value) {
  const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
  return y && m && d ? { y, m, d } : null;
}

function todayParts() {
  const t = new Date();
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
}

export const CLASS_MIN_AGE = 13;

/**
 * Age at which the diploma becomes the thing a learner is working toward.
 * Below it, credits are an abstraction about a future nobody is planning yet;
 * the pillar radar is the useful picture. At or above it, the radar is the
 * abstraction and credit progress is the thing they check.
 */
export const DIPLOMA_TRACK_MIN_AGE = 13;

/**
 * Whether to show diploma credit progress rather than the pillar radar.
 *
 * Unknown age reads as "yes". These are two views of a learner's own work, not
 * a permission gate, and most learners with no birthday on file are the high
 * schoolers the credit view is for — a 16-year-old shown a radar chart instead
 * of their transcript progress is the worse failure. (Contrast is_under_13 in
 * backend/utils/portfolio_access.py, which fails the other way because it
 * guards COPPA-restricted features.)
 */
export function tracksDiplomaCredits(dateOfBirth) {
  const age = ageFromDob(dateOfBirth);
  return age === null || age >= DIPLOMA_TRACK_MIN_AGE;
}
