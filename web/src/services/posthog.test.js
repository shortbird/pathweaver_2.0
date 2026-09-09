import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Regression guard for admin-masquerade tagging in PostHog.
 *
 * Before this fix, events fired during an admin masquerade session were
 * attributed to the target user in PostHog with no marker — admin
 * impersonation looked identical to real user activity, which made the
 * target user's "activity" in PostHog 100% noise after the first admin
 * poked around. See App.jsx's masquerade-status effect and the
 * setMasqueradeSuperProperties/clearMasqueradeSuperProperties helpers
 * in services/posthog.js.
 *
 * These tests use isolateModules so we can swap VITE_POSTHOG_KEY between
 * cases — the module caches the key at import time.
 */

const register = vi.fn()
const unregister = vi.fn()
const init = vi.fn()
const identify = vi.fn()
const reset = vi.fn()
const optOut = vi.fn()
const optIn = vi.fn()

vi.mock('posthog-js', () => ({
  default: {
    register,
    unregister,
    init,
    identify,
    reset,
    capture: vi.fn(),
    opt_out_capturing: optOut,
    opt_in_capturing: optIn,
  },
}))

async function loadModuleWithKey(key) {
  vi.resetModules()
  register.mockReset()
  unregister.mockReset()
  init.mockReset()
  identify.mockReset()
  reset.mockReset()
  optOut.mockReset()
  optIn.mockReset()
  if (key === null) {
    vi.stubEnv('VITE_POSTHOG_KEY', '')
  } else {
    vi.stubEnv('VITE_POSTHOG_KEY', key)
  }
  return await import('./posthog')
}

describe('posthog masquerade super-properties', () => {
  beforeEach(() => {
    register.mockClear()
    unregister.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('setMasqueradeSuperProperties tags subsequent events with is_masquerade and admin id', async () => {
    const { setMasqueradeSuperProperties } = await loadModuleWithKey('phc_test_key')

    setMasqueradeSuperProperties({
      adminId: 'admin-uuid-1',
      targetUserId: 'target-uuid-2',
    })

    expect(register).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalledWith({
      is_masquerade: true,
      masquerading_admin_id: 'admin-uuid-1',
      masquerade_target_user_id: 'target-uuid-2',
    })
  })

  it('setMasqueradeSuperProperties coerces missing ids to null so PostHog filters stay consistent', async () => {
    const { setMasqueradeSuperProperties } = await loadModuleWithKey('phc_test_key')

    setMasqueradeSuperProperties({})

    expect(register).toHaveBeenCalledWith({
      is_masquerade: true,
      masquerading_admin_id: null,
      masquerade_target_user_id: null,
    })
  })

  it('clearMasqueradeSuperProperties unregisters every masquerade flag', async () => {
    const { clearMasqueradeSuperProperties } = await loadModuleWithKey('phc_test_key')

    clearMasqueradeSuperProperties()

    // All three super-property keys must be unregistered, so a stale
    // `is_masquerade=true` cookie from a prior session can't leak into
    // subsequent real-user events.
    expect(unregister).toHaveBeenCalledWith('is_masquerade')
    expect(unregister).toHaveBeenCalledWith('masquerading_admin_id')
    expect(unregister).toHaveBeenCalledWith('masquerade_target_user_id')
    expect(unregister).toHaveBeenCalledTimes(3)
  })

  it('is a no-op in local dev (no VITE_POSTHOG_KEY)', async () => {
    const mod = await loadModuleWithKey(null)

    mod.setMasqueradeSuperProperties({ adminId: 'x', targetUserId: 'y' })
    mod.clearMasqueradeSuperProperties()

    expect(register).not.toHaveBeenCalled()
    expect(unregister).not.toHaveBeenCalled()
  })
})

/**
 * COPPA guards on what reaches PostHog.
 *
 * identifyUser is handed the whole /auth/me user object by AuthContext, and it
 * used to forward the email and the assembled display name — for students and
 * for parent-created child profiles alike, despite the file's "COPPA-safe"
 * comments. The stripping has to happen HERE rather than at the call sites:
 * there are five of them, they are owned elsewhere, and a guarantee that
 * depends on every future caller remembering to pre-strip is not a guarantee.
 */
describe('posthog identify does not leak PII', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const adult = {
    id: 'user-uuid-1',
    role: 'parent',
    org_role: null,
    organization_id: 'org-1',
    subscription_tier: 'supported',
    email: 'parent@example.com',
    first_name: 'Ada',
    last_name: 'Byron',
    display_name: 'Ada Byron',
  }

  it('identifies by opaque id and non-identifying enums only', async () => {
    const { identifyUser } = await loadModuleWithKey('phc_test_key')

    identifyUser(adult)

    expect(identify).toHaveBeenCalledWith('user-uuid-1', {
      role: 'parent',
      org_role: null,
      organization_id: 'org-1',
      subscription_tier: 'supported',
    })
  })

  it('sends no property that could name or contact the user', async () => {
    const { identifyUser } = await loadModuleWithKey('phc_test_key')

    identifyUser(adult)

    const properties = identify.mock.calls[0][1]
    const serialized = JSON.stringify(properties)
    for (const key of ['email', 'display_name', 'first_name', 'last_name', 'name', 'username']) {
      expect(properties).not.toHaveProperty(key)
    }
    expect(serialized).not.toContain('parent@example.com')
    expect(serialized).not.toContain('Ada')
    expect(serialized).not.toContain('Byron')
  })

  it('turns capture off entirely for a dependent (child) account', async () => {
    const { identifyUser } = await loadModuleWithKey('phc_test_key')

    identifyUser({ ...adult, is_dependent: true })

    expect(identify).not.toHaveBeenCalled()
    expect(optOut).toHaveBeenCalled()
    expect(reset).toHaveBeenCalled()
  })

  it('turns capture off for an under-13 account', async () => {
    const { identifyUser } = await loadModuleWithKey('phc_test_key')

    identifyUser({ ...adult, requires_parental_consent: true })

    expect(identify).not.toHaveBeenCalled()
    expect(optOut).toHaveBeenCalled()
  })

  it('re-enables capture when an adult signs in after a child on the same browser', async () => {
    const { identifyUser } = await loadModuleWithKey('phc_test_key')

    identifyUser({ ...adult, is_dependent: true })
    identifyUser(adult)

    expect(optIn).toHaveBeenCalled()
    expect(identify).toHaveBeenCalledTimes(1)
  })

  it('is a no-op in local dev (no VITE_POSTHOG_KEY)', async () => {
    const { identifyUser } = await loadModuleWithKey(null)

    identifyUser(adult)
    identifyUser({ ...adult, is_dependent: true })

    expect(identify).not.toHaveBeenCalled()
    expect(optOut).not.toHaveBeenCalled()
  })
})

describe('posthog session replay settings', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('masks rendered text as well as inputs, and honors Do Not Track', async () => {
    const { initPostHog } = await loadModuleWithKey('phc_test_key')

    initPostHog()

    const [, options] = init.mock.calls[0]
    // maskAllInputs alone left the replay showing everything the page RENDERED:
    // student names, journal entries, evidence write-ups.
    expect(options.session_recording.maskAllInputs).toBe(true)
    expect(options.session_recording.maskAllText).toBe(true)
    expect(options.respect_dnt).toBe(true)
  })
})
