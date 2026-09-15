import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * "Switch to Learning app" at the top of the SIS console. Ten iCreate parents
 * hold a staff role; for them the learning app's /dashboard is family-scoped
 * and bounces to /family, so the button goes there directly (2026-09-15).
 */

let user = { role: 'superadmin' }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user }) }))
vi.mock('../../pages/sis/useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, loading: false, activeOrg: null }),
  withOrg: (p) => p,
}))
const { switchSurfaceInApp } = vi.hoisted(() => ({ switchSurfaceInApp: vi.fn() }))
vi.mock('../../utils/appSurface', () => ({ switchSurfaceInApp }))
vi.mock('./InboxUnreadBadge', () => ({ default: () => null }))

import SisSidebar from './SisSidebar'

beforeEach(() => vi.clearAllMocks())

const renderSidebar = () => render(<MemoryRouter><SisSidebar /></MemoryRouter>)

describe('Switch to Learning app', () => {
  it('sends a staff member with no family to their own dashboard', () => {
    user = { role: 'org_managed', org_roles: ['org_admin'] }
    renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: /Switch to Learning app/ }))
    expect(switchSurfaceInApp).toHaveBeenCalledWith('learning', '/dashboard')
  })

  it('sends a coordinator who is also a parent to the family home', () => {
    user = { role: 'org_managed', org_roles: ['campus_coordinator', 'parent'], has_dependents: true }
    renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: /Switch to Learning app/ }))
    expect(switchSurfaceInApp).toHaveBeenCalledWith('learning', '/family')
  })
})
