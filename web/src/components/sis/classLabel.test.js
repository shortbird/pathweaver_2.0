import { describe, it, expect } from 'vitest'
import { classLabel, meetingText } from './classLabel'

// The shared label every class picker uses: same class names repeat across
// sections, so the label carries the schedule.
describe('classLabel', () => {
  const cls = {
    name: 'Reading Tutoring',
    meetings: [
      { day_of_week: 1, start_time: '09:30:00', end_time: '10:30:00' },
      { day_of_week: 3, start_time: '09:30:00', end_time: '10:30:00' },
    ],
  }

  it('labels a class with its meeting days and times', () => {
    expect(classLabel(cls)).toBe('Reading Tutoring — Mon/Wed 9:30 AM–10:30 AM')
  })

  it('falls back to the bare name when there are no meetings', () => {
    expect(classLabel({ name: 'Chess Club', meetings: [] })).toBe('Chess Club')
    // Synthetic options (e.g. "All classes") carry no meetings at all.
    expect(classLabel({ id: '', name: 'All classes' })).toBe('All classes')
  })

  it('meetingText handles a meeting with no day', () => {
    expect(meetingText([{ start_time: '13:00', end_time: '14:00' }]))
      .toBe('1:00 PM–2:00 PM')
  })
})
