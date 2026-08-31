/**
 * The Checklists tab, ordered by how often an admin does each thing.
 *
 * It used to read in exactly the reverse order: authoring templates (rare) sat
 * at the top and injected a full inline editor when opened, assigning (weekly)
 * came next, and tracking (daily) was last. Worse, the one thing the tab exists
 * to surface — an item somebody has finished that is now waiting on the office
 * to approve — was reachable only by opening every person's checklist in turn.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', role: 'org_managed', org_roles: ['org_admin'] } }),
}))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import { AdminOnboarding } from './OnboardingPage'

const TEMPLATE = {
  id: 't1', name: 'Employee onboarding', audience: 'staff', role_type: 'employee',
  items: [{ title: 'Sign the handbook', needs_approval: true }],
}

// Sam has finished the background check and is waiting on the office; the
// handbook is done and needs nothing.
const ASSIGNMENT = {
  id: 'a1', user_name: 'Sam Teacher', template_name: 'Employee onboarding',
  status: 'in_progress', done_count: 2, total_count: 3,
  items: [
    { key: 'handbook', title: 'Read the handbook', status: 'approved', needs_approval: false },
    { key: 'bgcheck', title: 'Background check', status: 'complete', needs_approval: true },
    { key: 'w4', title: 'Submit a W-4', status: 'pending', needs_approval: true },
  ],
}

const mockData = ({ templates = [TEMPLATE], assignments = [ASSIGNMENT] } = {}) => {
  api.get.mockImplementation((url) => {
    if (url.includes('/onboarding/templates')) return Promise.resolve({ data: { templates } })
    if (url.includes('/onboarding/assignments')) return Promise.resolve({ data: { assignments } })
    if (url.includes('/onboarding/recipients')) {
      return Promise.resolve({ data: { recipients: [{ id: 'sam', name: 'Sam Teacher' }] } })
    }
    return Promise.resolve({ data: {} })
  })
}

const renderTab = (props = {}) => render(
  <MemoryRouter><AdminOnboarding orgId="org-1" {...props} /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  mockData()
})

describe('what needs the admin', () => {
  it('lifts items awaiting approval out of the collapsed rows', async () => {
    renderTab()
    const strip = (await screen.findByText(/Needs your review \(1\)/)).closest('div')
    // Finished and waiting on us.
    expect(within(strip).getByText('Background check')).toBeInTheDocument()
    expect(within(strip).getByText('Sam Teacher')).toBeInTheDocument()
    // Not finished, so not ours to act on yet.
    expect(within(strip).queryByText('Submit a W-4')).not.toBeInTheDocument()
  })

  it('approves straight from the review strip', async () => {
    renderTab()
    const strip = (await screen.findByText(/Needs your review/)).closest('div')
    fireEvent.click(within(strip).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    const [url, body] = api.patch.mock.calls[0]
    expect(url).toContain('/api/sis/teacher/onboarding/a1/items/bgcheck')
    expect(body.status).toBe('approved')
  })

  it('says nothing at all when nothing is waiting', async () => {
    mockData({ assignments: [{ ...ASSIGNMENT, items: [ASSIGNMENT.items[0]] }] })
    renderTab()
    await screen.findByText('Checklist progress')
    expect(screen.queryByText(/Needs your review/)).not.toBeInTheDocument()
  })

  it('reports the review count to the tab bar', async () => {
    const onCount = vi.fn()
    renderTab({ onCount })
    await waitFor(() => expect(onCount).toHaveBeenCalledWith(1))
  })
})

describe('where each job lives now', () => {
  it('keeps the rare job — authoring templates — closed', async () => {
    renderTab()
    await screen.findByText(/Checklist templates/)
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Checklist templates/ }))
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('edits a template over the page rather than inside it', async () => {
    renderTab()
    fireEvent.click(await screen.findByRole('button', { name: /Checklist templates/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    // A dialog, so the progress list underneath is not shoved off screen by a
    // form with one card per checklist item.
    expect(await screen.findByRole('dialog', { name: /Checklist template/i })).toBeInTheDocument()
  })

  it('assigns through a dialog', async () => {
    renderTab()
    fireEvent.click(await screen.findByRole('button', { name: /Assign a checklist/ }))
    expect(await screen.findByRole('dialog', { name: /Assign a checklist/i })).toBeInTheDocument()
  })
})

describe('removing a checklist', () => {
  it('keeps Unassign out of the row you click to expand', async () => {
    renderTab()
    await screen.findByText('Checklist progress')
    // "Sam Teacher" names them in the review strip too; the progress row is the
    // one wrapped in a <summary>.
    const summary = screen.getAllByText('Sam Teacher')
      .map((el) => el.closest('summary')).find(Boolean)
    // A destructive action a pixel from the expand target is a mis-click
    // waiting to happen; it lives in the body now.
    expect(within(summary).queryByText(/Unassign/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Unassign this checklist/ })).toBeInTheDocument()
  })
})

describe('checklist attachments', () => {
  // The whole reason the roll-up exists: Cassea uploaded her background check,
  // the item read "complete", and the office could not find the file anywhere
  // (iCreate, 2026-08-31). The item row now shows what was attached and opens
  // it through the admin door, which also knows about family buckets.
  it('opens what they uploaded through the admin doc-url', async () => {
    mockData({
      assignments: [{
        ...ASSIGNMENT, audience: 'staff',
        items: [{
          key: 'bgcheck', title: 'Background check', status: 'complete', needs_approval: false,
          documents: [{ path: 'org-1/sam/bg.pdf', filename: 'BackCkSam.pdf' }],
        }],
      }],
    })
    const base = api.get.getMockImplementation()
    api.get.mockImplementation((url) => (url.includes('/staff-admin/onboarding/doc-url')
      ? Promise.resolve({ data: { url: 'https://signed.example/bg.pdf' } })
      : base(url)))
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)

    renderTab()
    fireEvent.click(await screen.findByRole('button', { name: 'BackCkSam.pdf' }))

    await waitFor(() => expect(open).toHaveBeenCalledWith('https://signed.example/bg.pdf', '_blank', 'noopener'))
    const call = api.get.mock.calls.map(([u]) => u).find((u) => u.includes('doc-url'))
    expect(call).toContain(`path=${encodeURIComponent('org-1/sam/bg.pdf')}`)
    expect(call).toContain('audience=staff')
    open.mockRestore()
  })
})
