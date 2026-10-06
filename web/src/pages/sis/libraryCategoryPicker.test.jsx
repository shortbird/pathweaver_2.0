import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DocumentsPanel from './libraryPage/DocumentsPanel'
import TrainingPanel from './libraryPage/TrainingPanel'

/**
 * Ticket 79e58519: "Can we get a dropdown of current categories and add new?"
 * The category on a library document and on a training was free text, so a
 * school ended up with "Policy" and "Policies" as two headings. Each panel
 * now hands the categories it already loaded to the form, which offers them
 * as a <datalist>: pick one, or type a new one.
 *
 * Ticket 7aab5d3e: families could not find the training the school set for
 * them. The Training tab says where it lands for them: School > To do.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({
    orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false,
    activeOrg: { id: 'org-1', branding_config: {} },
  }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-admin', role: 'org_managed', org_roles: ['org_admin'] } }),
}))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn(async () => true) }))
vi.mock('./sisRole', () => ({ isSisAdmin: () => true }))
vi.mock('../../utils/appSurface', () => ({ switchSurfaceInApp: vi.fn() }))
vi.mock('../../components/evidence/preview/DocumentPreview', () => ({
  default: () => null,
  isPreviewableDocument: () => false,
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))


const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>,
  )
}

const optionsOf = (input) => {
  const id = input.getAttribute('list')
  if (!id) return []
  return [...document.getElementById(id).querySelectorAll('option')].map((o) => o.value)
}

const RESOURCES = [
  { id: 'a', title: 'Guidebook', url: 'https://x.test/a', category: 'Policies', sort_order: 0 },
  { id: 'b', title: 'Contract', url: 'https://x.test/b', category: 'Policies', sort_order: 1 },
  { id: 'c', title: 'Calendar', url: 'https://x.test/c', category: 'Calendars', sort_order: 2 },
  { id: 'd', title: 'Loose link', url: 'https://x.test/d', category: '', sort_order: 3 },
]

const TRAINING = [
  { kind: 'quest', id: 'tr-1', quest_id: 'q-1', title: 'Orientation', category: 'Onboarding',
    is_required: false, sequence_order: 0, audience: 'staff', quest_is_ours: true,
    my_progress: { started: false, completed: false, done: 0, total: 0 } },
  { kind: 'link', id: 'l-1', title: 'Whole Brain Teaching', url: 'https://loom.com/x',
    category: 'Classroom management', is_required: false, sequence_order: 1, my_done: null },
]

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/api/sis/resources')) return Promise.resolve({ data: { resources: RESOURCES, paperwork: [] } })
    if (url.includes('/training/progress')) return Promise.resolve({ data: { training: TRAINING, staff: [] } })
    if (url.includes('/assignable-quests')) return Promise.resolve({ data: { quests: [] } })
    if (url.includes('/api/sis/staff')) return Promise.resolve({ data: { staff: [] } })
    if (url.includes('/api/sis/training')) return Promise.resolve({ data: { training: TRAINING } })
    return Promise.resolve({ data: {} })
  })
})

describe('category pick list (ticket 79e58519)', () => {
  it('the document form offers the library categories once each, and still takes a new one', async () => {
    render(<DocumentsPanel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add resource' }))
    const input = screen.getByLabelText(/^Category/)
    expect(optionsOf(input)).toEqual(['Calendars', 'Policies'])

    fireEvent.change(input, { target: { value: 'Field trips' } })
    expect(input.value).toBe('Field trips')
  })

  it('the training form offers the categories already on the tab', async () => {
    render(<TrainingPanel />)
    fireEvent.click(await screen.findByRole('button', { name: /add training/i }))
    fireEvent.click(screen.getByRole('tab', { name: /link to a video or document/i }))
    expect(optionsOf(screen.getByLabelText('Category'))).toEqual(['Classroom management', 'Onboarding'])
  })
})

describe('where families find their training (ticket 7aab5d3e)', () => {
  it('says School > To do on the families tab only', async () => {
    render(<TrainingPanel />)
    await screen.findByText('Orientation')
    expect(screen.queryByText('Families find these under School > To do.')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /for families/i }))
    expect(await screen.findByText('Families find these under School > To do.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /for students/i }))
    expect(screen.queryByText('Families find these under School > To do.')).toBeNull()
  })
})
