/**
 * The diploma subjects a task can earn credit toward, in the shape the task
 * pickers want: `{ id, label }`.
 *
 * The list itself comes from `@shared/subjects`, shared with the mobile app and
 * pinned to backend/utils/school_subjects.py by a test on each side. This file
 * only renames the fields -- the pickers were written against `id`/`label` and
 * the shared record uses `key`/`name`.
 */

import { SUBJECTS } from './subjects'

export const DIPLOMA_SUBJECTS = SUBJECTS.map((s) => ({ id: s.key, label: s.name }))

export const SUBJECT_LABEL = Object.fromEntries(
  DIPLOMA_SUBJECTS.map((s) => [s.id, s.label])
)

/**
 * The subject a task credits when nobody picked one, keyed by pillar. Mirrors
 * PILLAR_DEFAULT_SUBJECT in backend/utils/school_subjects.py, which is what
 * actually gets written if the client sends nothing.
 *
 * It exists because the column DEFAULT on both task tables is ['Electives'],
 * so a task saved with no subject was credited as an elective whatever it was.
 * Showing the pillar's answer up front means the teacher sees the credit their
 * task is about to earn while they can still change it.
 *
 * Not in shared/: a pillar-to-subject default is a rule about how a task is
 * classified, not part of the subject vocabulary, and the backend owns it.
 */
export const PILLAR_DEFAULT_SUBJECT = {
  art: 'fine_arts',
  stem: 'science',
  communication: 'language_arts',
  wellness: 'health',
  civics: 'social_studies'
}

export const defaultSubjectForPillar = (pillar) =>
  PILLAR_DEFAULT_SUBJECT[pillar] || 'electives'

/**
 * Divide `xp` evenly across `subjects`, in multiples of 5, summing to exactly
 * `xp` with the remainder on the first subject.
 *
 * The parts have to sum to the task's XP and land on multiples of 5, because
 * that is what the backend stores and what a transcript adds up. Doing it here
 * as well means the number the teacher sees is the number that gets saved,
 * rather than one the server quietly rounds afterwards.
 */
export function evenSplit(subjects, xp) {
  const keys = subjects || []
  if (keys.length === 0) return {}
  const total = Math.max(0, Number(xp) || 0)
  const base = Math.floor(total / keys.length / 5) * 5
  const split = Object.fromEntries(keys.map((k) => [k, base]))
  split[keys[0]] += total - base * keys.length
  return split
}

export default DIPLOMA_SUBJECTS
