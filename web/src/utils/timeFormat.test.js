import { describe, it, expect } from 'vitest'
import { timeAgo, to12h } from './timeFormat'

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
