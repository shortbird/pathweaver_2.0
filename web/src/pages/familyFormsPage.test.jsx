/**
 * The Forms page: one door for the paperwork between a family and its school.
 *
 * Until 2026-09-16 a parent had two sidebar items, "Checklists" and
 * "Requests", split by which way the paper travelled. iCreate's parents found
 * the pair confusing, and for most of them Checklists was empty. This file
 * pins what the merge has to get right: both halves on one page in the right
 * order, the composer out of the way once there is history, the office's
 * reply shown under the request it answers, a half hidden when its block is
 * off, and the old path still landing somewhere.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { readFileSync } from 'fs'
import { join } from 'path'

const render = (ui, { route = '/family/forms' } = {}) => rtlRender(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
  </QueryClientProvider>,
)

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}))
vi.mock('../services/api', () => ({ default: api }))

import FamilyFormsPage from './FamilyFormsPage'

const ORG = {
  organization_id: 'org-1', organization_name: 'iCreate',
  students: [{ student_id: 's1', name: 'Mack' }],
}
const FORM_TYPES = { general_request: 'General request', meeting_request: 'Request a meeting' }
const ASSIGNMENT = {
  id: 'fa1', template_name: 'Student Behavior Agreement Form', done_count: 0, total_count: 1,
  items: [{ key: 'agree', title: 'Read and agree', required: true, status: 'pending' }],
}
const ANSWERED = {
  id: 'f1', form_type: 'general_request', form_type_label: 'General request',
  title: 'Receipt for enrollment fee', status: 'resolved', created_at: '2026-09-15T10:00:00Z',
  payload: { body: 'I need a receipt for the UFA enrollment fee.' },
  resolution_notes: 'Sent to your email this morning.',
}

const mockApi = ({ org = ORG, assignments = [], quests = [], submissions = [] } = {}) => {
  api.get.mockImplementation((url) => {
    if (url.includes('/parent/context')) return Promise.resolve({ data: { orgs: [org] } })
    if (url.includes('/parent/onboarding')) return Promise.resolve({ data: { assignments } })
    if (url.includes('/parent/quests')) return Promise.resolve({ data: { quests } })
    if (url.includes('/parent/forms')) return Promise.resolve({ data: { submissions, form_types: FORM_TYPES } })
    return Promise.resolve({ data: {} })
  })
  api.post.mockResolvedValue({ data: { success: true } })
}

beforeEach(() => vi.clearAllMocks())

describe('one page, two halves', () => {
  it('puts what the school needs first and the family’s requests second', async () => {
    mockApi({ assignments: [ASSIGNMENT], submissions: [ANSWERED] })
    render(<FamilyFormsPage />)
    expect(await screen.findByText('Student Behavior Agreement Form')).toBeInTheDocument()
    expect(await screen.findByText('Receipt for enrollment fee')).toBeInTheDocument()
    // The page's title is the school shell's letterhead; the panel has none of its own.
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['To complete', 'Your requests'])
  })

  it('says so quietly when the school needs nothing', async () => {
    mockApi({ submissions: [ANSWERED] })
    render(<FamilyFormsPage />)
    expect(await screen.findByText('Nothing to sign or complete right now.')).toBeInTheDocument()
  })
})

describe('the request composer', () => {
  it('is open for a family with no request on file', async () => {
    mockApi()
    render(<FamilyFormsPage />)
    expect(await screen.findByRole('button', { name: 'Send request' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New request' })).not.toBeInTheDocument()
    // No Cancel either: there is nothing behind the form to go back to.
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('is a button once there is history, so the answers are not pushed below a blank form', async () => {
    mockApi({ submissions: [ANSWERED] })
    render(<FamilyFormsPage />)
    expect(await screen.findByText('Receipt for enrollment fee')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New request' }))
    expect(screen.getByRole('button', { name: 'Send request' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument()
  })

  it('sends through the parent endpoint and closes', async () => {
    mockApi({ submissions: [ANSWERED] })
    render(<FamilyFormsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'New request' }))
    fireEvent.change(screen.getByLabelText('Which child? (optional)'), { target: { value: 's1' } })
    fireEvent.change(screen.getByLabelText('Details'), { target: { value: 'Can Mack switch to Lego Lab?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/parent/forms', {
      organization_id: 'org-1',
      form_type: 'general_request',
      title: undefined,
      body: 'Can Mack switch to Lego Lab?',
      student_user_id: 's1',
    }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument())
  })
})

describe('what the office said', () => {
  it('shows the reply under the request, in the office’s name, with a plain status', async () => {
    mockApi({ submissions: [ANSWERED, { ...ANSWERED, id: 'f2', title: 'Map of the building', status: 'under_review', resolution_notes: null }] })
    render(<FamilyFormsPage />)
    const answered = (await screen.findByText('Receipt for enrollment fee')).closest('li')
    expect(within(answered).getByText('iCreate replied: Sent to your email this morning.')).toBeInTheDocument()
    expect(within(answered).getByText('Answered')).toBeInTheDocument()
    const open = screen.getByText('Map of the building').closest('li')
    expect(within(open).getByText('With the office')).toBeInTheDocument()
    expect(within(open).queryByText(/replied/)).not.toBeInTheDocument()
  })
})

describe('a school that runs only one block', () => {
  it('hides the To complete half when onboarding is off, and never asks for it', async () => {
    mockApi({ org: { ...ORG, modules: ['forms'] } })
    render(<FamilyFormsPage />)
    expect(await screen.findByRole('heading', { name: 'Your requests' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'To complete' })).not.toBeInTheDocument()
    expect(api.get.mock.calls.some(([url]) => url.includes('/parent/onboarding'))).toBe(false)
  })

  it('hides the requests half when forms is off', async () => {
    mockApi({ org: { ...ORG, modules: ['onboarding'] }, assignments: [ASSIGNMENT] })
    render(<FamilyFormsPage />)
    expect(await screen.findByRole('heading', { name: 'To complete' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your requests' })).not.toBeInTheDocument()
    expect(api.get.mock.calls.some(([url]) => url.includes('/parent/forms'))).toBe(false)
  })
})

describe('the old Checklists path', () => {
  // Notifications sent before 2026-09-16 (onboarding, signatures, secure
  // documents: sis_onboarding_service, sis_tasks_service, secure_documents.py)
  // link to /family/portal, and the mobile app opens /family/* on the web. Read
  // the route table itself: a rendered redirect here would only test itself.
  it('still resolves, as a redirect to Forms', () => {
    const app = readFileSync(join(__dirname, '..', 'App.jsx'), 'utf8')
    expect(app).toMatch(/<Route path="family\/portal" element=\{<Navigate to="\/family\/forms" replace \/>\} \/>/)
    expect(app).not.toMatch(/FamilyPortalPage/)
  })
})
