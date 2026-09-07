/**
 * The transcript's subject vocabulary.
 *
 * DERIVED from `@shared/subjects` so a subject cannot go missing from the
 * transcript when one is added to the platform -- that list is pinned to
 * backend/utils/school_subjects.py by a test on each side.
 *
 * The LABELS are deliberately not the shared ones. An official transcript says
 * "Mathematics", "Physical Education" and "Career & Technical Education"; the
 * pickers everywhere else say "Math", "PE" and "CTE". That is a property of the
 * document, not of the subject, so it stays here -- but only as an override
 * map, so a subject with no override still appears under its platform name
 * rather than disappearing.
 */

import { SUBJECTS as SHARED_SUBJECTS } from '@shared/subjects'

const TRANSCRIPT_LABELS = {
  math: 'Mathematics',
  pe: 'Physical Education',
  cte: 'Career & Technical Education',
}

export const SUBJECT_OPTIONS = SHARED_SUBJECTS.map((s) => ({
  value: s.key,
  label: TRANSCRIPT_LABELS[s.key] || s.name,
}))
