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
