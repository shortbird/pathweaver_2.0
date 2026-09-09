/**
 * The eleven platform school subjects — the typed front door to
 * `shared/data/subjects.json`, via the generated constants.
 *
 * See that file's `_comment` for where each field is canonical and what is
 * deliberately left out. In short: the keys and names belong to
 * `backend/utils/school_subjects.py`, the descriptions and accents are the
 * clients', and anything that is a property of ONE surface (mobile's icon, the
 * transcript's formal wording) stays with that surface.
 */

import { SUBJECTS_DATA, type SubjectRecord } from './generated/subjects';

export type Subject = SubjectRecord;

/** In transcript order, which is the order the backend enum declares. */
export const SUBJECTS: readonly Subject[] = SUBJECTS_DATA;

export const SUBJECT_KEYS: string[] = SUBJECTS.map((s) => s.key);

const BY_KEY = new Map(SUBJECTS.map((s) => [s.key, s]));

export function getSubject(key: string | null | undefined): Subject | null {
  if (!key) return null;
  return BY_KEY.get(key) ?? null;
}

/** The display name, falling back to the raw key so nothing renders blank. */
export function getSubjectName(key: string | null | undefined): string {
  return getSubject(key)?.name || key || '';
}
