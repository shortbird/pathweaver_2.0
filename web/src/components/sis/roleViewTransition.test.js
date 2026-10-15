import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// A role view swaps the session's identity, so the page that started it is
// gated like a masquerade's (OPTIO-WEB-3J/3K/3M/3N/3P, 2026-10-15): an org
// admin opened "Parent (my own family)", pressed Back, and the cached console
// came back drawn as an admin while every admin call 403'd for the parent.

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })) }))
vi.mock('../../services/api', () => ({ default: apiMock }))
vi.mock('../../pages/sis/useSisOrg', () => ({ withOrg: (p) => p }))
vi.mock('../../services/masqueradeService', () => ({
  getMasqueradeState: vi.fn(() => null),
  startMasquerade: vi.fn(),
  exitMasquerade: vi.fn(),
}))

import { startRoleView, exitRoleView } from './RoleViewSwitcher'
import {
  handleMasqueradePageShow,
  isMasqueradeActiveOrPending,
  isMasqueradeTransitioning,
  resetMasqueradeGate,
} from '../../services/masqueradeGate'

let reload
const realLocation = window.location

beforeEach(() => {
  resetMasqueradeGate()
  reload = vi.fn()
  delete window.location
  window.location = { href: 'https://sis.optioeducation.com/', hostname: 'sis.optioeducation.com', search: '', reload }
})

afterEach(() => {
  window.location = realLocation
  resetMasqueradeGate()
})

describe('role view switches take the masquerade gate', () => {
  it('starting a role view pauses the page and quiets its 403s', async () => {
    await startRoleView('parent', null, '/family')
    expect(apiMock.post).toHaveBeenCalledWith('/api/role-view/parent', {})
    expect(isMasqueradeTransitioning()).toBe(true)
    expect(isMasqueradeActiveOrPending()).toBe(true)
    expect(window.location.href).toBe('/family')
  })

  it('a back/forward-cache restore after starting one reloads', async () => {
    await startRoleView('parent', null, '/family')
    expect(handleMasqueradePageShow({ persisted: true })).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('exiting one is gated the same way', async () => {
    await exitRoleView()
    expect(apiMock.post).toHaveBeenCalledWith('/api/role-view/exit', {})
    expect(isMasqueradeTransitioning()).toBe(true)
    expect(handleMasqueradePageShow({ persisted: true })).toBe(true)
  })

  it('a refused switch leaves the page live', async () => {
    apiMock.post.mockRejectedValueOnce(new Error('403'))
    await expect(startRoleView('parent')).rejects.toThrow()
    expect(isMasqueradeTransitioning()).toBe(false)
    expect(handleMasqueradePageShow({ persisted: true })).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
