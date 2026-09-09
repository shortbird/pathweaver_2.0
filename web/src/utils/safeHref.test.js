import { describe, it, expect } from 'vitest'
import { safeHref } from './safeHref'

describe('safeHref', () => {
  it('allows internal app paths', () => {
    expect(safeHref('/dashboard')).toBe('/dashboard')
    expect(safeHref('/quests/123?tab=tasks')).toBe('/quests/123?tab=tasks')
  })

  it('allows fragment and query-only links', () => {
    expect(safeHref('#section')).toBe('#section')
    expect(safeHref('?q=x')).toBe('?q=x')
  })

  it('allows http(s), mailto and tel URLs', () => {
    expect(safeHref('https://example.com/path')).toBe('https://example.com/path')
    expect(safeHref('mailto:a@b.com')).toBe('mailto:a@b.com')
    expect(safeHref('tel:+15555555555')).toBe('tel:+15555555555')
  })

  it('blocks javascript: and data: schemes', () => {
    expect(safeHref('javascript:alert(1)')).toBe('#')
    expect(safeHref('JavaScript:alert(1)')).toBe('#')
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBe('#')
    expect(safeHref('vbscript:msgbox(1)')).toBe('#')
  })

  it('blocks protocol-relative URLs', () => {
    expect(safeHref('//evil.com')).toBe('#')
  })

  it('returns the fallback for empty / nullish input', () => {
    expect(safeHref('')).toBe('#')
    expect(safeHref(null)).toBe('#')
    expect(safeHref(undefined)).toBe('#')
    expect(safeHref('   ')).toBe('#')
  })

  it('honors a custom fallback', () => {
    expect(safeHref('javascript:alert(1)', '/safe')).toBe('/safe')
  })
})
