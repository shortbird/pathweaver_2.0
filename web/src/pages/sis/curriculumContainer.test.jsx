/**
 * The curriculum library as the container: what each entry carries.
 *
 * iCreate, 2026-08-06: "admin should attach courses/quests to curriculum so
 * they're reusable year after year and teachers have resources to use, rather
 * than requiring teachers to create their own quests."
 *
 * The library row now says what a class inherits by being given this curriculum,
 * and opening it is where an admin attaches more — or builds one, from scratch
 * or from material the school already has (2026-08-12).
 *
 * That question -- "why did my change not show up on the class I already set
 * up" -- was not a copy problem in the end. Attaching a quest here wrote
 * sis_curriculum_quests and nothing else, while students read class_quests, so
 * the answer was that it never would (fixed 2026-09-02). Attaching now pushes
 * onto every active class on the curriculum; removing still does not pull back,
 * and the copy has to keep saying so.
 *
 * Courses were removed from this panel on 2026-08-12 (iCreate will not attach
 * courses to curriculum), so the assertions here are that the way to add one is
 * gone — not that course links are impossible, which the API still allows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// The quest editor's Drafts list reads through react-query (P6).
const render = (ui) => rtlRender(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>,
)

let authState = { user: { id: 'u1', role: 'org_admin' } }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: () => {}, orgs: [], isSuperadmin: false }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))

const ENTRY = {
  id: 'cur1', title: 'Reading Workshop', subject: 'Language Arts',
  description: 'Whole-group reading', drive_url: 'https://drive.example/rw',
  notes: null, is_active: true, quest_count: 3, course_count: 1,
  classes: [{ class_id: 'c1', name: 'Reading Workshop A', min_age: 8, max_age: 10 }],
}

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import { toast } from 'react-hot-toast'
import CurriculumPanel from './libraryPage/CurriculumPanel'

const RESOURCES = {
  quests: [{ id: 'q1', title: 'Reading log', is_active: true }],
  courses: [{ id: 'co1', title: 'Reading Workshop course', status: 'published' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  authState = { user: { id: 'u1', role: 'org_admin' } }
  api.put.mockResolvedValue({ data: { success: true, attached: 1 } })
  api.get.mockImplementation((url) => {
    if (url.includes('/assignable-quests')) {
      return Promise.resolve({ data: { quests: [
        { quest_id: 'q2', title: 'Book report', source: 'organization' },
        { quest_id: 'q3', title: 'Poetry basics', source: 'library' },
      ] } })
    }
    if (url.includes('/assignable-courses')) {
      return Promise.resolve({ data: { courses: [{ course_id: 'co2', title: 'Poetry basics', status: 'published', source: 'library' }] } })
    }
    if (url.startsWith('/api/sis/quest-editor/drafts')) return Promise.resolve({ data: { drafts: [] } })
    if (url.startsWith('/api/sis/quest-editor/q9')) {
      return Promise.resolve({ data: { quest: {
        id: 'q9', title: '', description: '', is_draft: true, is_active: false, editable: true,
        can_lock_xp: true, tasks: [], xp_threshold: 0, draft: { context: 'curriculum', target_id: 'cur1' },
      } } })
    }
    if (url.includes('/resources')) return Promise.resolve({ data: RESOURCES })
    if (url.includes('/api/sis/curriculum')) return Promise.resolve({ data: { curriculum: [ENTRY] } })
    if (url.includes('/api/sis/classes')) return Promise.resolve({ data: { classes: [] } })
    return Promise.resolve({ data: {} })
  })
})

describe('what a curriculum carries', () => {
  it('says so on the library row', async () => {
    render(<CurriculumPanel />)
    expect(await screen.findByText('3 quests · 1 course')).toBeInTheDocument()
  })

  it('lists the quests when the row is opened', async () => {
    render(<CurriculumPanel />)
    fireEvent.click(await screen.findByText('Reading Workshop'))
    expect(await screen.findByText('Reading log')).toBeInTheDocument()
  })

  it('says an attached quest reaches the classes now, and that removing it does not', async () => {
    // There is no delay to warn about any more (2026-09-02): attaching pushes the
    // quest onto every active class on this curriculum, which is what an admin
    // assumed all along. The half still worth saying out loud is the asymmetry —
    // removing here does NOT pull it back off a class in progress.
    render(<CurriculumPanel />)
    fireEvent.click(await screen.findByText('Reading Workshop'))
    expect(await screen.findByText(/goes straight onto every active class/i)).toBeInTheDocument()
    expect(screen.getByText(/classes keep\s+what they have/i)).toBeInTheDocument()
  })

  it('tells the admin how many classes the quest reached', async () => {
    api.put.mockResolvedValue({ data: { success: true, attached: 2, pushed_to_classes: 3 } })
    render(<CurriculumPanel />)
    fireEvent.click(await screen.findByText('Reading Workshop'))
    const picker = await screen.findByPlaceholderText('Add a quest…')
    fireEvent.focus(picker)
    fireEvent.mouseDown(await screen.findByRole('button', { name: 'Book report' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Added to 3 classes'))
  })

  it('attaches a quest from the library screen, without going via a class', async () => {
    render(<CurriculumPanel />)
    fireEvent.click(await screen.findByText('Reading Workshop'))
    const picker = await screen.findByPlaceholderText('Add a quest…')
    fireEvent.focus(picker)
    fireEvent.mouseDown(await screen.findByRole('button', { name: 'Book report' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/curriculum/cur1/quests?organization_id=org-1',
      { quest_ids: ['q1', 'q2'] },
    ))
  })

  it('says when a quest comes from the Optio library rather than the school', async () => {
    // The picker mixes the school's own with Optio's public library, and the
    // label says which is which (iCreate asked whether the list was school-only).
    // Carried over from the course picker, which this panel no longer has.
    render(<CurriculumPanel />)
    fireEvent.click(await screen.findByText('Reading Workshop'))
    const picker = await screen.findByPlaceholderText('Add a quest…')
    fireEvent.focus(picker)
    expect(await screen.findByRole('button', { name: 'Poetry basics · Optio library' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Book report' })).toBeInTheDocument()
  })

  it('offers no way to attach a course', async () => {
    render(<CurriculumPanel />)
    fireEvent.click(await screen.findByText('Reading Workshop'))
    await screen.findByText('Reading log')
    expect(screen.queryByPlaceholderText('Add a course…')).not.toBeInTheDocument()
  })

  it('does not go looking for courses it can no longer attach', async () => {
    render(<CurriculumPanel />)
    fireEvent.click(await screen.findByText('Reading Workshop'))
    await screen.findByText('Reading log')
    expect(api.get.mock.calls.some(([url]) => url.includes('/assignable-courses'))).toBe(false)
  })

  it('shows a teacher what the curriculum carries but no way to change it', async () => {
    authState = { user: { id: 'u2', role: 'org_managed', org_roles: ['advisor'] } }
    render(<CurriculumPanel />)
    fireEvent.click(await screen.findByText('Reading Workshop'))
    expect(await screen.findByText('Reading log')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Add a quest…')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument()
    // The AI builder is a way to change it, so it is not a teacher's to see here.
    expect(screen.queryByRole('button', { name: /Generate draft/i })).not.toBeInTheDocument()
  })
})

describe('building a quest from the curriculum page', () => {
  const open = async () => {
    render(<CurriculumPanel />)
    fireEvent.click(await screen.findByText('Reading Workshop'))
    await screen.findByText('Reading log')
  }

  // Since P6 (2026-09-23) this is the one quest editor: the quest is a draft
  // on this curriculum from the first click, and Publish appends it and pushes
  // it to the curriculum's classes.
  it('starts a draft on this curriculum and publishes it onto the curriculum', async () => {
    api.post.mockResolvedValue({ data: { success: true, quest_id: 'q9', pushed_to_classes: 1 } })
    api.put.mockImplementation((url, body) => Promise.resolve({ data: { quest: {
      id: 'q9', ...body, is_draft: true, editable: true, tasks: body.tasks || [] } } }))
    await open()
    fireEvent.click(screen.getByRole('button', { name: /Create a new quest/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/quest-editor/drafts?organization_id=org-1',
      { context: 'curriculum', curriculum_id: 'cur1' }))
    fireEvent.change(await screen.findByLabelText('Quest title'), { target: { value: 'Watercolor Basics' } })
    fireEvent.change(screen.getByLabelText('Quest description'), { target: { value: 'Paint something' } })
    fireEvent.change(screen.getByPlaceholderText(/Task 1 — what should they do\?/), {
      target: { value: 'Mix three colors' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publish to curriculum' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/quest-editor/q9?organization_id=org-1',
      expect.objectContaining({
        title: 'Watercolor Basics',
        description: 'Paint something',
        tasks: [expect.objectContaining({ title: 'Mix three colors' })],
      }),
    ))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/curriculum/cur1/quests/q9/publish?organization_id=org-1', {}))
  })

  it('will not publish a quest with no title', async () => {
    api.post.mockResolvedValue({ data: { success: true, quest_id: 'q9' } })
    await open()
    fireEvent.click(screen.getByRole('button', { name: /Create a new quest/i }))
    expect(await screen.findByRole('button', { name: 'Publish to curriculum' })).toBeDisabled()
  })

  it('an AI draft fills the form and saves nothing on its own', async () => {
    api.post.mockImplementation((url) => Promise.resolve({ data: url.startsWith('/api/sis/quest-editor')
      ? { success: true, quest_id: 'q9' }
      : { success: true, quest: {
        title: 'Bridge Building',
        description: 'Build and test a bridge',
        tasks: [{ title: 'Sketch a design', pillar: 'stem', xp_value: 50, is_required: true }],
      } } }))
    await open()
    fireEvent.click(screen.getByRole('button', { name: /Create a new quest/i }))

    // A blank new quest opens with the document panel ready.
    fireEvent.change(await screen.findByLabelText('Source material'), {
      target: { value: 'Week 1: sketch a bridge. Week 2: build it.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Generate draft/i }))

    // The draft lands in the form the admin will review...
    expect(await screen.findByDisplayValue('Bridge Building')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Sketch a design')).toBeInTheDocument()
    // ...and generating is the only call after the draft itself; publishing is
    // a separate click, and nothing was saved.
    const calls = api.post.mock.calls.map(([url]) => url)
    expect(calls).toEqual([
      '/api/sis/quest-editor/drafts?organization_id=org-1', '/api/sis/quest-drafts/generate'])
    expect(api.put).not.toHaveBeenCalled()
  })
})

/**
 * iCreate, 2026-08-12: "to find the quests for a curriculum, you have to click
 * on the curriculum name, but shouldn't that be in edit?" The Edit panel now
 * carries the same quest manager the row disclosure has. (Written while the
 * panel still managed courses too; courses left it the same day.)
 */
