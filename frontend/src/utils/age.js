/**
 * Age from a date-of-birth string (YYYY-MM-DD). Returns null when the DOB is
 * missing or unparseable — callers treat "unknown" differently from "under 13"
 * (e.g. the Custom Class gate shows the entry and asks for the birthday).
 */
export function ageFromDob(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
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
