/**
 * Age from a date-of-birth string (YYYY-MM-DD).
 *
 * Mirrors web/src/utils/age.js on the web app. Returns null when the DOB
 * is missing or unparseable, so callers can treat "unknown" as its own case
 * rather than folding it into "young".
 */
export function ageFromDob(dob?: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/**
 * Age at which the diploma becomes the thing a learner is working toward.
 * Below it, credits describe a future nobody is planning yet and the pillar
 * radar is the useful picture; at or above it, the radar is the abstraction
 * and credit progress is what they actually check.
 */
export const DIPLOMA_TRACK_MIN_AGE = 13;

/**
 * Whether to show diploma credit progress rather than the pillar radar.
 *
 * Unknown age reads as "yes" — these are two views of a learner's own work,
 * not a permission gate, and most learners with no birthday on file are the
 * high schoolers the credit view is for. (Contrast is_under_13 in
 * backend/utils/portfolio_access.py, which fails the other way because it
 * guards COPPA-restricted features.)
 */
export function tracksDiplomaCredits(dateOfBirth?: string | null): boolean {
  const age = ageFromDob(dateOfBirth);
  return age === null || age >= DIPLOMA_TRACK_MIN_AGE;
}
