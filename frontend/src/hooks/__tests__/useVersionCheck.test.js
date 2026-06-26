import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchDeployedVersion } from '../useVersionCheck'

afterEach(() => { vi.restoreAllMocks() })

describe('fetchDeployedVersion', () => {
  it('returns the version field from version.json (no-store)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 'abc123' }) })
    vi.stubGlobal('fetch', fetchSpy)
    const v = await fetchDeployedVersion()
    expect(v).toBe('abc123')
    // cache-busted + no-store so a CDN/browser can't serve a stale version file
    const [url, opts] = fetchSpy.mock.calls[0]
    expect(url).toMatch(/\/version\.json\?ts=/)
    expect(opts.cache).toBe('no-store')
  })

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    await expect(fetchDeployedVersion()).rejects.toThrow()
  })
})
