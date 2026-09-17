import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The teacher dashboard asks for a phone number until it has one.
 *
 * iCreate, 2026-09-02: "I think we need to force the teachers to enter their
 * phone numbers too!" Nothing had ever asked staff for one, so the office had
 * no way to reach a teacher who did not turn up. The prompt has no dismiss and
 * saves inline — sending someone to My Profile for one field is how a prompt
 * gets ignored for a term.
 */

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('./useSisOrg', async (importOriginal) => ({
  ...(await importOriginal()),
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, loading: false, activeOrg: null }),
}))

const { api, state } = vi.hoisted(() => {
  const state = { dashboard: {} }
  return {
    state,
    api: {
      get: vi.fn((url) => Promise.resolve(
        url.includes('/engagement-alerts') ? { data: { success: true, alerts: [] } }
          : url.includes('/teacher/dashboard') ? { data: { data: state.dashboard } }
            : { data: {} })),
      post: vi.fn(() => Promise.resolve({ data: { success: true } })),
      patch: vi.fn(() => Promise.resolve({ data: { success: true } })),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import TeacherDashboard from './TeacherDashboard'

const base = { today: [], classes: [], profile: {}, recent_forms: [], pending_acks: [] }

beforeEach(() => {
  state.dashboard = { ...base, needs_phone: true }
  vi.clearAllMocks()
})

describe('TeacherDashboard — phone prompt', () => {
  it('asks when there is no number on file', async () => {
    render(<TeacherDashboard orgId="org-1" userName="Nicole" />)
    expect(await screen.findByText('Add your phone number')).toBeInTheDocument()
  })

  it('stays out of the way once a number is on file', async () => {
    state.dashboard = { ...base, needs_phone: false }
    render(<TeacherDashboard orgId="org-1" userName="Nicole" />)
    await screen.findByText(/Welcome, Nicole/)
    expect(screen.queryByText('Add your phone number')).not.toBeInTheDocument()
  })

  it('sends the teacher to My Profile, focused on the phone field', async () => {
    // The dashboard used to save the number itself, a fourth place a phone
    // could be edited; the field lives on My Profile now (M13c).
    render(<TeacherDashboard orgId="org-1" userName="Nicole" />)
    expect(await screen.findByRole('link', { name: 'Add it on My Profile' }))
      .toHaveAttribute('href', '/my-profile?focus=phone')
    expect(screen.queryByLabelText('Your phone number')).not.toBeInTheDocument()
  })


  // An admin previewing a teacher would save the number onto their own record.
  it('never asks while previewing another teacher', async () => {
    render(<TeacherDashboard orgId="org-1" userName="Marika"
      preview={{ id: 't2', name: 'Nicole' }} />)
    await screen.findByText(/Welcome, Marika/)
    expect(screen.queryByText('Add your phone number')).not.toBeInTheDocument()
  })
})
