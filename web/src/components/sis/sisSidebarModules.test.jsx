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

// The badge polls two unread endpoints through react-query; these tests render
// the sidebar without a QueryClientProvider and only care about the nav items.
vi.mock('./InboxUnreadBadge', () => ({ default: () => null }))

// sis_enabled matters now: the module system cascades from the 'sis' block,
// so a no-SIS org correctly shows nothing (the console never renders for one).
const withHidden = (mods, extraSettings = {}) =>
  ({ feature_flags: { sis_enabled: true, sis_settings: { hidden_modules: mods, ...extraSettings } } })

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
    // 'timesheets' in the stored array is a key nothing registers any more
    // (the feature went on 2026-09-18) -- ignored, not an error.

    // Kept — Billing stays because Gryffin's brain dump requires it
    expect(screen.getByText('Billing')).toBeInTheDocument()
    // Submissions is a tab of Classes since 2026-09-17 (hidden there when the
    // module is off), so the entry is Classes.
    expect(screen.getByText('Classes')).toBeInTheDocument()
    expect(screen.getByText('Goals')).toBeInTheDocument()
  })

  it('hides the Goals tab for a schedule-mode org (e.g. iCreate)', () => {
    // No post_registration_flow: 'goals' -> Goals tab must not appear.
    activeOrg = withHidden([])
    render(<MemoryRouter><SisSidebar /></MemoryRouter>)
    expect(screen.queryByText('Goals')).not.toBeInTheDocument()
    // Classes (with Submissions as a tab) is a general SIS entry and stays.
    expect(screen.getByText('Classes')).toBeInTheDocument()
  })

  it('shows every non-goals module when the active org hides none', () => {
    activeOrg = withHidden([])
    render(<MemoryRouter><SisSidebar /></MemoryRouter>)
    // Forms, My Tasks, Onboarding and the Task Center are all reached through
    // the one Tasks page now (2026-09-17); their own paths still work, they
    // are just not separate nav items. The checklist people open on purpose
    // to read what they have already done (iCreate, 2026-09-10) is the "By
    // checklist" view there.
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.queryByText('Onboarding')).not.toBeInTheDocument()
    expect(screen.queryByText('Task Center')).not.toBeInTheDocument()
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
