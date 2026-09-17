import { describe, it, expect } from 'vitest'
import { formatCents, formatDollars } from '../money'

describe('formatCents', () => {
  it('renders dollars with cents and thousands', () => {
    expect(formatCents(12345)).toBe('$123.45')
    expect(formatCents(150000)).toBe('$1,500.00')
    expect(formatCents(0)).toBe('$0.00')
    expect(formatCents(5)).toBe('$0.05')
  })
  it('marks a refund or credit with a real minus sign', () => {
    expect(formatCents(-500)).toBe('−$5.00')
  })
  it('shows nothing on file as a dash unless told otherwise', () => {
    expect(formatCents(null)).toBe('—')
    expect(formatCents(undefined)).toBe('—')
    expect(formatCents('lots')).toBe('—')
    expect(formatCents(null, { blank: '' })).toBe('')
    expect(formatCents(null, { blank: null })).toBeNull()
  })
  it('reads a plan price compactly', () => {
    expect(formatCents(5000, { compact: true })).toBe('$50')
    expect(formatCents(1250, { compact: true })).toBe('$12.50')
    expect(formatCents(150000, { compact: true })).toBe('$1,500')
  })
  it('accepts a numeric string and rounds stray fractions', () => {
    expect(formatCents('1999')).toBe('$19.99')
    expect(formatCents(1999.6)).toBe('$20.00')
  })
})

describe('formatDollars', () => {
  it('is the same rule for a value already in dollars', () => {
    expect(formatDollars(35)).toBe('$35.00')
    expect(formatDollars(12.5, { compact: true })).toBe('$12.50')
    expect(formatDollars(35, { compact: true })).toBe('$35')
    expect(formatDollars(null, { blank: '' })).toBe('')
  })
})
