import { describe, it, expect } from 'vitest'
import { getUserName, getFirstName, getUserInitials } from '../nameUtils'

describe('getUserName', () => {
  it('combines first and last when both present', () => {
    expect(getUserName({ first_name: 'Jane', last_name: 'Doe' })).toBe('Jane Doe')
  })

  it('trims whitespace', () => {
    expect(getUserName({ first_name: '  Jane  ', last_name: '  Doe  ' })).toBe('Jane Doe')
  })

  it('returns first name only when last is missing', () => {
    expect(getUserName({ first_name: 'Jane' })).toBe('Jane')
  })

  it('returns last name only when first is missing', () => {
    expect(getUserName({ last_name: 'Doe' })).toBe('Doe')
  })

  it('falls back to display_name when neither first nor last present', () => {
    expect(getUserName({ display_name: 'j_doe' })).toBe('j_doe')
  })

  it('falls back to email when no name at all', () => {
    expect(getUserName({ email: 'j@x.com' })).toBe('j@x.com')
  })

  it('uses custom fallback when nothing is available', () => {
    expect(getUserName({}, 'Anonymous')).toBe('Anonymous')
    expect(getUserName(null, 'Anonymous')).toBe('Anonymous')
  })

  it('default fallback is "Unknown"', () => {
    expect(getUserName(null)).toBe('Unknown')
  })
})

describe('getFirstName', () => {
  it('returns first name when present', () => {
    expect(getFirstName({ first_name: 'Jane' })).toBe('Jane')
  })

  it('falls back to display_name when first_name blank', () => {
    expect(getFirstName({ first_name: '', display_name: 'jd' })).toBe('jd')
  })

  it('returns fallback when nothing available', () => {
    expect(getFirstName(null, '?')).toBe('?')
  })

  it('empty default fallback', () => {
    expect(getFirstName({})).toBe('')
  })
})

describe('getUserInitials', () => {
  it('returns two initials uppercase', () => {
    expect(getUserInitials({ first_name: 'jane', last_name: 'doe' })).toBe('JD')
  })

  it('falls back to single initial from first name', () => {
    expect(getUserInitials({ first_name: 'jane' })).toBe('J')
  })

  it('uses display_name initial when no first/last', () => {
    expect(getUserInitials({ display_name: 'alex' })).toBe('A')
  })

  it('returns ? for null user', () => {
    expect(getUserInitials(null)).toBe('?')
  })

  it('returns ? for empty user', () => {
    expect(getUserInitials({})).toBe('?')
  })
})
