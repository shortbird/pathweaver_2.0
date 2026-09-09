import { describe, it, expect } from 'vitest'
import { formatCost, zeroFillDays } from './AICostChart'

describe('formatCost', () => {
  it('shows enough precision for sub-cent daily costs', () => {
    // Real daily spend on this platform is fractions of a cent; $0.00 would
    // make every day look free.
    expect(formatCost(0.0042)).toBe('$0.0042')
    expect(formatCost(0.0000)).toBe('$0')
  })

  it('scales precision down as amounts grow', () => {
    expect(formatCost(0.132)).toBe('$0.132')
    expect(formatCost(12.5)).toBe('$12.50')
  })

  it('treats missing or bad values as zero rather than NaN', () => {
    expect(formatCost(undefined)).toBe('$0')
    expect(formatCost(null)).toBe('$0')
    expect(formatCost('not a number')).toBe('$0')
  })
})

describe('zeroFillDays', () => {
  const today = new Date('2026-08-13T12:00:00Z')

  it('emits one point per day across the window, oldest first', () => {
    const out = zeroFillDays([], 7, today)
    expect(out).toHaveLength(7)
    expect(out[0].date).toBe('2026-08-07')
    expect(out[6].date).toBe('2026-08-13')
  })

  it('fills days the API omitted with zeros, not gaps', () => {
    const out = zeroFillDays(
      [{ date: '2026-08-13', cost_usd: 0.02, requests: 4, tokens: 900 }],
      3,
      today
    )
    expect(out.map(p => p.cost)).toEqual([0, 0, 0.02])
    expect(out[0].requests).toBe(0)
  })

  it('matches API rows that carry a full timestamp', () => {
    const out = zeroFillDays(
      [{ date: '2026-08-12T09:30:00Z', cost_usd: 0.5, requests: 2, tokens: 10 }],
      2,
      today
    )
    expect(out[0]).toMatchObject({ date: '2026-08-12', cost: 0.5, requests: 2 })
  })

  it('survives a missing or malformed payload', () => {
    expect(zeroFillDays(undefined, 3, today)).toHaveLength(3)
    expect(zeroFillDays(null, 3, today).every(p => p.cost === 0)).toBe(true)
    expect(zeroFillDays([null, { nope: true }], 2, today).every(p => p.cost === 0)).toBe(true)
  })

  it('ignores rows outside the requested window', () => {
    const out = zeroFillDays(
      [{ date: '2026-01-01', cost_usd: 99, requests: 1, tokens: 1 }],
      3,
      today
    )
    expect(out.reduce((s, p) => s + p.cost, 0)).toBe(0)
  })
})
