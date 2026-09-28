/**
 * The 11 platform school subjects.
 *
 * The list itself lives in `@shared/subjects`, shared with the mobile app and
 * pinned to `backend/utils/school_subjects.py` by a test on each side. This
 * file used to hold its own copy under a comment asking whoever edited it to
 * keep the backend enum and the mobile metadata in step by hand; they had
 * already drifted by one description when it was extracted.
 */

import { SUBJECTS, getSubject } from '@shared/subjects'
import { TRANSCRIPT_SUBJECT_NAMES } from '@shared/credits'

export { SUBJECTS, SUBJECT_KEYS, getSubject, getSubjectName } from '@shared/subjects'

// The one colour each subject wears on every surface: its shared accent.
// Before 2026-09-28 the badges, the transfer-credit form and the demo each
// kept their own map, so Fine Arts was pink in one place and magenta in the
// next. Pick a subject's colour here, never from a hand-written map.
export const SUBJECT_FALLBACK_COLOR = '#6B7280'

// A subject arrives as a key ('fine_arts'), a picker name ('Fine Arts') or a
// transcript name, depending on who wrote the row: task credit is stored under
// the NAME ({"Digital Literacy": 50}), so a key-only lookup painted every
// subject on a task the same fallback grey (2026-09-28).
const BY_SPELLING = new Map(
  SUBJECTS.flatMap((s) =>
    [s.key, s.name, TRANSCRIPT_SUBJECT_NAMES[s.key]].filter(Boolean).map((spelling) => [spelling, s])
  )
)

export function subjectColor(subject) {
  return (BY_SPELLING.get(subject) || getSubject(subject))?.accent || SUBJECT_FALLBACK_COLOR
}

/** A light chip in the subject's colour: tinted background, coloured text. */
export function subjectTint(key) {
  const color = subjectColor(key)
  return { backgroundColor: `${color}1A`, color }
}
