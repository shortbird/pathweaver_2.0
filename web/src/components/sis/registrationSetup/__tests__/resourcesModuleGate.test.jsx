import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import api from '../../../../services/api'
import RegistrationSetupTab from '../../RegistrationSetupTab'

/**
 * Ticket 9b96c2f7: the Registration setup tab read GET /api/sis/resources on
 * every visit and POSTed /api/sis/resources/reconcile-paperwork on every save,
 * whether or not the school had the Resources module. For a school with it
 * off, the ModuleGate answered 404 and logged a warning each time. The tab now
 * skips both calls when the org payload says the module is off.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'superadmin' } }),
}))
vi.mock('../../../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn(async () => true) }))
vi.mock('../../../../hooks/api/useSisSettings', () => ({
  patchSisSettings: vi.fn(() => Promise.resolve({})),
}))

const REG_CONFIG = {
  paperwork: [{ key: 'handbook', label: 'Family Handbook', body: 'Be kind.' }],
  questions: [],
  registration_fee_cents: 0,
  post_registration_flow: 'schedule',
}

vi.mock('../../../../services/api', async (importOriginal) => {
  const actual = await importOriginal()
  const get = vi.fn((url) => {
    if (url.includes('/invitations')) {
      return Promise.resolve({ data: { invitations: [
        { invitation_code: 'ABC123', role: 'parent', is_link: true, status: 'pending' },
      ] } })
    }
    if (url.includes('/api/sis/resources')) return Promise.resolve({ data: { resources: [] } })
    return Promise.resolve({ data: {} })
  })
  return {
    ...actual,
    default: {
      ...actual.default, get,
      post: vi.fn(() => Promise.resolve({ data: {} })),
      put: vi.fn(() => Promise.resolve({ data: {} })),
      patch: vi.fn(() => Promise.resolve({ data: {} })),
    },
  }
})

const orgData = (modules) => ({
  organization: {
    id: 'org-1', name: 'Test Academy',
    feature_flags: { registration: REG_CONFIG, sis_settings: {} },
    effective_modules: modules,
  },
})

const resourceCalls = (fn) => fn.mock.calls.filter(([url]) => url.includes('/api/sis/resources'))

const renderAndSave = async (modules) => {
  render(<RegistrationSetupTab orgId="org-1" orgData={orgData(modules)} onUpdate={vi.fn()} />)
  await screen.findByText('Your account')
  fireEvent.click(screen.getByText('Save registration settings'))
  const { toast } = await import('react-hot-toast')
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Registration settings saved'))
}

describe('registration setup and the Resources module (ticket 9b96c2f7)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('makes no resources request when the module is off', async () => {
    await renderAndSave(['sis_enabled', 'registration'])
    expect(resourceCalls(api.get)).toHaveLength(0)
    expect(resourceCalls(api.post)).toHaveLength(0)
  })

  it('reads linked paperwork and reconciles on save when the module is on', async () => {
    await renderAndSave(['sis_enabled', 'registration', 'resources'])
    expect(resourceCalls(api.get).length).toBeGreaterThan(0)
    expect(resourceCalls(api.post).map(([url]) => url)).toEqual([
      '/api/sis/resources/reconcile-paperwork?organization_id=org-1',
    ])
  })
})
