import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The curriculum library as a sortable table.
 *
 * iCreate, 2026-07-30: "I'm wondering if maybe we can sort the pages more like
 * the class list - I just think this might get way too long. Like we could have
 * the class title, ages, subject, folder link and then be able to sort it by
 * those topics? And then it could have a drop down like it does in the classes
 * if it needed more info?"
 */

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false }),
  withOrg: (url, orgId) => `${url}?organization_id=${orgId}`,
}))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'org_managed', org_role: 'org_admin' } }),
}))

const CURRICULUM = [
  { id: 'cu1', title: 'Reading Workshop', subject: 'Language Arts',
    description: 'Four sections share this', drive_url: 'https://drive.google.com/x', notes: '',
    classes: [
      { class_id: 'c1', name: 'Reading A', min_age: 6, max_age: 8 },
      { class_id: 'c2', name: 'Reading B', min_age: 9, max_age: 11 },
    ] },
  { id: 'cu2', title: 'Astronomy', subject: 'Science', description: '', drive_url: '',
    notes: 'Needs a teacher', classes: [] },
  { id: 'cu3', title: 'Clay Basics', subject: 'Art', description: '', drive_url: '',
    notes: '', classes: [{ class_id: 'c3', name: 'Pottery', min_age: 12, max_age: 14 }] },
]

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import CurriculumPage from './CurriculumPage'

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/api/sis/curriculum')) return Promise.resolve({ data: { curriculum: CURRICULUM } })
    return Promise.resolve({ data: { classes: [] } })
  })
})

// First cell = the title, plus the disclosure caret when the row has detail.
const titles = () => screen.getAllByRole('row').slice(1)
  .map((r) => within(r).queryAllByRole('cell')[0]?.textContent?.replace(/[▸▾]/g, '').trim())
  .filter(Boolean)

describe('CurriculumPage table', () => {
  it('lists entries as rows with ages taken from the classes that teach them', async () => {
    render(<CurriculumPage />)
    await screen.findByText('Reading Workshop')
    // Reading A (6-8) + Reading B (9-11) -> the span across both sections.
    expect(screen.getByText('6–11')).toBeInTheDocument()
    expect(screen.getByText('12–14')).toBeInTheDocument()
    expect(screen.getByText('Not taught this term')).toBeInTheDocument()  // Astronomy
  })

  it('sorts by title by default and flips direction on a second click', async () => {
    render(<CurriculumPage />)
    await screen.findByText('Reading Workshop')
    expect(titles()).toEqual(['Astronomy', 'Clay Basics', 'Reading Workshop'])
    fireEvent.click(screen.getByRole('button', { name: /Title/ }))
    expect(titles()).toEqual(['Reading Workshop', 'Clay Basics', 'Astronomy'])
  })

  it('sorts by ages, with untaught curriculum last', async () => {
    render(<CurriculumPage />)
    await screen.findByText('Reading Workshop')
    fireEvent.click(screen.getByRole('button', { name: /Ages/ }))
    expect(titles()).toEqual(['Reading Workshop', 'Clay Basics', 'Astronomy'])
  })

  it('sorts by subject', async () => {
    render(<CurriculumPage />)
    await screen.findByText('Reading Workshop')
    fireEvent.click(screen.getByRole('button', { name: /Subject/ }))
    expect(titles()).toEqual(['Clay Basics', 'Reading Workshop', 'Astronomy'])
  })

  it('keeps the detail behind a disclosure so the list stays scannable', async () => {
    render(<CurriculumPage />)
    await screen.findByText('Reading Workshop')
    expect(screen.queryByText(/Used by Reading A/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Reading Workshop'))
    expect(await screen.findByText(/Used by Reading A · Reading B/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Reading Workshop'))
    expect(screen.queryByText(/Used by Reading A/)).not.toBeInTheDocument()
  })

  it('filters by search without losing the sort', async () => {
    render(<CurriculumPage />)
    await screen.findByText('Reading Workshop')
    fireEvent.change(screen.getByPlaceholderText('Search curriculum…'), { target: { value: 'read' } })
    expect(titles()).toEqual(['Reading Workshop'])
  })
})
