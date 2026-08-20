import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Task Center — the office's side of the unified tasks.
 *
 * The tabs are ordinary chrome; what is worth locking down is which endpoints a
 * given role's page talks to, because that is where the HR line is drawn on the
 * client. The server enforces it regardless (a coordinator's token cannot reach
 * the HR blueprint at all), so these tests are about not showing a coordinator a
 * page whose every call would 403.
 */

const authState = { user: { id: 'admin-1', role: 'org_managed', org_roles: ['org_admin'] } }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('./teacherPreview', () => ({
  getPreviewTeacher: () => null,
  withPreview: (p) => p,
  setPreviewTeacher: vi.fn(),
  clearPreviewTeacher: vi.fn(),
}))
vi.mock('../../components/sis/BackToDashboard', () => ({ default: () => null }))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import TaskCenterPage from './TaskCenterPage'

const BATCH = {
  batch_id: 'b1', title: 'Employee handbook', sent_at: '2026-08-14T00:00:00Z',
  sensitivity: 'general', signed_count: 1, total_count: 2,
  recipients: [
    { assignment_id: 'a1', user_id: 'kate', name: 'Kate Myers', audience: 'staff',
      signed: true, signed_name: 'Kate Myers', signed_at: '2026-08-15T00:00:00Z' },
    { assignment_id: 'a2', user_id: 'sam', name: 'Sam Teacher', audience: 'staff',
      signed: false },
  ],
}

const renderPage = (path = '/tasks?tab=paperwork') => render(
  <MemoryRouter initialEntries={[path]}><TaskCenterPage /></MemoryRouter>)

// All three ways of asking somebody to do something live behind one header
// menu, so nobody has to know which of the three tabs their work belongs to
// before they can start it.
const chooseFromMenu = async (label) => {
  fireEvent.click(await screen.findByRole('button', { name: /Assign or send/i }))
  fireEvent.click(await screen.findByRole('menuitem', { name: label }))
}

beforeEach(() => {
  vi.clearAllMocks()
  authState.user = { id: 'admin-1', role: 'org_managed', org_roles: ['org_admin'] }
  api.get.mockImplementation((url) => {
    if (url.includes('signature-requests')) return Promise.resolve({ data: { batches: [BATCH] } })
    return Promise.resolve({ data: {} })
  })
})

describe('tracking what has been sent', () => {
  it('shows a send with its signing progress', async () => {
    renderPage()
    expect(await screen.findByText('Employee handbook')).toBeInTheDocument()
    expect(screen.getByText('1/2 signed')).toBeInTheDocument()
  })

  it('names who has signed and who has not', async () => {
    renderPage()
    await screen.findByText('Employee handbook')
    expect(screen.getByText(/Signed by Kate Myers/)).toBeInTheDocument()
    expect(screen.getByText('Not signed yet')).toBeInTheDocument()
  })

  it('says so when nothing has been sent', async () => {
    api.get.mockImplementation((url) => (
      url.includes('signature-requests')
        ? Promise.resolve({ data: { batches: [] } })
        : Promise.resolve({ data: {} })))
    renderPage()
    expect(await screen.findByText(/Nothing sent for signature yet/i)).toBeInTheDocument()
  })
})

describe('which door the page uses', () => {
  const endpointsCalled = () => api.get.mock.calls.map(([u]) => u).filter((u) => u.includes('signature-requests'))

  it('an HR administrator reads the store that includes employment paperwork', async () => {
    renderPage()
    await waitFor(() => expect(endpointsCalled().length).toBeGreaterThan(0))
    expect(endpointsCalled()[0]).toContain('/api/sis/secure-documents/signature-requests')
  })

  it('a campus coordinator reads the front-office store instead', async () => {
    authState.user = { id: 'kate', role: 'org_managed', org_roles: ['campus_coordinator'] }
    renderPage()
    await waitFor(() => expect(endpointsCalled().length).toBeGreaterThan(0))
    expect(endpointsCalled()[0]).toContain('/api/sis/staff-admin/signature-requests')
  })

  it('a coordinator is not offered the HR sensitivity choice', async () => {
    authState.user = { id: 'kate', role: 'org_managed', org_roles: ['campus_coordinator'] }
    renderPage()
    await chooseFromMenu(/Send a document for signature/i)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByText(/administrators only/i)).not.toBeInTheDocument()
  })

  it('an HR administrator can mark a send as HR paperwork', async () => {
    renderPage()
    await chooseFromMenu(/Send a document for signature/i)
    expect(await screen.findByText(/administrators only/i)).toBeInTheDocument()
  })

  it('a coordinator cannot reach the HR door to chase a signature', async () => {
    authState.user = { id: 'kate', role: 'org_managed', org_roles: ['campus_coordinator'] }
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /^Remind$/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][0]).toContain('/api/sis/staff-admin/signature-requests/a2/remind')
  })
})

