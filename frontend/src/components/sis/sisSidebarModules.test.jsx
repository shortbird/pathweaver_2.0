import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// A superadmin viewing an org whose feature_flags hide some SIS modules should
// see exactly that org's admin nav — hidden modules gone, kept modules present.
let activeOrg = null
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'superadmin' } }) }))
vi.mock('../../pages/sis/useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'gryffin', setOrgId: vi.fn(), orgs: [], isSuperadmin: true, loading: false, activeOrg }),
  withOrg: (p) => p,
}))
vi.mock('../../utils/appSurface', () => ({ switchSurfaceInApp: vi.fn() }))

import SisSidebar from './SisSidebar'

const withHidden = (mods) => ({ feature_flags: { sis_settings: { hidden_modules: mods } } })

beforeEach(() => { activeOrg = null })

describe('SisSidebar module gating for the active org', () => {
  it("hides the org's opted-out modules but keeps the rest", () => {
    activeOrg = withHidden(['onboarding', 'timesheets', 'forms', 'clp'])
    render(<MemoryRouter><SisSidebar /></MemoryRouter>)

    // Hidden for this org (Gryffin's config)
    expect(screen.queryByText('CLP')).not.toBeInTheDocument()
    expect(screen.queryByText('Forms')).not.toBeInTheDocument()
    expect(screen.queryByText('Onboarding')).not.toBeInTheDocument()
    expect(screen.queryByText('Timesheets')).not.toBeInTheDocument()
    expect(screen.queryByText('My Time')).not.toBeInTheDocument()

    // Kept — Billing stays because Gryffin's brain dump requires it
    expect(screen.getByText('Billing')).toBeInTheDocument()
    expect(screen.getByText('Classes')).toBeInTheDocument()
    expect(screen.getByText('Submissions')).toBeInTheDocument()
    expect(screen.getByText('Goals')).toBeInTheDocument()
  })

  it('shows every module when the active org hides none', () => {
    activeOrg = withHidden([])
    render(<MemoryRouter><SisSidebar /></MemoryRouter>)
    expect(screen.getByText('CLP')).toBeInTheDocument()
    expect(screen.getByText('Forms')).toBeInTheDocument()
    expect(screen.getByText('Billing')).toBeInTheDocument()
  })
})