describe('editing a curriculum manages what it carries', () => {
  it('shows the quests, with the picker, inside the Edit panel', async () => {
    render(<CurriculumPanel />)
    await screen.findByText('Reading Workshop')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Reading Workshop' }))
    expect(await screen.findByText('Reading log')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Add a quest…')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Add a course…')).not.toBeInTheDocument()
  })

  it('collapses the row disclosure when Edit opens, so the panel is not doubled', async () => {
    render(<CurriculumPanel />)
    fireEvent.click(await screen.findByText('Reading Workshop'))
    await screen.findByText('Reading log')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Reading Workshop' }))
    expect(await screen.findByPlaceholderText('Add a quest…')).toBeInTheDocument()
    // one panel: the editor's — the expanded row closed
    expect(screen.getAllByPlaceholderText('Add a quest…')).toHaveLength(1)
    expect(screen.queryByText(/Used by Reading Workshop A/)).not.toBeInTheDocument()
  })

  it('opens a new entry onto its quests and courses right after saving', async () => {
    api.post.mockResolvedValue({ data: { curriculum: { id: 'cur9' } } })
    const NEW = { id: 'cur9', title: 'New Unit', subject: '', description: '', drive_url: '',
      notes: null, is_active: true, quest_count: 0, course_count: 0, classes: [] }
    render(<CurriculumPanel />)
    await screen.findByText('Reading Workshop')
    fireEvent.click(screen.getByRole('button', { name: /Add curriculum/ }))
    // Before the entry exists there is nothing to attach to — the panel says so.
    expect(screen.getByText(/Save the entry first/)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Add a quest…')).not.toBeInTheDocument()

    api.get.mockImplementation((url) => {
      if (url.includes('/assignable-quests')) return Promise.resolve({ data: { quests: [] } })
      if (url.includes('/assignable-courses')) return Promise.resolve({ data: { courses: [] } })
      if (url.includes('/resources')) return Promise.resolve({ data: { quests: [], courses: [] } })
      if (url.includes('/api/sis/curriculum')) return Promise.resolve({ data: { curriculum: [ENTRY, NEW] } })
      if (url.includes('/api/sis/classes')) return Promise.resolve({ data: { classes: [] } })
      return Promise.resolve({ data: {} })
    })
    fireEvent.change(screen.getByPlaceholderText('Title (e.g. Reading Workshop)'), { target: { value: 'New Unit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save curriculum' }))

    // The new row auto-expands so attaching quests/courses is the next click.
    expect(await screen.findByPlaceholderText('Add a quest…')).toBeInTheDocument()
    expect(screen.getByText('New Unit')).toBeInTheDocument()
  })
})
