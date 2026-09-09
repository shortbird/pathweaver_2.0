import { describe, it, expect } from 'vitest'
import { SUBJECTS, SUBJECT_KEYS, getSubject, getSubjectName } from './subjects'
import shared from '@shared/data/subjects.json'
import { SUBJECT_OPTIONS } from '../pages/admin/transcriptGenerator/subjectOptions'

/**
 * The web half of the subject-vocabulary guard (QF-01).
 *
 * The backend has the matching test (test_school_subjects_shared.py) and so
 * does mobile. Between them, a subject added to the platform enum has to reach
 * every surface that lists subjects, instead of reaching whichever ones
 * somebody remembered.
 */

describe('school subjects come from one list', () => {
  it('re-exports the shared list unchanged', () => {
    expect(SUBJECTS).toEqual(shared.subjects)
    expect(SUBJECT_KEYS).toEqual(shared.subjects.map((s) => s.key))
  })

  it('looks a subject up by key, and survives a bad one', () => {
    expect(getSubject('fine_arts').name).toBe('Fine Arts')
    expect(getSubject('not_a_subject')).toBeNull()
    expect(getSubject(null)).toBeNull()
    // Falls back to the raw key rather than rendering an empty cell.
    expect(getSubjectName('not_a_subject')).toBe('not_a_subject')
    expect(getSubjectName(null)).toBe('')
  })

  it('offers every subject on the transcript, under the formal wording', () => {
    // The transcript is the one place that says the long form. What must not
    // happen is a subject existing on the platform and not on the transcript.
    expect(SUBJECT_OPTIONS.map((o) => o.value)).toEqual(SUBJECT_KEYS)
    const byValue = Object.fromEntries(SUBJECT_OPTIONS.map((o) => [o.value, o.label]))
    expect(byValue.math).toBe('Mathematics')
    expect(byValue.pe).toBe('Physical Education')
    expect(byValue.cte).toBe('Career & Technical Education')
    // Anything without an override keeps its platform name.
    expect(byValue.science).toBe('Science')
  })
})
