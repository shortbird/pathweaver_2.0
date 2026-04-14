import { describe, it, expect, vi } from 'vitest'
import {
  extractErrorMessage,
  handleApiResponse,
  fetchWithErrorHandling,
} from '../errorHandling'

describe('extractErrorMessage', () => {
  it('picks structured error.message when present', () => {
    expect(
      extractErrorMessage({ error: { message: 'bad thing', code: 'X' } })
    ).toBe('bad thing')
  })

  it('picks string error when present', () => {
    expect(extractErrorMessage({ error: 'plain bad' })).toBe('plain bad')
  })

  it('falls back to message field', () => {
    expect(extractErrorMessage({ message: 'msg only' })).toBe('msg only')
  })

  it('uses default fallback when nothing present', () => {
    expect(extractErrorMessage({})).toBe('An error occurred')
  })

  it('uses custom fallback when provided and nothing present', () => {
    expect(extractErrorMessage({}, 'oops')).toBe('oops')
  })
})

describe('handleApiResponse', () => {
  it('no-ops when response.ok', () => {
    expect(() => handleApiResponse({ ok: true }, {})).not.toThrow()
  })

  it('throws with extracted message on !ok', () => {
    expect(() =>
      handleApiResponse({ ok: false }, { error: 'nope' }, 'req failed')
    ).toThrow('nope')
  })

  it('throws with fallback when no error in data', () => {
    expect(() => handleApiResponse({ ok: false }, {}, 'req failed')).toThrow(
      'req failed'
    )
  })
})

describe('fetchWithErrorHandling', () => {
  it('returns data on ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, payload: 1 }),
    })
    vi.stubGlobal('fetch', mockFetch)
    const result = await fetchWithErrorHandling('/x', { method: 'GET' })
    expect(result).toEqual({ success: true, payload: 1 })
    vi.unstubAllGlobals()
  })

  it('throws with extracted error on !ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'forbidden' }),
    })
    vi.stubGlobal('fetch', mockFetch)
    await expect(fetchWithErrorHandling('/x')).rejects.toThrow('forbidden')
    vi.unstubAllGlobals()
  })
})
