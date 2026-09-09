/**
 * The transcript's subject vocabulary.
 *
 * DERIVED from `@shared/subjects` so a subject cannot go missing from the
 * transcript when one is added to the platform -- that list is pinned to
 * backend/utils/school_subjects.py by a test on each side.
 *
 * The LABELS are the TRANSCRIPT vocabulary, not the picker one. An official
 * transcript says "Mathematics", "Physical Education" and "Career & Technical
 * Education"; the pickers everywhere else say "Math", "PE" and "CTE". Both
 * lists are shared -- see shared/data/credits.json and shared/data/subjects.json
 * -- and the `|| s.name` fallback means a subject with no credit requirement
 * still appears under its platform name rather than disappearing.
 */

import { SUBJECTS as SHARED_SUBJECTS } from '@shared/subjects'
import { TRANSCRIPT_SUBJECT_NAMES } from '@shared/credits'

export const SUBJECT_OPTIONS = SHARED_SUBJECTS.map((s) => ({
  value: s.key,
  // The transcript vocabulary, shared rather than overridden here. This was a
  // three-entry override map (math/pe/cte) layered over the picker names, which
  // is the same eleven answers by a longer route -- and a fourth subject whose
  // document name differed would have had to be remembered here.
  label: TRANSCRIPT_SUBJECT_NAMES[s.key] || s.name,
}))
