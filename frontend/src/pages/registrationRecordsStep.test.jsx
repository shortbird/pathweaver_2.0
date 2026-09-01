import { describe, it, expect } from 'vitest'
import { firstDestinationError } from './RegisterFunnelPage'

/**
 * Credit Partner Program: the funnel step that asks where each student's
 * Optio Academy transcript should be sent.
 *
 * The answer is per STUDENT, not per family — siblings routinely attend
 * different schools, and the whole point of the step is that the transcript
 * reaches a named registrar without anyone retyping it at send time.
 */

const KIDS = [
  { user_id: 'k1', first_name: 'Ada' },
  { user_id: 'k2', first_name: 'Sol' },
]

describe('firstDestinationError', () => {
  it('accepts a complete school answer for every student', () => {
    expect(firstDestinationError(KIDS, {
      k1: { destination_type: 'school', school_name: 'Green Canyon High School' },
      k2: { destination_type: 'homeschool' },
    })).toBeNull()
  })

  it('asks for an answer for a student who has none', () => {
    const err = firstDestinationError(KIDS, {
      k1: { destination_type: 'school', school_name: 'A School' },
    })
    expect(err).toMatch(/Sol/)
  })

  it('names the student missing a school name rather than saying "a student"', () => {
    const err = firstDestinationError(KIDS, {
      k1: { destination_type: 'school', school_name: '   ' },
      k2: { destination_type: 'homeschool' },
    })
    expect(err).toBe('Enter the school Ada attends')
  })

  it('refuses consent to auto-send with no address to send to', () => {
    const err = firstDestinationError(KIDS, {
      k1: { destination_type: 'school', school_name: 'A School', auto_send_consent: true },
      k2: { destination_type: 'homeschool' },
    })
    expect(err).toMatch(/registrar email for Ada/)
  })

  it('does not demand school fields from a homeschool or unenrolled answer', () => {
    expect(firstDestinationError(KIDS, {
      k1: { destination_type: 'homeschool', auto_send_consent: true },
      k2: { destination_type: 'optio_only' },
    })).toBeNull()
  })

  it('falls back to a generic name when the student has none', () => {
    const err = firstDestinationError([{ user_id: 'k9' }], {})
    expect(err).toBe("Choose where your student's records should go")
  })

  it('is satisfied by an empty roster', () => {
    expect(firstDestinationError([], {})).toBeNull()
    expect(firstDestinationError(null, null)).toBeNull()
  })
})
