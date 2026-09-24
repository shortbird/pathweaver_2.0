import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

// The Tasks page reads the office's tasks, schedules and templates through
// hooks/api (QF-03), so it needs a QueryClient. Fresh client per render keeps
// one test's cache out of the next one's; retry:false makes a failed query
// fail the assertion instead of hanging on backoff.
const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

/**
 * The office's side of the one Tasks page -- organized by direction: My tasks
 * (what is waiting on me), Assigned (what we asked of people: one card per
 * task with how many are done, documents out for signature, and repeating
 * tasks with their grid), Templates (saved tasks to assign again). The last
 * two exist only for admins.
 *
 * Everything the school asks of anybody is a task since 2026-09-24 (iCreate
 * meeting 2026-09-23). Requests and forms are gone, and so is the Requests
 * tab; a checklist is a task with steps. My documents and Secure documents
 * moved to the Library, and their old ?tab= links redirect there.
 *
 * What is worth locking down: which endpoints a given role's page talks to
 * (that is where the HR line is drawn on the client -- the server enforces it
 * regardless), what the one composer sends for each shape of task, that the
 * Assigned list really carries every kind of work, and that no retired noun
 * is left on the page.
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
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import TasksPage from './TasksPage'

const SIG_BATCH = {
  batch_id: 'b1', title: 'Employee handbook', sent_at: '2026-08-14T00:00:00Z',
  sensitivity: 'general', signed_count: 1, total_count: 2,
  recipients: [
    { assignment_id: 'a1', user_id: 'kate', name: 'Kate Myers', audience: 'staff',
      signed: true, signed_name: 'Kate Myers', signed_at: '2026-08-15T00:00:00Z' },
    { assignment_id: 'a2', user_id: 'sam', name: 'Sam Teacher', audience: 'staff',
      signed: false },
  ],
}

const FINISHED_AT = '2026-08-21T15:30:00Z'

// A multi-step task sent to two people (what a checklist was): Kate is done,
// Sam has one of three steps.
const ONBOARDING_BATCH = {
  key: 'batch-onb', title: 'New teacher onboarding', audiences: ['staff'], priority: null,
  action: 'do', due_date: null, assigned_by_name: 'Ada Admin', created_at: '2026-08-20T00:00:00Z',
  done: 1, total: 2, awaiting_review: 0, outstanding: true,
  people: [
    { id: 'ca1', user_id: 'kate', user_name: 'Kate Myers', title: 'New teacher onboarding',
      audience: 'staff', status: 'done', native_status: 'complete', done_count: 3, total_count: 3,
      finished_at: FINISHED_AT,
      items: [
        { key: 'badge', title: 'Pick up your badge', status: 'complete' },
        { key: 'w4', title: 'W-4', status: 'complete', needs_document: true },
        { key: 'handbook', title: 'Sign the handbook', status: 'complete', needs_signature: true,
          signature: { name: 'Kate Myers', signed_at: '2026-08-21T15:30:00Z' } },
      ] },
    { id: 'ca2', user_id: 'sam', user_name: 'Sam Teacher', title: 'New teacher onboarding',
      audience: 'staff', status: 'in_progress', native_status: 'in_progress', done_count: 1,
      total_count: 3, finished_at: null,
      items: [
        { key: 'badge', title: 'Pick up your badge', status: 'complete' },
        { key: 'w4', title: 'W-4', status: 'pending', needs_document: true },
        { key: 'handbook', title: 'Sign the handbook', status: 'pending', needs_signature: true },
      ] },
  ],
}

// A one-step task to one person.
const ROSTER_BATCH = {
  key: 'batch-roster', title: 'Turn in your roster', audiences: ['staff'], priority: 'high',
  action: 'do', due_date: '2026-09-01', assigned_by_name: 'Ada Admin',
  created_at: '2026-08-25T00:00:00Z', done: 0, total: 1, awaiting_review: 0, outstanding: true,
  people: [
    { id: 'ta1', user_id: 'sam', user_name: 'Sam Teacher', title: 'Turn in your roster',
      audience: 'staff', status: 'todo', native_status: 'pending', done_count: 0, total_count: 1,
      finished_at: null,
      items: [{ key: 'roster', title: 'Turn in your roster', status: 'pending' }] },
  ],
}

const SCHEDULE = {
  id: 's1', title: 'Lunch duty sign-in', days_label: 'Mon, Wed, Fri', recipient_count: 2,
  start_date: '2026-09-01', end_date: null, state: 'active', created_at: '2026-08-30T00:00:00Z',
}

const GRID = {
  dates: ['2026-09-21', '2026-09-23'],
  people: [{ id: 'kate', name: 'Kate Myers' }],
  cells: {
    'kate:2026-09-21': { status: 'expired' },
    'kate:2026-09-23': { status: 'done', finished_at: '2026-09-23T12:00:00Z' },
  },
}

const STAFF = [{ id: 'kate', name: 'Kate Myers' }, { id: 'sam', name: 'Sam Teacher' }]
const FAMILIES = [{ id: 'fam1', name: 'Rose Family' }]
const STUDENTS = [{ id: 'stu1', name: 'Hattie Student' }, { id: 'stu2', name: 'Frankie Student' }]

const TEMPLATES = [{
  id: 'tmpl-1', name: 'Field trip prep', audience: 'staff', description: 'Before the zoo trip',
  items: [
    { key: 'slips', title: 'Collect permission slips', needs_document: true, required: true },
    { key: 'bus', title: 'Book the bus', needs_approval: true, required: false },
  ],
}]

const MY_TASKS = [{
  id: 't-sign', type: 'task', title: 'Staff agreement', status: 'todo', native_status: 'pending',
  action: 'do', done_count: 0, total_count: 2,
  items: [
    { key: 'read', title: 'Read the agreement', status: 'pending', required: true },
    { key: 'sign', title: 'Sign it', status: 'pending', required: true, needs_signature: true,
      sign_docs: [{ id: 'doc-1', title: 'Agreement.pdf' }] },
  ],
}]

const mockGets = (over = {}) => {
  api.get.mockImplementation((url) => {
    for (const [needle, data] of Object.entries(over.extra || {})) {
      if (url.includes(needle)) return Promise.resolve({ data })
    }
    if (url.includes('signature-requests')) return Promise.resolve({ data: { batches: over.sigBatches ?? [SIG_BATCH] } })
    if (url.startsWith('/api/sis/tasks/assigned')) return Promise.resolve({ data: { batches: over.batches ?? [] } })
    if (url.startsWith('/api/sis/tasks/schedules/s1/grid')) return Promise.resolve({ data: GRID })
    if (url.startsWith('/api/sis/tasks/schedules')) return Promise.resolve({ data: { schedules: over.schedules ?? [] } })
    if (url.startsWith('/api/sis/my-tasks')) {
      return Promise.resolve({ data: { tasks: over.myTasks ?? [], counts: { open: (over.myTasks ?? []).length } } })
    }
    if (url.includes('/onboarding/recipients?audience=student&class_id=c-robo')) {
      return Promise.resolve({ data: { recipients: [STUDENTS[0]] } })
    }
    if (url.includes('/onboarding/recipients?audience=staff')) return Promise.resolve({ data: { recipients: STAFF } })
    if (url.includes('/onboarding/recipients?audience=family')) return Promise.resolve({ data: { recipients: FAMILIES } })
    if (url.includes('/onboarding/recipients?audience=student')) return Promise.resolve({ data: { recipients: STUDENTS } })
    if (url.includes('/onboarding/templates')) return Promise.resolve({ data: { templates: over.templates ?? [] } })
    if (url.includes('/onboarding/assignments')) return Promise.resolve({ data: { assignments: [] } })
    if (url.startsWith('/api/sis/classes')) {
      return Promise.resolve({ data: { classes: [{ id: 'c-robo', name: 'Robotics' }] } })
    }
    return Promise.resolve({ data: {} })
  })
}

const Where = () => {
  const loc = useLocation()
  return <div data-testid="where">{loc.pathname}{loc.search}</div>
}

const renderPage = (path = '/tasks?tab=assigned') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/tasks" element={<TasksPage />} />
      <Route path="/library" element={<Where />} />
    </Routes>
  </MemoryRouter>)

// A send's title on its card. The same words also name each person's own card
// inside it (in a muted span), so match the card's title span.
const CARD_TITLE = 'summary > span.font-medium'

const fmtWhen = (iso) => new Date(iso).toLocaleString(undefined,
  { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

beforeEach(() => {
  vi.clearAllMocks()
  authState.user = { id: 'admin-1', role: 'org_managed', org_roles: ['org_admin'] }
  api.post.mockResolvedValue({ data: {} })
  api.patch.mockResolvedValue({ data: {} })
  mockGets()
})

describe('the assigned list carries every kind of work', () => {
  it('shows a signature send with its signing progress', async () => {
    renderPage()
    expect(await screen.findByText('Employee handbook')).toBeInTheDocument()
    expect(screen.getByText('1/2 signed')).toBeInTheDocument()
    expect(screen.getByText('To sign')).toBeInTheDocument()
  })

  it('names who has signed and who has not, with a reminder for the laggard', async () => {
    renderPage()
    await screen.findByText('Employee handbook')
    expect(screen.getByText(/Signed by Kate Myers/)).toBeInTheDocument()
    expect(screen.getByText('Not signed yet')).toBeInTheDocument()
    // Two recipients, one signed: exactly one Remind button.
    expect(screen.getAllByRole('button', { name: /^Remind$/ })).toHaveLength(1)
  })

  it('shows one card per task with how many are done', async () => {
    mockGets({ batches: [ONBOARDING_BATCH], sigBatches: [] })
    renderPage()
    const title = await screen.findByText('New teacher onboarding', { selector: CARD_TITLE })
    const card = title.closest('details')
    expect(within(card).getByText('1 of 2 done')).toBeInTheDocument()
  })

  it('opens a task card onto each person\'s status and when they finished', async () => {
    mockGets({ batches: [ONBOARDING_BATCH], sigBatches: [] })
    renderPage()
    await screen.findByText('New teacher onboarding', { selector: CARD_TITLE })
    const table = screen.getByRole('table')
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['Person', 'Status', 'Steps', 'Finished'])
    const [, kate, sam] = within(table).getAllByRole('row')
    expect(within(kate).getByText('Kate Myers')).toBeInTheDocument()
    expect(within(kate).getByText('Done')).toBeInTheDocument()
    expect(within(kate).getByText('3 of 3')).toBeInTheDocument()
    expect(within(kate).getByText(fmtWhen(FINISHED_AT))).toBeInTheDocument()
    expect(within(sam).getByText('Sam Teacher')).toBeInTheDocument()
    expect(within(sam).getByText('In progress')).toBeInTheDocument()
    expect(within(sam).getByText('1 of 3')).toBeInTheDocument()
    // Not finished, so no finished time.
    expect(within(sam).getAllByRole('cell')[3]).toHaveTextContent('')
  })

  // iCreate, 2026-09-01: "what happened to the checklists?" One list is still
  // right, but the kinds have to be visible in it, and picking one is also the
  // sort the same admin asked for on the same day.
  it('narrows the one list to one kind of work', async () => {
    mockGets({ batches: [ROSTER_BATCH], schedules: [SCHEDULE] })
    renderPage()
    await screen.findByText('Turn in your roster', { selector: CARD_TITLE })
    const roster = () => screen.queryByText('Turn in your roster', { selector: CARD_TITLE })

    fireEvent.click(screen.getByRole('button', { name: 'Tasks (1)' }))
    expect(roster()).toBeInTheDocument()
    expect(screen.queryByText('Employee handbook')).not.toBeInTheDocument()
    expect(screen.queryByText('Lunch duty sign-in')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Signatures (1)' }))
    expect(screen.getByText('Employee handbook')).toBeInTheDocument()
    expect(roster()).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Repeating (1)' }))
    expect(screen.getByText('Lunch duty sign-in')).toBeInTheDocument()
    expect(screen.queryByText('Employee handbook')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Every kind' }))
    expect(roster()).toBeInTheDocument()
    expect(screen.getByText('Employee handbook')).toBeInTheDocument()
  })

  it('does not call an empty kind "everything is done" while other work is outstanding', async () => {
    mockGets({ batches: [ROSTER_BATCH], sigBatches: [] })
    renderPage()
    await screen.findByText('Turn in your roster', { selector: CARD_TITLE })

    fireEvent.click(screen.getByRole('button', { name: 'Repeating (0)' }))

    expect(screen.queryByText('Turn in your roster', { selector: CARD_TITLE })).not.toBeInTheDocument()
    // Sam's roster is still outstanding, so "everything is done" is untrue.
    expect(screen.queryByText('Everything assigned is done.')).not.toBeInTheDocument()
  })

  it('defaults to outstanding and can show everything', async () => {
    const done = { ...SIG_BATCH, batch_id: 'b2', title: 'Fire drill policy', signed_count: 2, total_count: 2,
      recipients: SIG_BATCH.recipients.map((p) => ({ ...p, signed: true })) }
    mockGets({ sigBatches: [SIG_BATCH, done] })
    renderPage()
    expect(await screen.findByText('Employee handbook')).toBeInTheDocument()
    // A fully-signed send is finished business and would otherwise sit at the
    // top of the list forever, burying the one that still needs chasing.
    expect(screen.queryByText('Fire drill policy')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^All/ }))
    expect(await screen.findByText('Fire drill policy')).toBeInTheDocument()
  })

  it('says so when nothing has been assigned', async () => {
    mockGets({ sigBatches: [] })
    renderPage()
    expect(await screen.findByText(/Nothing assigned yet/i)).toBeInTheDocument()
  })
})

describe('a repeating task', () => {
  it('pauses from its row', async () => {
    mockGets({ schedules: [SCHEDULE], sigBatches: [] })
    renderPage()
    await screen.findByText('Lunch duty sign-in')
    expect(screen.getByText('Mon, Wed, Fri')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/tasks/schedules/s1', { organization_id: 'org-1', active: false }))
  })

  it('resumes a paused one', async () => {
    mockGets({ schedules: [{ ...SCHEDULE, state: 'paused' }], sigBatches: [] })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Resume' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/tasks/schedules/s1', { organization_id: 'org-1', active: true }))
  })

  it('opens onto its grid of days and people', async () => {
    mockGets({ schedules: [SCHEDULE], sigBatches: [] })
    renderPage()
    const row = await screen.findByRole('button', { name: 'Lunch duty sign-in' })
    expect(screen.queryByText('Missed')).not.toBeInTheDocument()
    fireEvent.click(row)
    expect(await screen.findByText('Missed')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByText('Kate Myers')).toBeInTheDocument()
    expect(api.get.mock.calls.some(([u]) => u.startsWith('/api/sis/tasks/schedules/s1/grid'))).toBe(true)
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
 * thing -- a title and some people -- and the options change what it is:
 * steps make it a multi-step task, an attached document makes it a signature
 * send, Repeat makes it a daily duty. Nobody picks a noun first, which is what
 * "requests, tasks, checklists, forms, paperwork -- no idea what does what"
 * was about (2026-08-31).
 */
