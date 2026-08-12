/**
 * The curriculum library as the container: what each entry carries.
 *
 * iCreate, 2026-08-06: "admin should attach courses/quests to curriculum so
 * they're reusable year after year and teachers have resources to use, rather
 * than requiring teachers to create their own quests."
 *
 * The library row now says what a class inherits by being given this curriculum,
 * and opening it is where an admin attaches more. The copy distinguishes the two
 * behaviours on purpose — quests are copied onto a class, courses are linked —
 * because "why did my change not show up on the class" and "why did my change
 * show up on every class" are both bad surprises.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

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

import CurriculumPage from './CurriculumPage'

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
      return Promise.resolve({ data: { quests: [{ quest_id: 'q2', title: 'Book report', source: 'organization' }] } })
    }
    if (url.includes('/assignable-courses')) {
      return Promise.resolve({ data: { courses: [{ course_id: 'co2', title: 'Poetry basics', status: 'published', source: 'library' }] } })
    }
    if (url.includes('/resources')) return Promise.resolve({ data: RESOURCES })
    if (url.includes('/api/sis/curriculum')) return Promise.resolve({ data: { curriculum: [ENTRY] } })
    if (url.includes('/api/sis/classes')) return Promise.resolve({ data: { classes: [] } })
    return Promise.resolve({ data: {} })
  })
})

describe('what a curriculum carries', () => {
  it('says so on the library row', async () => {
    render(<CurriculumPage />)
    expect(await screen.findByText('3 quests · 1 course')).toBeInTheDocument()
  })

  it('lists the quests and courses when the row is opened', async () => {
    render(<CurriculumPage />)
    fireEvent.click(await screen.findByText('Reading Workshop'))
    expect(await screen.findByText('Reading log')).toBeInTheDocument()
    expect(screen.getByText('Reading Workshop course')).toBeInTheDocument()
  })

  it('says quests are copied and courses are live, so neither is a surprise', async () => {
    render(<CurriculumPage />)
    fireEvent.click(await screen.findByText('Reading Workshop'))
    expect(await screen.findByText(/applies to the\s+next class set up from this curriculum/i)).toBeInTheDocument()
    expect(screen.getByText(/Every class using it shows these/i)).toBeInTheDocument()
  })

  it('attaches a quest from the library screen, without going via a class', async () => {
    render(<CurriculumPage />)
    fireEvent.click(await screen.findByText('Reading Workshop'))
    const picker = await screen.findByPlaceholderText('Add a quest…')
    fireEvent.focus(picker)
    fireEvent.mouseDown(await screen.findByRole('button', { name: 'Book report' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/curriculum/cur1/quests?organization_id=org-1',
      { quest_ids: ['q1', 'q2'] },
    ))
  })

  it('attaches a course, saying when it comes from the Optio library', async () => {
    render(<CurriculumPage />)
    fireEvent.click(await screen.findByText('Reading Workshop'))
    const picker = await screen.findByPlaceholderText('Add a course…')
    fireEvent.focus(picker)
    // The picker mixes the school's own with Optio's public library, and the
    // label says which is which (iCreate asked whether the list was school-only).
    fireEvent.mouseDown(await screen.findByRole('button', { name: 'Poetry basics · Optio library' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/curriculum/cur1/courses?organization_id=org-1',
      { course_ids: ['co1', 'co2'] },
    ))
  })

  it('removes a course from the set', async () => {
    render(<CurriculumPage />)
    fireEvent.click(await screen.findByText('Reading Workshop'))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Reading Workshop course' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/curriculum/cur1/courses?organization_id=org-1',
      { course_ids: [] },
    ))
  })

  it('shows a teacher what the curriculum carries but no way to change it', async () => {
    authState = { user: { id: 'u2', role: 'org_managed', org_roles: ['advisor'] } }
    render(<CurriculumPage />)
    fireEvent.click(await screen.findByText('Reading Workshop'))
    expect(await screen.findByText('Reading log')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Add a quest…')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument()
  })
})

/**
 * iCreate, 2026-08-12: "to find the quests/courses for a curriculum, you have
 * to click on the curriculum name, but shouldn't that be in edit?" The Edit
 * panel now carries the same quests/courses manager the row disclosure has.
 */
describe('editing a curriculum manages what it carries', () => {
  it('shows the quests and courses, with pickers, inside the Edit panel', async () => {
    render(<CurriculumPage />)
    await screen.findByText('Reading Workshop')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Reading Workshop' }))
    expect(await screen.findByText('Reading log')).toBeInTheDocument()
    expect(screen.getByText('Reading Workshop course')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Add a quest…')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Add a course…')).toBeInTheDocument()
  })

  it('collapses the row disclosure when Edit opens, so the panel is not doubled', async () => {
    render(<CurriculumPage />)
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
    render(<CurriculumPage />)
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
