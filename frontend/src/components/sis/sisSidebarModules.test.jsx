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

const withHidden = (mods, extraSettings = {}) =>
  ({ feature_flags: { sis_settings: { hidden_modules: mods, ...extraSettings } } })

beforeEach(() => { activeOrg = null })

describe('SisSidebar module gating for the active org', () => {
  it("hides the org's opted-out modules but keeps the rest", () => {
    // Gryffin: hides some modules and is goals-mode (so Goals shows).
    activeOrg = withHidden(['onboarding', 'timesheets', 'forms', 'clp'], { post_registration_flow: 'goals' })
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

  it('hides the Goals tab for a schedule-mode org (e.g. iCreate)', () => {
    // No post_registration_flow: 'goals' -> Goals tab must not appear.
    activeOrg = withHidden([])
    render(<MemoryRouter><SisSidebar /></MemoryRouter>)
    expect(screen.queryByText('Goals')).not.toBeInTheDocument()
    // Submissions is a general SIS tab and stays.
    expect(screen.getByText('Submissions')).toBeInTheDocument()
  })

  it('shows every non-goals module when the active org hides none', () => {
    activeOrg = withHidden([])
    render(<MemoryRouter><SisSidebar /></MemoryRouter>)
    // Forms and Onboarding are reached through the unified task surfaces now;
    // their own paths still work, they are just not separate nav items.
    expect(screen.getByText('My Tasks')).toBeInTheDocument()
    expect(screen.getByText('Task Center')).toBeInTheDocument()
    expect(screen.getByText('Billing')).toBeInTheDocument()
  })

  // CLP is OPT-IN, not opt-out: it is iCreate's workflow, and a school that
  // never runs a CLP meeting should not be told to finish one.
  it('hides CLP for an org that has not opted in', () => {
    activeOrg = withHidden([])
    render(<MemoryRouter><SisSidebar /></MemoryRouter>)
    expect(screen.queryByText('CLP')).not.toBeInTheDocument()
  })

  it('shows CLP once the org opts in', () => {
    activeOrg = withHidden([], { clp_enabled: true })
    render(<MemoryRouter><SisSidebar /></MemoryRouter>)
    expect(screen.getByText('CLP')).toBeInTheDocument()
  })

  it('keeps CLP hidden for an org that opted in but also hid the module', () => {
    // hidden_modules is a promise already made; opting in must not override it.
    activeOrg = withHidden(['clp'], { clp_enabled: true })
    render(<MemoryRouter><SisSidebar /></MemoryRouter>)
    expect(screen.queryByText('CLP')).not.toBeInTheDocument()
  })
})
