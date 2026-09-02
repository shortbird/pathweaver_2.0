import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./api', () => ({
  default: { post: vi.fn() },
  tokenStore: {
    getAccessToken: vi.fn().mockReturnValue(null),
    getRefreshToken: vi.fn().mockReturnValue('parent-refresh'),
    setTokens: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../utils/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

import api, { tokenStore } from './api'
import {
  restoreActingAs,
  hasStoredActingAs,
  clearStoredActingAs,
  resetActingAsRestore,
} from './actingAsRestore'

const CHILD = { id: 'dep-1', display_name: 'Pip' }

/**
 * Sentry OPTIO-WEB-C. Acting as a dependent ends in a full page reload, and the
 * acting-as token is memory-only, so the reload starts with only the parent's
 * httpOnly cookie. If /api/auth/me answers before the child's token is minted,
 * the app renders the PARENT's home and then runs its parent-only queries under
 * the CHILD's token: /api/dependents/my-dependents 403s with "Only parent
 * accounts can manage dependent profiles", on the parent's own dashboard, once
 * per reload for as long as they stay inside the child's account.
 *
 * These cover the ordering guarantee AuthContext depends on, and the shape of
 * the answer it awaits.
 */
describe('actingAsRestore', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
    resetActingAsRestore()
    tokenStore.getRefreshToken.mockReturnValue('parent-refresh')
  })

  it('resolves to null and calls nothing when nobody is acting as anybody', async () => {
    expect(hasStoredActingAs()).toBe(false)
    await expect(restoreActingAs()).resolves.toBeNull()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('installs the dependent token before it resolves', async () => {
    sessionStorage.setItem('acting_as_dependent', JSON.stringify(CHILD))
    api.post.mockResolvedValue({ data: { acting_as_token: 'child-token' } })

    const restored = await restoreActingAs()

    expect(api.post).toHaveBeenCalledWith('/api/dependents/dep-1/act-as', {})
    // The guarantee AuthContext relies on: by the time the promise settles the
    // token store already answers as the child, so /api/auth/me does too.
    expect(tokenStore.setTokens).toHaveBeenCalledWith('child-token', 'parent-refresh')
    expect(restored).toEqual({ dependent: CHILD, token: 'child-token' })
  })

  it('mints once no matter how many callers await it', async () => {
    sessionStorage.setItem('acting_as_dependent', JSON.stringify(CHILD))
    api.post.mockResolvedValue({ data: { acting_as_token: 'child-token' } })

    const [a, b] = await Promise.all([restoreActingAs(), restoreActingAs()])

    expect(api.post).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })

  it('drops the state and resolves null when the parent is no longer authorized', async () => {
    sessionStorage.setItem('acting_as_dependent', JSON.stringify(CHILD))
    sessionStorage.setItem('acting_as_parent_name', 'Robin')
    api.post.mockRejectedValue(new Error('403'))

    // Never rejects: "not acting as anybody" is a valid state, and a boot
    // sequence that throws here would strand the parent on a blank page.
    await expect(restoreActingAs()).resolves.toBeNull()
    expect(sessionStorage.getItem('acting_as_dependent')).toBeNull()
    expect(sessionStorage.getItem('acting_as_parent_name')).toBeNull()
    expect(tokenStore.setTokens).not.toHaveBeenCalled()
  })

  it('treats a response with no token as a failure rather than a session', async () => {
    sessionStorage.setItem('acting_as_dependent', JSON.stringify(CHILD))
    api.post.mockResolvedValue({ data: {} })

    await expect(restoreActingAs()).resolves.toBeNull()
    expect(tokenStore.setTokens).not.toHaveBeenCalled()
  })

  it('purges an acting-as token left in storage by an older build', async () => {
    // FE-M12: a JWT in web storage is stealable by any XSS, which here means
    // child-account impersonation for the token's lifetime.
    sessionStorage.setItem('acting_as_token', 'legacy-jwt')

    await restoreActingAs()

    expect(sessionStorage.getItem('acting_as_token')).toBeNull()
  })

  it('mints again after the parent stops acting as the child', async () => {
    sessionStorage.setItem('acting_as_dependent', JSON.stringify(CHILD))
    api.post.mockResolvedValue({ data: { acting_as_token: 'child-token' } })
    await restoreActingAs()

    clearStoredActingAs()
    sessionStorage.setItem('acting_as_dependent', JSON.stringify({ id: 'dep-2' }))
    api.post.mockResolvedValue({ data: { acting_as_token: 'other-child-token' } })

    // Without clearing the shared promise the second switch would resolve to
    // the first child's token and act as the wrong kid.
    const again = await restoreActingAs()
    expect(again.token).toBe('other-child-token')
    expect(api.post).toHaveBeenLastCalledWith('/api/dependents/dep-2/act-as', {})
  })
})
