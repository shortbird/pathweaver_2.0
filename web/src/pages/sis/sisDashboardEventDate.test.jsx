/**
 * An all-day event keeps its date west of Greenwich.
 *
 * iCreate, 2026-08-31: "It says Sun, Sep 6 - no class, labor day, but should be
 * Mon, Sep 7."
 *
 * The row is right. NO CLASS - LABOR DAY is stored as 2026-09-07 00:00:00+00
 * with all_day = true, because an all-day event names a calendar date rather
 * than an instant. Converting that to America/Denver gives 2026-09-06 18:00,
 * so the dashboard rendered the evening before. Every US timezone is behind
 * UTC, so this was wrong for every American school, on every all-day event.
 *
 * The family-facing SchoolCommunity.fmtWhen already read these in UTC; the SIS
 * dashboard did not.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { eventTime } from './SisDashboard'

// Pin a timezone behind UTC, or this test proves nothing: run in UTC (as CI is)
// the buggy and the fixed formatter agree, and the regression sails through.
const realTZ = process.env.TZ
beforeAll(() => { process.env.TZ = 'America/Denver' })
afterAll(() => { process.env.TZ = realTZ })

const LABOR_DAY = {
  title: 'NO CLASS - LABOR DAY',
  start_at: '2026-09-07T00:00:00+00:00',
  all_day: true
}

describe('all-day events', () => {
  it('renders Labor Day as the 7th, not the 6th', () => {
    const rendered = eventTime(LABOR_DAY)
    expect(rendered).toContain('Sep 7')
    expect(rendered).not.toContain('Sep 6')
  })

  it('names the right weekday', () => {
    // 2026-09-07 is a Monday. The bug reported it as Sunday.
    expect(eventTime(LABOR_DAY)).toContain('Mon')
    expect(eventTime(LABOR_DAY)).not.toContain('Sun')
  })

  it('shows no clock time', () => {
    expect(eventTime(LABOR_DAY)).not.toMatch(/\d:\d\d/)
  })

  it('holds for a date at the far end of the year', () => {
    const newYearsDay = { start_at: '2027-01-01T00:00:00+00:00', all_day: true }
    expect(eventTime(newYearsDay)).toContain('Jan 1')
    expect(eventTime(newYearsDay)).not.toContain('Dec 31')
  })
})

describe('timed events keep local-time behaviour', () => {
  it('still renders a clock time', () => {
    const timed = { start_at: '2026-09-08T18:30:00+00:00', all_day: false }
    expect(eventTime(timed)).toMatch(/\d:\d\d/)
  })
})

describe('bad input', () => {
  it('returns empty for a missing start', () => {
    expect(eventTime({ all_day: true })).toBe('')
  })

  it('returns empty for an unparseable start', () => {
    expect(eventTime({ start_at: 'not a date', all_day: true })).toBe('')
  })
})
