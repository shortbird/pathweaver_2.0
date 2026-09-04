import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Task Center — organized by direction: Requests (what people send us),
 * Assigned (what we asked of people — tasks, checklists and signatures in ONE
 * list), Documents (the HR store).
 *
 * What is worth locking down: which endpoints a given role's page talks to
 * (that is where the HR line is drawn on the client — the server enforces it
 * regardless), that the unified Assigned list really carries all three kinds
 * of work, and that every tab name this page has ever had still lands
 * somewhere (old notification links say ?tab=paperwork).
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

const CHECKLIST_ASSIGNMENT = {
  id: 'ca1', user_name: 'Sam Teacher', template_id: 't1', template_name: 'New teacher onboarding',
  status: 'in_progress', done_count: 1, total_count: 3, created_at: '2026-08-20T00:00:00Z',
  items: [], audience: 'staff',
}

const ADHOC_TASK = {
  id: 'ta1', user_name: 'Kate Myers', template_id: null, template_name: 'Turn in your roster',
  status: 'in_progress', done_count: 0, total_count: 1, created_at: '2026-08-25T00:00:00Z',
  items: [], audience: 'staff',
}

const RECIPIENTS = [{ id: 'kate', name: 'Kate Myers' }, { id: 'sam', name: 'Sam Teacher' }]

const mockGets = (over = {}) => {
  api.get.mockImplementation((url) => {
    if (url.includes('signature-requests')) return Promise.resolve({ data: { batches: over.batches ?? [BATCH] } })
    if (url.includes('/onboarding/assignments')) return Promise.resolve({ data: { assignments: over.assignments ?? [] } })
    if (url.includes('/onboarding/recipients')) return Promise.resolve({ data: { recipients: RECIPIENTS } })
    if (url.includes('/onboarding/templates')) return Promise.resolve({ data: { templates: [] } })
    for (const [needle, data] of Object.entries(over.extra || {})) {
      if (url.includes(needle)) return Promise.resolve({ data })
    }
    return Promise.resolve({ data: {} })
  })
}

const renderPage = (path = '/tasks?tab=assigned') => render(
  <MemoryRouter initialEntries={[path]}><TaskCenterPage /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  authState.user = { id: 'admin-1', role: 'org_managed', org_roles: ['org_admin'] }
  mockGets()
})

describe('the assigned list carries all three kinds of work', () => {
  it('shows a signature send with its signing progress', async () => {
    renderPage()
    expect(await screen.findByText('Employee handbook')).toBeInTheDocument()
    expect(screen.getByText('1/2 signed')).toBeInTheDocument()
    expect(screen.getByText('Signature')).toBeInTheDocument()
  })

  it('names who has signed and who has not, with a reminder for the laggard', async () => {
    renderPage()
    await screen.findByText('Employee handbook')
    expect(screen.getByText(/Signed by Kate Myers/)).toBeInTheDocument()
    expect(screen.getByText('Not signed yet')).toBeInTheDocument()
    // Two recipients, one signed: exactly one Remind button.
    expect(screen.getAllByRole('button', { name: /^Remind$/ })).toHaveLength(1)
  })

  it('shows checklists and ad-hoc tasks in the same list, labeled apart', async () => {
    mockGets({ assignments: [CHECKLIST_ASSIGNMENT, ADHOC_TASK] })
    renderPage()
    expect(await screen.findByText('New teacher onboarding')).toBeInTheDocument()
    expect(screen.getByText('Turn in your roster')).toBeInTheDocument()
    expect(screen.getByText('Employee handbook')).toBeInTheDocument()
    expect(screen.getByText('Checklist')).toBeInTheDocument()
    expect(screen.getByText('Task')).toBeInTheDocument()
    expect(screen.getByText('Signature')).toBeInTheDocument()
  })

  it('defaults to outstanding and can show everything', async () => {
    const done = { ...BATCH, batch_id: 'b2', title: 'Fire drill policy', signed_count: 2, total_count: 2,
      recipients: BATCH.recipients.map((p) => ({ ...p, signed: true })) }
    mockGets({ batches: [BATCH, done] })
    renderPage()
    expect(await screen.findByText('Employee handbook')).toBeInTheDocument()
    // A fully-signed send is finished business and would otherwise sit at the
    // top of the list forever, burying the one that still needs chasing.
    expect(screen.queryByText('Fire drill policy')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^All/ }))
    expect(await screen.findByText('Fire drill policy')).toBeInTheDocument()
  })

  it('says so when nothing has been assigned', async () => {
    mockGets({ batches: [] })
    renderPage()
    expect(await screen.findByText(/Nothing assigned yet/i)).toBeInTheDocument()
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

  it('a coordinator reminds through the front-office door', async () => {
    authState.user = { id: 'kate', role: 'org_managed', org_roles: ['campus_coordinator'] }
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /^Remind$/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][0]).toContain('/api/sis/staff-admin/signature-requests/a2/remind')
  })
})

