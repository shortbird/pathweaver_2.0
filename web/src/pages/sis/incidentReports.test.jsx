import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

/**
 * Report an incident -- back as a staff tool that files a task.
 *
 * Katrine Myers (iCreate campus coordinator), 2026-09-24, ticket
 * a26d9daf-27b3-489e-9412-558c7ed02d55: "Reporting an incident used to be in
 * task manager. I don't see it there anymore. Cameron Stobbe is the second
 * child to get his finger smashed in the big glass doors. I need to get that
 * in an incident report."
 *
 * Four of the five incident reports on record were filed by teachers, so the
 * button is on the Tasks page for every staff member, not just the office's
 * tabs. The form asks what the old one asked, lands on an office person
 * (the school's default from Settings), and says where it went.
 */

const { auth, api } = vi.hoisted(() => ({
  auth: { user: null },
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }))
vi.mock('./teacherPreview', () => ({
  getPreviewTeacher: () => null,
  withPreview: (p) => p,
  setPreviewTeacher: vi.fn(),
  clearPreviewTeacher: vi.fn(),
}))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('../../components/sis/BackToDashboard', () => ({ default: () => null }))
vi.mock('../../services/api', () => ({ default: api }))

import TasksPage from './TasksPage'
import IncidentReportsCard from '../../settings/cards/IncidentReportsCard'

const TEACHER = { id: 'jamie', role: 'org_managed', org_roles: ['advisor'] }
const COORDINATOR = { id: 'katrine', role: 'org_managed', org_roles: ['campus_coordinator'] }

const OPTIONS = {
  success: true,
  recipients: [
    { id: 'katrine', name: 'Katrine Myers', role_labels: ['Campus Coordinator'] },
    { id: 'molly', name: 'Molly Christensen', role_labels: ['Org Admin'] },
  ],
  students: [
    { id: 'cameron', name: 'Cameron Stobbe' },
    { id: 'clark', name: 'Clark Bailey' },
  ],
}

let options = OPTIONS
let filed = []

beforeEach(() => {
  vi.clearAllMocks()
  options = { ...OPTIONS, default_recipient_id: 'katrine' }
  filed = []
  auth.user = TEACHER
  api.get.mockImplementation((url) => {
    if (url.startsWith('/api/sis/my-tasks')) {
      return Promise.resolve({ data: { tasks: [], counts: { open: 0 } } })
    }
    if (url.startsWith('/api/sis/incident-reports/options')) return Promise.resolve({ data: options })
    if (url.startsWith('/api/sis/incident-reports/mine')) return Promise.resolve({ data: { reports: filed } })
    return Promise.resolve({ data: {} })
  })
  api.post.mockResolvedValue({ data: {
    success: true, recipient_name: 'Katrine Myers',
    task: { id: 't-new', title: 'Incident report: Cameron Stobbe' },
  } })
  api.patch.mockResolvedValue({ data: { feature_flags: {} } })
})

const renderPage = () => render(
  <MemoryRouter initialEntries={['/tasks']}>
    <Routes><Route path="/tasks" element={<TasksPage />} /></Routes>
  </MemoryRouter>)

const openForm = async () => {
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: 'Report an incident' }))
  return screen.findByLabelText('What happened')
}

const pickFrom = (placeholder, label) => {
  fireEvent.focus(screen.getByPlaceholderText(placeholder))
  fireEvent.mouseDown(within(screen.getByTestId('search-select-menu')).getByText(label))
}