describe('the assign composer', () => {
  const openComposer = async (over) => {
    if (over) mockGets(over)
    renderPage('/tasks?tab=assigned')
    fireEvent.click(await screen.findByRole('button', { name: /^Assign a task$/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Assign a task' })
    await within(dialog).findByText('Kate Myers')
    return dialog
  }
  const lastTaskPost = () => api.post.mock.calls.filter(([u]) => u === '/api/sis/tasks').at(-1)

  it('assigns a plain task with a title, a due date and recipients', async () => {
    const dialog = await openComposer()
    const d = within(dialog)
    fireEvent.change(d.getByLabelText('Title'), {
      target: { value: 'Turn in your field trip roster' } })
    fireEvent.change(d.getByLabelText('Due date'), { target: { value: '2026-09-15' } })
    fireEvent.click(d.getByText('Kate Myers'))
    fireEvent.click(d.getByRole('button', { name: /^Assign$/ }))
    await waitFor(() => expect(lastTaskPost()).toBeTruthy())
    const [, body] = lastTaskPost()
    expect(body).toMatchObject({
      organization_id: 'org-1',
      title: 'Turn in your field trip roster',
      due_date: '2026-09-15',
      recipients: [{ id: 'kate', audience: 'staff' }],
      blocks_access: false,
      needs_document: false,
    })
    expect(body.items).toBeUndefined()
    expect(body.repeat).toBeUndefined()
    expect(body.save_as_template).toBeUndefined()
  })

  it('sends each step with what that step asks for', async () => {
    const dialog = await openComposer()
    const d = within(dialog)
    fireEvent.change(d.getByLabelText('Title'), { target: { value: 'Field trip prep' } })
    fireEvent.click(d.getByRole('button', { name: /Add steps/ }))
    fireEvent.change(d.getByLabelText('Step 1'), { target: { value: 'Sign the permission slip' } })
    fireEvent.click(d.getByLabelText('Step 1: They sign it'))
    fireEvent.click(d.getByRole('button', { name: /Another step/ }))
    fireEvent.change(d.getByLabelText('Step 2'), { target: { value: 'Upload the bus quote' } })
    fireEvent.click(d.getByLabelText('Step 2: They upload a file'))
    fireEvent.click(d.getByLabelText('Step 2: Office approves it'))
    fireEvent.click(d.getByText('Kate Myers'))
    fireEvent.click(d.getByRole('button', { name: /^Assign$/ }))
    await waitFor(() => expect(lastTaskPost()).toBeTruthy())
    const [, body] = lastTaskPost()
    expect(body.items).toEqual([
      expect.objectContaining({ title: 'Sign the permission slip', required: true,
        needs_signature: true, needs_document: false, needs_approval: false }),
      expect.objectContaining({ title: 'Upload the bus quote', required: true,
        needs_signature: false, needs_document: true, needs_approval: true }),
    ])
    expect(body.needs_document).toBeUndefined()
  })

  it('repeats on the weekdays picked, with no due date', async () => {
    const dialog = await openComposer()
    const d = within(dialog)
    fireEvent.change(d.getByLabelText('Title'), { target: { value: 'Lunch duty sign-in' } })
    fireEvent.click(d.getByLabelText('Repeat'))
    // Each day's task is due that day, so the task-level date goes away.
    expect(d.queryByLabelText('Due date')).not.toBeInTheDocument()
    const days = within(d.getByRole('group', { name: 'Days' }))
    // Weekdays by default; make it Mon, Wed, Fri.
    expect(days.getByRole('button', { name: 'Tue' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(days.getByRole('button', { name: 'Tue' }))
    fireEvent.click(days.getByRole('button', { name: 'Thu' }))
    expect(days.getByRole('button', { name: 'Tue' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.change(d.getByLabelText('Starts'), { target: { value: '2026-09-28' } })
    fireEvent.change(d.getByLabelText('Ends'), { target: { value: '2026-12-18' } })
    fireEvent.click(d.getByText('Kate Myers'))
    fireEvent.click(d.getByRole('button', { name: 'Save repeating task' }))
    await waitFor(() => expect(lastTaskPost()).toBeTruthy())
    const [, body] = lastTaskPost()
    expect(body.repeat).toEqual({ days_of_week: [0, 2, 4], start_date: '2026-09-28', end_date: '2026-12-18' })
    expect('due_date' in body).toBe(false)
  })

  it('lists students on their own tab and sends them as students', async () => {
    const dialog = await openComposer()
    const d = within(dialog)
    fireEvent.change(d.getByLabelText('Title'), { target: { value: 'Bring your lab notebook' } })
    fireEvent.click(d.getByRole('button', { name: /^Students/ }))
    expect(await d.findByText('Hattie Student')).toBeInTheDocument()
    expect(d.getByText('Frankie Student')).toBeInTheDocument()
    fireEvent.click(d.getByText('Hattie Student'))
    expect(d.getByRole('button', { name: 'Students (1)' })).toBeInTheDocument()
    fireEvent.click(d.getByRole('button', { name: /^Assign$/ }))
    await waitFor(() => expect(lastTaskPost()).toBeTruthy())
    expect(lastTaskPost()[1].recipients).toEqual([{ id: 'stu1', audience: 'student' }])
  })

  it('picks a class of students at once', async () => {
    const dialog = await openComposer()
    const d = within(dialog)
    fireEvent.click(d.getByRole('button', { name: /^Students/ }))
    await d.findByText('Frankie Student')
    fireEvent.change(await d.findByLabelText('Pick a class'), { target: { value: 'c-robo' } })
    await waitFor(() => expect(d.queryByText('Frankie Student')).not.toBeInTheDocument())
    expect(d.getByLabelText('Select Hattie Student')).toBeChecked()
    expect(d.getByRole('button', { name: 'Students (1)' })).toBeInTheDocument()
  })

  it('offers the hold only for families, and never on a repeating task', async () => {
    const dialog = await openComposer()
    const d = within(dialog)
    const hold = () => d.queryByText('Require this before they can use Optio')
    fireEvent.change(d.getByLabelText('Title'), { target: { value: 'Enrollment packet' } })
    fireEvent.click(d.getByRole('button', { name: /Add steps/ }))
    fireEvent.change(d.getByLabelText('Step 1'), { target: { value: 'Upload proof of address' } })
    // Staff only: a teacher is not locked out of their classroom over paperwork.
    fireEvent.click(d.getByText('Kate Myers'))
    expect(hold()).not.toBeInTheDocument()

    fireEvent.click(d.getByRole('button', { name: /^Families/ }))
    fireEvent.click(await d.findByText('Rose Family'))
    expect(hold()).toBeInTheDocument()
    fireEvent.click(hold())

    fireEvent.click(d.getByLabelText('Repeat'))
    expect(hold()).not.toBeInTheDocument()
    fireEvent.click(d.getByLabelText('Repeat'))
    // Turning Repeat off again does not quietly bring back a tick nobody saw.
    fireEvent.click(d.getByRole('button', { name: /^Assign$/ }))
    await waitFor(() => expect(lastTaskPost()).toBeTruthy())
    expect(lastTaskPost()[1].blocks_access).toBe(false)
  })

  it('sends the hold when it is ticked', async () => {
    const dialog = await openComposer()
    const d = within(dialog)
    fireEvent.change(d.getByLabelText('Title'), { target: { value: 'Enrollment packet' } })
    fireEvent.click(d.getByRole('button', { name: /Add steps/ }))
    fireEvent.change(d.getByLabelText('Step 1'), { target: { value: 'Upload proof of address' } })
    fireEvent.click(d.getByRole('button', { name: /^Families/ }))
    fireEvent.click(await d.findByText('Rose Family'))
    fireEvent.click(d.getByText('Require this before they can use Optio'))
    fireEvent.click(d.getByRole('button', { name: /^Assign$/ }))
    await waitFor(() => expect(lastTaskPost()).toBeTruthy())
    const [, body] = lastTaskPost()
    expect(body.blocks_access).toBe(true)
    expect(body.recipients).toEqual([{ id: 'fam1', audience: 'family' }])
  })

  it('fills the title and steps from a template', async () => {
    const dialog = await openComposer({ templates: TEMPLATES })
    const d = within(dialog)
    fireEvent.change(await d.findByLabelText('Start from a template'), { target: { value: 'tmpl-1' } })
    expect(d.getByLabelText('Title')).toHaveValue('Field trip prep')
    expect(d.getByLabelText('Directions')).toHaveValue('Before the zoo trip')
    expect(d.getByLabelText('Step 1')).toHaveValue('Collect permission slips')
    expect(d.getByLabelText('Step 1: They upload a file')).toBeChecked()
    expect(d.getByLabelText('Step 2')).toHaveValue('Book the bus')
    expect(d.getByLabelText('Step 2: Office approves it')).toBeChecked()
    // A template is already saved; offering to save it again would duplicate it.
    expect(d.queryByText('Save as a template')).not.toBeInTheDocument()
    fireEvent.click(d.getByText('Kate Myers'))
    fireEvent.click(d.getByRole('button', { name: /^Assign$/ }))
    await waitFor(() => expect(lastTaskPost()).toBeTruthy())
    const [, body] = lastTaskPost()
    expect(body.items.map((i) => [i.title, i.needs_document, i.needs_approval, i.required])).toEqual([
      ['Collect permission slips', true, false, true],
      ['Book the bus', false, true, false],
    ])
  })

  it('saves what it sends as a template when asked', async () => {
    const dialog = await openComposer()
    const d = within(dialog)
    fireEvent.change(d.getByLabelText('Title'), { target: { value: 'Classroom opening checks' } })
    fireEvent.click(d.getByText('Kate Myers'))
    fireEvent.click(d.getByText('Save as a template'))
    fireEvent.click(d.getByRole('button', { name: /^Assign$/ }))
    await waitFor(() => expect(lastTaskPost()).toBeTruthy())
    expect(lastTaskPost()[1].save_as_template).toBe(true)
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
    fireEvent.click(d.getByText('Kate Myers'))
    fireEvent.click(d.getByRole('button', { name: /Send for signature/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, form] = api.post.mock.calls[0]
    expect(url).toContain('/api/sis/secure-documents/signature-requests')
    expect(form.get('file')).toBe(file)
    expect(form.getAll('staff_user_id')).toEqual(['kate'])
    expect(api.post.mock.calls.some(([u]) => u === '/api/sis/tasks')).toBe(false)
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
    const dialog = await openComposer()
    const d = within(dialog)
    fireEvent.change(d.getByLabelText('Title'), { target: { value: 'Do the thing' } })
    expect(d.getByRole('button', { name: /^Assign$/ })).toBeDisabled()
  })

  it('lands on Assigned after sending', async () => {
    api.post.mockResolvedValue({ data: { assigned: 1, batch_id: 'b9' } })
    renderPage('/tasks')
    fireEvent.click(await screen.findByRole('button', { name: /^Assign a task$/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Assign a task' })
    const d = within(dialog)
    fireEvent.change(d.getByLabelText('Title'), { target: { value: 'Do the thing' } })
    fireEvent.click(await d.findByText('Kate Myers'))
    fireEvent.click(d.getByRole('button', { name: /^Assign$/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('tab', { name: 'Assigned' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('the tabs', () => {
  it('opens on My tasks by default, with the office tabs beside it', async () => {
    renderPage('/tasks')
    expect(await screen.findByRole('tab', { name: 'My tasks' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('tab').map((t) => t.textContent.trim())).toEqual(['My tasks', 'Assigned', 'Templates'])
    // The office's count is fetched for the badge even while the admin is
    // looking at their own inbox.
    await waitFor(() => expect(
      api.get.mock.calls.some(([u]) => u.startsWith('/api/sis/tasks/assigned'))).toBe(true))
  })

  it('badges Assigned with the steps waiting on the office', async () => {
    mockGets({ batches: [
      { ...ROSTER_BATCH, awaiting_review: 2 }, { ...ONBOARDING_BATCH, awaiting_review: 1 },
    ] })
    renderPage('/tasks')
    const tab = await screen.findByRole('tab', { name: /Assigned/ })
    await waitFor(() => expect(tab).toHaveTextContent('3'))
  })

  it('has no Requests tab and no "New request" anywhere', async () => {
    renderPage('/tasks?tab=requests')
    // An old Requests link lands on My tasks.
    expect(await screen.findByRole('tab', { name: 'My tasks' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('tab', { name: /Requests/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/New request/i)).not.toBeInTheDocument()
    expect(api.get.mock.calls.some(([u]) => u.includes('/forms'))).toBe(false)

    fireEvent.click(screen.getByRole('tab', { name: 'Assigned' }))
    await screen.findByText('Employee handbook')
    expect(screen.queryByText(/New request/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Requests/ })).not.toBeInTheDocument()
  })

  it('opens the template library outright on Templates', async () => {
    mockGets({ templates: TEMPLATES })
    renderPage('/tasks?tab=templates')
    // An accordion behind a tab called Templates is one click of nothing
    // (iCreate 51efdb7c).
    expect(await screen.findByText('Field trip prep')).toBeInTheDocument()
    expect(screen.getByText('Task templates')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '+ New template' }))
    expect(await screen.findByRole('dialog', { name: 'Task template' })).toBeInTheDocument()
    expect(screen.getByText('New task template')).toBeInTheDocument()
  })

  it('lands a retired tab name on My tasks rather than nowhere', async () => {
    // ?tab=paperwork was a tab once; a bookmark may still say so.
    renderPage('/tasks?tab=paperwork')
    expect(await screen.findByRole('tab', { name: 'My tasks' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('Employee handbook')).not.toBeInTheDocument()
  })
})

/**
 * Secure documents is the filing cabinet, and it is HR's: contracts and
 * background checks live there. It moved to the Library's Documents area on
 * 2026-09-24 with My documents; the Library decides who may see it
 * (libraryPage.test), and Tasks only forwards the old links.
 */
describe('the documents that moved to the Library', () => {
  it('sends ?tab=secure to the secure store in the Library', async () => {
    renderPage('/tasks?tab=secure')
    expect(await screen.findByTestId('where')).toHaveTextContent('/library?tab=documents&docs=secure')
    expect(api.get.mock.calls.some(([u]) => u.includes('/api/sis/secure-documents?'))).toBe(false)
  })

  it('sends ?tab=documents to My documents in the Library', async () => {
    renderPage('/tasks?tab=documents')
    expect(await screen.findByTestId('where')).toHaveTextContent('/library?tab=documents&docs=mine')
  })

  it('offers neither as a tab here', async () => {
    renderPage('/tasks')
    await screen.findByRole('tab', { name: 'My tasks' })
    expect(screen.queryByRole('tab', { name: /documents/i })).not.toBeInTheDocument()
  })
})

/**
 * iCreate, 2026-09-05: "Can you make the task center pages sortable so it is
 * easier to find what one is looking for?"
 */
describe('finding one thing in the assigned list', () => {
  it('defaults to newest first', async () => {
    mockGets({ batches: [ONBOARDING_BATCH, ROSTER_BATCH], sigBatches: [] })
    renderPage()
    const roster = await screen.findByText('Turn in your roster', { selector: CARD_TITLE })
    const onboarding = screen.getByText('New teacher onboarding', { selector: CARD_TITLE })
    // The roster (Aug 25) precedes the onboarding (Aug 20).
    expect(roster.compareDocumentPosition(onboarding) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('sorts oldest first and by title', async () => {
    mockGets({ batches: [ONBOARDING_BATCH, ROSTER_BATCH], sigBatches: [] })
    renderPage()
    await screen.findByText('Turn in your roster', { selector: CARD_TITLE })
    const order = () => screen.getAllByText(/^(Turn in your roster|New teacher onboarding)$/, { selector: CARD_TITLE })
      .map((el) => el.textContent)
    fireEvent.change(screen.getByLabelText('Sort assigned tasks'), { target: { value: 'oldest' } })
    expect(order()).toEqual(['New teacher onboarding', 'Turn in your roster'])
    fireEvent.change(screen.getByLabelText('Sort assigned tasks'), { target: { value: 'title' } })
    expect(order()).toEqual(['New teacher onboarding', 'Turn in your roster'])
    fireEvent.change(screen.getByLabelText('Sort assigned tasks'), { target: { value: 'newest' } })
    expect(order()).toEqual(['Turn in your roster', 'New teacher onboarding'])
  })

  it('narrows to one person by name', async () => {
    mockGets({ batches: [ONBOARDING_BATCH, ROSTER_BATCH], sigBatches: [] })
    renderPage()
    await screen.findByText('Turn in your roster', { selector: CARD_TITLE })
    fireEvent.change(screen.getByLabelText('Search assigned tasks'), { target: { value: 'kate' } })
    expect(screen.getByText('New teacher onboarding', { selector: CARD_TITLE })).toBeInTheDocument()
    expect(screen.queryByText('Turn in your roster', { selector: CARD_TITLE })).not.toBeInTheDocument()
  })

  it('finds a signature send by the document it went out under', async () => {
    mockGets({ batches: [ROSTER_BATCH] })
    renderPage()
    await screen.findByText('Employee handbook')
    fireEvent.change(screen.getByLabelText('Search assigned tasks'), { target: { value: 'handbook' } })
    expect(screen.getByText('Employee handbook')).toBeInTheDocument()
    expect(screen.queryByText('Turn in your roster', { selector: CARD_TITLE })).not.toBeInTheDocument()
  })

  it('says the search came up empty rather than looking finished', async () => {
    mockGets({ batches: [ROSTER_BATCH], sigBatches: [] })
    renderPage()
    await screen.findByText('Turn in your roster', { selector: CARD_TITLE })
    fireEvent.change(screen.getByLabelText('Search assigned tasks'), { target: { value: 'zzz' } })
    expect(screen.getByText('Nothing here matches "zzz".')).toBeInTheDocument()
  })
})

/**
 * iCreate meeting 2026-09-23: everything is a task, and the page never says
 * "checklist" (or "request", or "form") for one. The word survives in code
 * and comments; this is about what a person reads.
 */
describe('the words on the page', () => {
  it('never says checklist on My tasks or Assigned', async () => {
    mockGets({
      myTasks: MY_TASKS, batches: [ONBOARDING_BATCH, ROSTER_BATCH], schedules: [SCHEDULE],
      templates: TEMPLATES,
    })
    renderPage('/tasks')
    await screen.findByText('Staff agreement')
    expect(document.body.textContent).not.toMatch(/checklist/i)

    fireEvent.click(screen.getByRole('tab', { name: /Assigned/ }))
    await screen.findByText('New teacher onboarding', { selector: CARD_TITLE })
    // Open every card, so what is inside them is read too.
    document.querySelectorAll('details').forEach((el) => { el.open = true })
    expect(document.body.textContent).not.toMatch(/checklist/i)

    fireEvent.click(screen.getByRole('button', { name: /^Assign a task$/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Assign a task' })
    fireEvent.click(within(dialog).getByRole('button', { name: /Add steps/ }))
    expect(document.body.textContent).not.toMatch(/checklist/i)
    expect(document.body.textContent).not.toMatch(/\brequests?\b/i)
  })
})
