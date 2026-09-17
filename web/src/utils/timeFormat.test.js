import { describe, it, expect } from 'vitest'
import {
  timeAgo, to12h, compact12h, fmtEventWhen, fmtEventDay, fmtEventTimeRange,
  splitEventStamp, fmtDayHeading, fmtDateOnly, isDateOnly,
} from './timeFormat'

describe('timeAgo', () => {
  const now = new Date('2026-09-15T12:00:00Z')

  it('is coarse: hours today, days after that', () => {
    expect(timeAgo('2026-09-15T11:30:00Z', now)).toBe('Just now')
    expect(timeAgo('2026-09-15T09:00:00Z', now)).toBe('3h ago')
    expect(timeAgo('2026-09-13T12:00:00Z', now)).toBe('2d ago')
  })

  it('reads "Recently" for nothing or garbage rather than NaN', () => {
    expect(timeAgo(null, now)).toBe('Recently')
    expect(timeAgo('not a date', now)).toBe('Recently')
  })
})

describe('to12h', () => {
  it('turns a stored 24-hour time into am/pm', () => {
    expect(to12h('13:00')).toBe('1:00 PM')
    expect(to12h('00:05:00')).toBe('12:05 AM')
  })
})

// The event helpers are unit-tested under the Denver pin (tests/globalSetup.js),
// so a helper that read the stamp in local time would fail here the way it
// failed for the parents.
describe('school event stamps read as the wall clock the office typed', () => {
  const evening = { start_at: '2026-09-22T18:30:00+00:00', end_at: '2026-09-22T20:00:00+00:00', all_day: false }
  const laborDay = { start_at: '2026-09-07T00:00:00+00:00', all_day: true }

  it('fmtEventWhen says 6:30 PM on the 22nd, not 12:30 PM in Denver', () => {
    const when = fmtEventWhen(evening)
    expect(when).toMatch(/Tue, Sep 22/)
    expect(when).toMatch(/6:30 PM/)
    expect(when).not.toMatch(/12:30/)
  })

  it('fmtEventWhen keeps an all-day event on its own day', () => {
    expect(fmtEventWhen(laborDay)).toMatch(/Mon, Sep 7 · all day/)
  })

  it('fmtEventTimeRange prints the range, the start alone, or All day', () => {
    expect(fmtEventTimeRange(evening)).toBe('6:30 PM – 8:00 PM')
    expect(fmtEventTimeRange({ ...evening, end_at: null })).toBe('6:30 PM')
    expect(fmtEventTimeRange(laborDay)).toBe('All day')
  })

  it('fmtEventDay and splitEventStamp read the date part, whatever the zone', () => {
    expect(fmtEventDay(laborDay)).toBe('Sep 7, 2026')
    expect(splitEventStamp(evening.start_at)).toEqual({ date: '2026-09-22', time: '18:30' })
  })

  it('a day is built from its parts, so the 9th is the 9th west of Greenwich', () => {
    expect(fmtDayHeading('2026-09-09')).toBe('Wed 9')
    expect(fmtDateOnly('2026-09-09')).toBe('Sep 9, 2026')
    expect(fmtDateOnly('2026-09-09', 'long')).toBe('Wednesday, September 9')
    expect(isDateOnly('2026-09-09')).toBe(true)
    expect(isDateOnly('2026-09-09T10:00:00Z')).toBe(false)
  })

  it('compact12h is the month grid\'s four-character form', () => {
    expect(compact12h('13:00')).toBe('1pm')
    expect(compact12h('13:30')).toBe('1:30pm')
    expect(compact12h('00:00')).toBe('12am')
  })
})