describe('the button is there for every staff member', () => {
  it('a teacher, who sees only My tasks, has it', async () => {
    auth.user = TEACHER
    renderPage()
    expect(await screen.findByRole('button', { name: 'Report an incident' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Assign a task' })).not.toBeInTheDocument()
  })

  it('a coordinator has it beside Assign a task', async () => {
    auth.user = COORDINATOR
    renderPage()
    expect(await screen.findByRole('button', { name: 'Report an incident' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Assign a task' })).toBeInTheDocument()
  })
})

describe('the form', () => {
  it('the office person defaults to the school setting', async () => {
    await openForm()
    expect(screen.getByDisplayValue('Katrine Myers (Campus Coordinator)')).toBeInTheDocument()
  })

  it('refuses to file without saying what happened', async () => {
    await openForm()
    fireEvent.click(screen.getByRole('button', { name: 'File report' }))
    expect(await screen.findByText('Say what happened.')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('with no default the reporter has to pick who gets it', async () => {
    options = { ...OPTIONS, default_recipient_id: null }
    await openForm()
    fireEvent.change(screen.getByLabelText('What happened'), { target: { value: 'Finger in the door' } })
    fireEvent.click(screen.getByRole('button', { name: 'File report' }))
    expect(await screen.findByText('Choose who in the office gets this report.')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('the time it happened starts at now and is required', async () => {
    await openForm()
    const when = screen.getByLabelText('When it happened')
    expect(when.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    fireEvent.change(when, { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('What happened'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'File report' }))
    expect(await screen.findByText('Give the date and time it happened.')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('files the report with every answer, then says where it went', async () => {
    await openForm()
    pickFrom('Find a student', 'Cameron Stobbe')
    expect(within(screen.getByRole('list', { name: 'Students on this report' }))
      .getByText('Cameron Stobbe')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('When it happened'), { target: { value: '2026-09-24T10:30' } })
    fireEvent.change(screen.getByLabelText('Where'), { target: { value: 'The big glass doors' } })
    fireEvent.change(screen.getByLabelText('What happened'),
      { target: { value: 'Cameron got his finger smashed in the big glass doors.' } })
    fireEvent.change(screen.getByLabelText('Injury or body part'), { target: { value: 'Right index finger' } })
    fireEvent.change(screen.getByLabelText('First aid or response given'), { target: { value: 'Ice pack' } })
    fireEvent.click(screen.getByLabelText('Yes'))
    fireEvent.change(screen.getByLabelText('How and when the parent was notified'),
      { target: { value: 'Called his mom at 10:45' } })
    fireEvent.change(screen.getByLabelText('Witnesses'), { target: { value: 'Clark Bailey' } })
    fireEvent.click(screen.getByRole('button', { name: 'File report' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/api/sis/incident-reports')
    expect(body).toEqual({
      organization_id: 'org-1',
      student_ids: ['cameron'],
      occurred_at: '2026-09-24T10:30',
      location: 'The big glass doors',
      what_happened: 'Cameron got his finger smashed in the big glass doors.',
      injury: 'Right index finger',
      response: 'Ice pack',
      parent_notified: 'yes',
      parent_notified_detail: 'Called his mom at 10:45',
      witnesses: 'Clark Bailey',
      recipient_id: 'katrine',
    })
    const done = await screen.findByTestId('incident-filed')
    expect(done).toHaveTextContent('Report filed.')
    expect(done).toHaveTextContent("Katrine Myers's task list")
    expect(done).toHaveTextContent('Incident report: Cameron Stobbe')
  })

  it('a refusal from the server is shown, not swallowed', async () => {
    api.post.mockRejectedValueOnce({ response: { data: { error: 'One of those students is not at this school' } } })
    await openForm()
    fireEvent.change(screen.getByLabelText('What happened'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'File report' }))
    expect(await screen.findByText('One of those students is not at this school')).toBeInTheDocument()
  })
})

describe('the reporter finds it again', () => {
  it('lists the reports they filed on My tasks', async () => {
    filed = [{ id: 't1', title: 'Incident report: Clark Bailey', status: 'done', user_name: 'Katrine Myers',
      created_at: '2026-09-10T12:00:00Z', description: 'What happened: Finger in the door' }]
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Incident reports you filed' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Incident report: Clark Bailey'))
    expect(screen.getByText('What happened: Finger in the door')).toBeInTheDocument()
  })

  it('shows nothing when they have filed none', async () => {
    renderPage()
    await waitFor(() => expect(api.get.mock.calls.some(([u]) => u.startsWith('/api/sis/incident-reports/mine'))).toBe(true))
    expect(screen.queryByRole('heading', { name: 'Incident reports you filed' })).not.toBeInTheDocument()
  })
})

describe('the settings card', () => {
  it('saves the default office person as one sis_settings key', async () => {
    render(<IncidentReportsCard orgId="org-1" org={{ feature_flags: { sis_settings: {} } }} />)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      '/api/sis/incident-reports/options?students=0&organization_id=org-1'))
    const save = await screen.findByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    pickFrom('Nobody by default (the reporter chooses)', 'Molly Christensen (Org Admin)')
    fireEvent.click(save)
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/settings?organization_id=org-1',
      { sis_settings: { incident_report_recipient_id: 'molly' } }))
  })

  it('shows the stored default', async () => {
    render(<IncidentReportsCard orgId="org-1"
      org={{ feature_flags: { sis_settings: { incident_report_recipient_id: 'katrine' } } }} />)
    expect(await screen.findByDisplayValue('Katrine Myers (Campus Coordinator)')).toBeInTheDocument()
  })
})
