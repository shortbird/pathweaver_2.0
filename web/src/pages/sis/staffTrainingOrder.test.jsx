/**
 * The Training page keeps the creator's order, lets an admin change it, and
 * narrows by name.
 *
 * Molly (iCreate, 2026-09-17, b26c05e3): "It would be nice to be able to order
 * the trainings in the order I want. I entered them in numerical order but
 * then they ..." Quests carry sequence_order and links sort_order on one
 * shared scale; the page sorts the merged list by it, up/down arrows save the
 * arranged list through PUT /api/sis/training/order, and the search box
 * narrows the list by title without changing the order underneath.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import StaffTrainingPage from './StaffTrainingPage'

const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

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
vi.mock('../../utils/appSurface', () => ({ switchSurfaceInApp: vi.fn() }))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

const quest = (id, title, sequence_order) => ({
  id, quest_id: `q-${id}`, title, category: 'Onboarding', sequence_order,
  is_required: false, audience: 'staff', quest_is_ours: true,
  my_progress: { started: false, completed: false, done: 0, total: 0 },
})
const link = (id, title, sort_order) => ({
  id, title, url: 'https://example.com', category: 'Onboarding', sort_order,
  is_required: false, my_done: false, visible_to_roles: [], visible_to_user_ids: [],
})

// Stored out of title order on purpose: Third first, then First, then the link
// Second between them on the shared scale.
const TRAINING = [quest('t3', 'Third training', 2), quest('t1', 'First training', 0)]
const LINKS = [link('l2', 'Second training (video)', 1)]

// The row titles, top to bottom. Row titles are the font-semibold spans;
// the "Add training" button is not one of them.
const titlesInOrder = () => screen.getAllByText(/(First|Second|Third) training/)
  .filter((el) => el.classList.contains('font-semibold'))
  .map((el) => el.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  authState = { user: { id: 'u1', role: 'org_admin' } }
  api.post.mockResolvedValue({ data: { success: true } })
  api.put.mockResolvedValue({ data: { success: true, ordered: 3 } })
  api.get.mockImplementation((url) => {
    if (url.includes('/assignable-quests')) return Promise.resolve({ data: { quests: [] } })
    if (url.includes('/training/links/progress')) return Promise.resolve({ data: { links: [], staff: [], required_total: 0 } })
    if (url.includes('/training/links')) return Promise.resolve({ data: { links: LINKS } })
    if (url.includes('/training/progress')) return Promise.resolve({ data: { training: [], staff: [], required_total: 0 } })
    if (url.includes('/api/sis/training')) return Promise.resolve({ data: { training: TRAINING } })
    return Promise.resolve({ data: {} })
  })
})

describe('the creator\'s order on the Training page', () => {
  it('lists quests and links together in the arranged order, not by kind or title', async () => {
    render(<StaffTrainingPage />)
    await screen.findByText('Third training')
    expect(titlesInOrder()).toEqual(['First training', 'Second training (video)', 'Third training'])
  })

  it('moves a row and saves the whole arranged list on one scale', async () => {
    render(<StaffTrainingPage />)
    await screen.findByText('Third training')
    fireEvent.click(screen.getByRole('button', { name: 'Move Third training up' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/training/order?organization_id=org-1',
      { items: [{ kind: 'quest', id: 't1' }, { kind: 'quest', id: 't3' }, { kind: 'link', id: 'l2' }] },
    ))
    // Moved on screen at once, before any reload.
    expect(titlesInOrder()).toEqual(['First training', 'Third training', 'Second training (video)'])
  })

  it('cannot move the first row up or the last row down', async () => {
    render(<StaffTrainingPage />)
    await screen.findByText('Third training')
    expect(screen.getByRole('button', { name: 'Move First training up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Third training down' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Second training (video) down' })).not.toBeDisabled()
  })

  it('narrows the list by name and keeps the order underneath', async () => {
    render(<StaffTrainingPage />)
    await screen.findByText('Third training')
    const box = screen.getByLabelText(/Search/)
    fireEvent.change(box, { target: { value: 'ird' } })
    expect(screen.queryByText('First training')).toBeNull()
    expect(screen.getByText('Third training')).toBeInTheDocument()
    // Arrows are put away while searching: moving within a filtered view
    // would reorder rows the admin cannot see.
    expect(screen.queryByRole('button', { name: /Move Third training/ })).toBeNull()
    fireEvent.change(box, { target: { value: 'zzz' } })
    expect(screen.getByText('Nothing matches that search.')).toBeInTheDocument()
    fireEvent.change(box, { target: { value: '' } })
    expect(titlesInOrder()).toEqual(['First training', 'Second training (video)', 'Third training'])
  })

  it('shows a teacher the same order with no arrows', async () => {
    authState = { user: { id: 'u2', role: 'org_managed', org_role: 'advisor' } }
    render(<StaffTrainingPage />)
    await screen.findByText('Third training')
    expect(titlesInOrder()).toEqual(['First training', 'Second training (video)', 'Third training'])
    expect(screen.queryByRole('button', { name: /Move / })).toBeNull()
  })
})