/**
 * One composer for everything the office assigns. It opens as the simplest
 * thing — a title and some people — and the options change what it is: steps
 * make it a checklist, an attached document makes it a signature send. Nobody
 * picks a noun first, which is what "requests, tasks, checklists, forms,
 * paperwork — no idea what does what" was about (2026-08-31).
 */
describe('the assign composer', () => {
  const openComposer = async () => {
    renderPage('/tasks?tab=assigned')
    fireEvent.click(await screen.findByRole('button', { name: /^Assign a task$/ }))
    return screen.findByRole('dialog', { name: /^Assign$/ })
  }

  it('assigns a plain task with a title, a due date and recipients', async () => {
    const dialog = await openComposer()
    const d = within(dialog)
    fireEvent.change(d.getByLabelText('Title'), {
      target: { value: 'Turn in your field trip roster' } })
    fireEvent.change(d.getByLabelText('Due date'), { target: { value: '2026-09-15' } })
    fireEvent.click(await d.findByText('Kate Myers'))
    fireEvent.click(d.getByRole('button', { name: /^Assign$/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/api/sis/staff-admin/onboarding/assignments')
    expect(body.title).toBe('Turn in your field trip roster')
    expect(body.due_date).toBe('2026-09-15')
    expect(body.audience).toBe('staff')
    expect(body.user_ids).toEqual(['kate'])
    expect(body.template_id).toBeUndefined()
  })

  it('adding steps turns it into a checklist', async () => {
    const dialog = await openComposer()
    const d = within(dialog)
    fireEvent.change(d.getByLabelText('Title'), { target: { value: 'Field trip prep' } })
    fireEvent.click(d.getByRole('button', { name: /Add steps/ }))
    fireEvent.change(d.getByLabelText('Step 1'), { target: { value: 'Collect permission slips' } })
    fireEvent.click(d.getByRole('button', { name: /Another step/ }))
    fireEvent.change(d.getByLabelText('Step 2'), { target: { value: 'Book the bus' } })
    fireEvent.click(await d.findByText('Kate Myers'))
    fireEvent.click(d.getByRole('button', { name: /^Assign$/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [, body] = api.post.mock.calls[0]
    expect(body.items).toEqual([
      { title: 'Collect permission slips', needs_document: false },
      { title: 'Book the bus', needs_document: false },
    ])
  })

  it('attaching a document turns it into a signature send', async () => {
    const dialog = await openComposer()
    const d = within(dialog)
    fireEvent.change(d.getByLabelText('Title'), { target: { value: 'Employee handbook' } })
    const file = new File(['pdf'], 'handbook.pdf', { type: 'application/pdf' })
    fireEvent.change(dialog.querySelector('input[type="file"]'), { target: { files: [file] } })
    // An HR administrator is offered the sensitivity choice; the send button
    // says what will actually happen.
    expect(await d.findByText(/administrators only/i)).toBeInTheDocument()
    fireEvent.click(await d.findByText('Kate Myers'))
    fireEvent.click(d.getByRole('button', { name: /Send for signature/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][0]).toContain('/api/sis/secure-documents/signature-requests')
  })

  it('a coordinator is never offered the HR sensitivity choice', async () => {
    authState.user = { id: 'kate', role: 'org_managed', org_roles: ['campus_coordinator'] }
    const dialog = await openComposer()
    const d = within(dialog)
    const file = new File(['pdf'], 'handbook.pdf', { type: 'application/pdf' })
    fireEvent.change(dialog.querySelector('input[type="file"]'), { target: { files: [file] } })
    expect(await d.findByText(/own copy/i)).toBeInTheDocument()
    expect(d.queryByText(/administrators only/i)).not.toBeInTheDocument()
  })

  it('will not assign with nobody picked', async () => {
    await openComposer()
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Do the thing' } })
    expect(screen.getByRole('button', { name: /^Assign$/ })).toBeDisabled()
  })

  it('offers the saved checklists one link away', async () => {
    await openComposer()
    fireEvent.click(screen.getByRole('button', { name: /Use a saved checklist/ }))
    expect(await screen.findByRole('dialog', { name: /Assign a checklist/i })).toBeInTheDocument()
  })
})

describe('starting a piece of work', () => {
  it('puts this tab\'s own action on the button', async () => {
    renderPage('/tasks?tab=assigned')
    expect(await screen.findByRole('button', { name: /^Assign a task$/ })).toBeInTheDocument()
  })

  it('changes the button with the tab', async () => {
    renderPage('/tasks?tab=requests')
    expect(await screen.findByRole('button', { name: /New request/i })).toBeInTheDocument()
  })

  it('keeps the other action one click away', async () => {
    renderPage('/tasks?tab=assigned')
    fireEvent.click(await screen.findByRole('button', { name: /Other things to assign or send/i }))
    expect(await screen.findByRole('menuitem', { name: /New request/i })).toBeInTheDocument()
    // The one already on the button is not repeated in the menu.
    expect(screen.queryByRole('menuitem', { name: /Assign a task/i })).not.toBeInTheDocument()
  })

  it('files a request without leaving the page', async () => {
    mockGets({ extra: { '/api/sis/teacher/forms': { form_types: { maintenance: 'Maintenance request' } } } })
    renderPage('/tasks?tab=requests')
    fireEvent.click(await screen.findByRole('button', { name: /New request/i }))
    expect(await screen.findByRole('dialog', { name: /New request/i })).toBeInTheDocument()
  })
})

describe('the tabs', () => {
  it('opens on requests by default', async () => {
    renderPage('/tasks')
    expect(await screen.findByRole('button', { name: 'Requests' })).toBeInTheDocument()
    await waitFor(() => expect(
      api.get.mock.calls.some(([u]) => u.includes('/api/sis/staff-admin/forms'))).toBe(true))
  })

  it('keeps form authoring collapsed under the queue it feeds', async () => {
    mockGets({ extra: { '/form-templates': { templates: [] } } })
    renderPage('/tasks?tab=requests')
    const manage = await screen.findByRole('button', { name: /Manage forms/i })
    // Collapsed: the builder is not on screen until asked for.
    expect(screen.queryByRole('button', { name: '+ New form' })).not.toBeInTheDocument()
    fireEvent.click(manage)
    expect(await screen.findByRole('button', { name: '+ New form' })).toBeInTheDocument()
  })

  it('opens the routing editor from the requests tab', async () => {
    mockGets({ extra: {
      '/form-routing': {
        routing: { substitute_request: 'julia-1' },
        form_types: { substitute_request: 'Substitute request' },
      },
      '/api/sis/staff': { staff: [{ id: 'julia-1', name: 'Julia' }] },
    } })
    renderPage('/tasks?tab=requests')
    fireEvent.click(await screen.findByRole('button', { name: /Where requests go/i }))
    expect(await screen.findByRole('dialog', { name: /Where forms go/i })).toBeInTheDocument()
    expect(await screen.findByLabelText('Who receives Substitute request')).toHaveValue('julia-1')
  })

  it('still answers every tab name this page has ever had', async () => {
    // ?tab=paperwork, ?tab=checklists and ?tab=tasks are in sent notifications
    // and bookmarks; all of that work lives on Assigned now.
    renderPage('/tasks?tab=paperwork')
    expect(await screen.findByText('Employee handbook')).toBeInTheDocument()
  })

  it('opens manage forms directly when landing on tab=forms', async () => {
    mockGets({ extra: { '/form-templates': { templates: [] } } })
    renderPage('/tasks?tab=forms')
    expect(await screen.findByRole('button', { name: '+ New form' })).toBeInTheDocument()
  })

  it('opens manage forms from the new form template action menu', async () => {
    mockGets({ extra: { '/form-templates': { templates: [] } } })
    renderPage('/tasks?tab=assigned')
    fireEvent.click(await screen.findByRole('button', { name: /Other things to assign or send/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /New form template/i }))
    expect(await screen.findByRole('button', { name: '+ New form' })).toBeInTheDocument()
  })
})

/**
 * Documents is the filing cabinet, and it is HR's: contracts and background
 * checks live there. A coordinator does not get an emptier version of the tab
 * — they get no tab, because signature tracking (the one thing they had on
 * the old paperwork tab) now lives on Assigned.
 */
describe('the documents tab', () => {
  it('shows the secure store to an HR administrator', async () => {
    renderPage('/tasks?tab=documents')
    expect(await screen.findByText('Upload a document')).toBeInTheDocument()
    await waitFor(() => expect(api.get.mock.calls.some(
      ([u]) => u.includes('/api/sis/secure-documents?'))).toBe(true))
  })

  it('does not exist for a campus coordinator', async () => {
    authState.user = { id: 'kate', role: 'org_managed', org_roles: ['campus_coordinator'] }
    renderPage('/tasks?tab=documents')
    // The tab is gone and the deep link falls back to Requests.
    expect(await screen.findByRole('button', { name: 'Requests' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Documents' })).not.toBeInTheDocument()
    expect(api.get.mock.calls.some(([u]) => u.includes('/api/sis/secure-documents?'))).toBe(false)
  })
})
