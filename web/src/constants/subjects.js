/**
 * The 11 platform school subjects.
 *
 * The list itself lives in `@shared/subjects`, shared with the mobile app and
 * pinned to `backend/utils/school_subjects.py` by a test on each side. This
 * file used to hold its own copy under a comment asking whoever edited it to
 * keep the backend enum and the mobile metadata in step by hand; they had
 * already drifted by one description when it was extracted.
 */

export { SUBJECTS, SUBJECT_KEYS, getSubject, getSubjectName } from '@shared/subjects'
