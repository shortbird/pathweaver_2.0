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

vi.mock('posthog-js', () => ({
  default: { register, unregister, init: vi.fn(), identify: vi.fn(), reset: vi.fn(), capture: vi.fn() },
}))

async function loadModuleWithKey(key) {
  vi.resetModules()
  register.mockReset()
  unregister.mockReset()
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
