import { describe, it, expect } from 'vitest'
import {
  sliceWindow, meanOf, sumOf, failureShare, bucketWeeks, topServices, formatDollars,
} from './PlatformMetricsSection'

const day = (d, extra = {}) => ({
  day: d, signups: 0, dau: 0, task_completions: 0, quest_starts: 0,
  evidence_uploads: 0, reg_success: 0, reg_failed: 0,
  login_success: 0, login_failed: 0, sis_payment_cents: 0, ...extra,
})

describe('sliceWindow', () => {
  it('takes the newest n rows of the ascending series', () => {
    const rows = [day('2026-08-01'), day('2026-08-02'), day('2026-08-03')]
    expect(sliceWindow(rows, 2).map(r => r.day)).toEqual(['2026-08-02', '2026-08-03'])
  })

  it('tolerates a missing payload', () => {
    expect(sliceWindow(undefined, 7)).toEqual([])
  })
})

describe('meanOf / sumOf', () => {
  const rows = [day('2026-08-01', { dau: 10 }), day('2026-08-02', { dau: 21 })]

  it('averages and rounds', () => {
    expect(meanOf(rows, 'dau')).toBe(16)
  })

  it('sums', () => {
    expect(sumOf(rows, 'dau')).toBe(31)
  })

  it('treats empty input as zero, never NaN', () => {
    expect(meanOf([], 'dau')).toBe(0)
    expect(sumOf(null, 'dau')).toBe(0)
  })
})

describe('failureShare', () => {
  it('reports failures as a share of all attempts', () => {
    const rows = [day('2026-08-24', { login_success: 30, login_failed: 10 })]
    expect(failureShare(rows, 'login_success', 'login_failed'))
      .toEqual({ attempts: 40, failed: 10, pct: 25 })
  })

  it('is null when nothing was attempted — 0% and no-data are different claims', () => {
    expect(failureShare([day('2026-08-24')], 'login_success', 'login_failed')).toBeNull()
  })
})

describe('bucketWeeks', () => {
  it('groups days into Monday-start weeks and converts cents to dollars', () => {
    // 2026-08-17 is a Monday; the 23rd is that week's Sunday, the 24th is next week.
    const rows = [
      day('2026-08-17', { sis_payment_cents: 100_00 }),
      day('2026-08-23', { sis_payment_cents: 50_00 }),
      day('2026-08-24', { sis_payment_cents: 25_00 }),
    ]
    expect(bucketWeeks(rows)).toEqual([
      { week: '2026-08-17', dollars: 150 },
      { week: '2026-08-24', dollars: 25 },
    ])
  })

  it('survives malformed rows', () => {
    expect(bucketWeeks([null, { day: 42 }, undefined])).toEqual([])
  })
})

describe('topServices', () => {
  const svc = (name, cost) => ({ service_name: name, total_cost_usd: cost, requests: 1 })

  it('passes small lists through untouched', () => {
    expect(topServices([svc('tutor', 2)], 6)).toEqual([
      { name: 'tutor', cost: 2, requests: 1 },
    ])
  })

  it('folds the tail into Other rather than growing the bar list', () => {
    const services = ['a', 'b', 'c', 'd'].map((n, i) => svc(n, 10 - i))
    const out = topServices(services, 2)
    expect(out.map(r => r.name)).toEqual(['a', 'b', 'Other'])
    expect(out[2].cost).toBe(8 + 7) // c + d
  })

  it('tolerates a missing payload', () => {
    expect(topServices(undefined)).toEqual([])
  })
})

describe('formatDollars', () => {
  it('rounds to whole dollars with separators', () => {
    expect(formatDollars(47387.38)).toBe('$47,387')
    expect(formatDollars(undefined)).toBe('$0')
  })
})