/**
 * One header menu for all three ways of assigning work. Before this, sending a
 * document was the only thing the page could start: filing a task meant leaving
 * for /forms, and assigning a checklist was buried mid-tab.
 */
describe('starting a piece of work', () => {
  it('offers all three from one menu', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Assign or send/i }))
    expect(await screen.findByRole('menuitem', { name: /New form, request, or task/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Assign a checklist/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Send a document for signature/i })).toBeInTheDocument()
  })

  it('files a request without leaving the page', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('signature-requests')) return Promise.resolve({ data: { batches: [BATCH] } })
      if (url.includes('/api/sis/teacher/forms')) {
        return Promise.resolve({ data: { form_types: { maintenance: 'Maintenance request' } } })
      }
      return Promise.resolve({ data: {} })
    })
    renderPage()
    await chooseFromMenu(/New form, request, or task/i)
    const dialog = await screen.findByRole('dialog', { name: /New form, request, or task/i })
    expect(dialog).toBeInTheDocument()
  })

  it('assigns a checklist from the same menu', async () => {
    renderPage()
    await chooseFromMenu(/Assign a checklist/i)
    expect(await screen.findByRole('dialog', { name: /Assign a checklist/i })).toBeInTheDocument()
  })
})

describe('chasing an unsigned document', () => {
  it('reminds one person who has not signed', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /^Remind$/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toContain('/api/sis/secure-documents/signature-requests/a2/remind')
    expect(body.organization_id).toBe('org-1')
  })

  it('offers no reminder to somebody who has already signed', async () => {
    renderPage()
    await screen.findByText(/Signed by Kate Myers/)
    // Two recipients, one signed: exactly one Remind button.
    expect(screen.getAllByRole('button', { name: /^Remind$/ })).toHaveLength(1)
  })

  it('leads with the sends that are still outstanding', async () => {
    const done = { ...BATCH, batch_id: 'b2', title: 'Fire drill policy', signed_count: 2, total_count: 2,
      recipients: BATCH.recipients.map((p) => ({ ...p, signed: true })) }
    api.get.mockImplementation((url) => (
      url.includes('signature-requests')
        ? Promise.resolve({ data: { batches: [BATCH, done] } })
        : Promise.resolve({ data: {} })))
    renderPage()
    expect(await screen.findByText('Employee handbook')).toBeInTheDocument()
    // A fully-signed send is finished business and would otherwise sit at the
    // top of the list forever, burying the one that still needs chasing.
    expect(screen.queryByText('Fire drill policy')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^All/ }))
    expect(await screen.findByText('Fire drill policy')).toBeInTheDocument()
  })
})

describe('the tabs', () => {
  it('opens on requests by default', async () => {
    renderPage('/tasks')
    expect(await screen.findByRole('button', { name: 'Requests' })).toBeInTheDocument()
    // The requests queue, not the paperwork list.
    await waitFor(() => expect(
      api.get.mock.calls.some(([u]) => u.includes('/api/sis/staff-admin/forms'))).toBe(true))
  })

  it('switches to the checklists tab', async () => {
    renderPage('/tasks')
    fireEvent.click(await screen.findByRole('button', { name: 'Checklists' }))
    await waitFor(() => expect(
      api.get.mock.calls.some(([u]) => u.includes('/onboarding/templates'))).toBe(true))
  })
})
