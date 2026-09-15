/**
 * The school this user is in, for the school-wide pages (calendar, resources,
 * directory).
 *
 * Those pages used to bootstrap from /api/sis/parent/context, which answers
 * "where am I a GUARDIAN" and is empty for a student or a teacher who guards
 * nobody — so a child at iCreate opening the school calendar was told their
 * account wasn't linked to a school. /api/sis/school/context resolves
 * membership instead, and reports guardianship separately.
 *
 * Guardian-only pages (billing, absences, portal, requests, schedule) keep
 * using the parent context: for them, "not a guardian" is the correct answer.
 *
 * Returns `orgs: null` while loading, `[]` once it's known there are none.
 * Since 2026-09-15 this is the shared react-query read in hooks/api, so the
 * sidebar, /school and these pages make the request once between them.
 */
export { useSchoolContext as default } from './api/useSchoolContext'
