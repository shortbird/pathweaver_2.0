import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FamilyQuestsSection from './FamilyQuestsSection'

/**
 * Family quests on the family dashboard: who is on each quest, opening a
 * member's own copy, adding a child, and setting up a new one for the
 * children the parent picks.
 */

const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

let scopeState = {}
vi.mock('../../contexts/FamilyScopeContext', () => ({
  useFamilyScope: () => scopeState,
}))
// CreateQuestModal reads the scope through this hook; the family form never
// sends a student_id, so it only needs to exist.
vi.mock('../../hooks/useStudentScope', () => ({
  useStudentScope: () => ({ params: {}, studentId: null, scopeId: undefined, isDelegated: false }),
}))
vi.mock('../SimilarQuestAutocomplete', () => ({ default: () => null }))
const confirmMock = vi.fn(() => Promise.resolve(true))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => confirmMock }))

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
import api from '../../services/api'

const PARENT = 'parent-1'
const kid = (id, firstName) => ({ id, name: firstName, firstName, avatarUrl: null, isDependent: false, raw: { id } })

const QUESTS = [
  {
    id: 'nz', title: 'New Zealand 101', description: 'A trip', image_url: null, is_family_quest: true, created_at: '2026-02-20',
    members: [{ user_id: PARENT, first_name: 'Paige', avatar_url: null, is_self: true, completed_at: null, progress: { completed_tasks: 1, total_tasks: 4, percentage: 25 }, rhythm: { state: 'resting', state_display: 'Resting', last_7_days: [] } }],
  },
  {
    id: 'trip', title: 'Pack for the trip', description: '', image_url: null, is_family_quest: true, created_at: '2026-09-01',
    members: [
      { user_id: 'romney', first_name: 'Romney', avatar_url: null, is_self: false, completed_at: null, progress: { completed_tasks: 1, total_tasks: 2, percentage: 50 }, rhythm: { state: 'in_flow', state_display: 'In Flow', last_7_days: [] } },
      { user_id: 'sib', first_name: 'Sib', avatar_url: null, is_self: false, completed_at: '2026-09-10', progress: { completed_tasks: 1, total_tasks: 1, percentage: 100 } },
    ],
  },
]

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FamilyQuestsSection />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('FamilyQuestsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    scopeState = { children: [kid('romney', 'Romney'), kid('sib', 'Sib')], enterScope: vi.fn(), exitScope: vi.fn() }
    api.get.mockResolvedValue({ data: { success: true, quests: QUESTS } })
    api.post.mockResolvedValue({ data: { success: true, enrolled: [], failed: [] } })
  })

  it('names who is on each quest with their rhythm on it, the parent as "You"', async () => {
    renderSection()
    expect(await screen.findByText('New Zealand 101')).toBeInTheDocument()
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Romney')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    // The engagement metric as icon + heat map: the state is the icon's
    // name, not text in the row, and there is no progress bar.
    expect(screen.getByLabelText('Resting')).toBeInTheDocument()
    expect(screen.getByLabelText('In Flow')).toBeInTheDocument()
    expect(screen.queryByText('In Flow')).not.toBeInTheDocument()
    expect(screen.queryByText(/\d+\/\d+ tasks/)).not.toBeInTheDocument()
  })

  it("opens a child's copy in that child's scope, and the parent's own out of scope", async () => {
    renderSection()
    await screen.findByText('New Zealand 101')

    await userEvent.click(screen.getByRole('button', { name: "Open Romney's copy" }))
    expect(scopeState.enterScope).toHaveBeenCalledWith('romney')
    expect(navigateMock).toHaveBeenCalledWith('/quests/trip')

    await userEvent.click(screen.getByRole('button', { name: 'Open your copy' }))
    expect(scopeState.exitScope).toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalledWith('/quests/nz')
  })

  it("ends a child's run at a quest from the row, after a confirm that counts the unfinished tasks", async () => {
    renderSection()
    await screen.findByText('New Zealand 101')
    await userEvent.click(screen.getByRole('button', { name: "End Romney's quest" }))
    expect(confirmMock).toHaveBeenCalledWith(expect.stringMatching(/End Romney's run at "Pack for the trip"\? 1 task is still unfinished/))
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/quests/trip/end', { student_id: 'romney' })
    })
    expect(toast.success).toHaveBeenCalledWith('Pack for the trip ended for Romney')
  })

  it("ends the parent's own run without a student_id, and offers no End on a completed run", async () => {
    renderSection()
    await screen.findByText('New Zealand 101')
    expect(screen.queryByRole('button', { name: "End Sib's quest" })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'End your quest' }))
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/quests/nz/end', {})
    })
  })

  it('offers to add only the children who are not on the quest yet', async () => {
    renderSection()
    await screen.findByText('New Zealand 101')
    // Nobody but Paige is on New Zealand 101; both kids are on the trip.
    expect(screen.getByRole('button', { name: 'Add Romney' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Sib' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Add / })).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: 'Add Romney' }))
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/family/quests/nz/enroll-children', { child_ids: ['romney'] })
    })
    expect(toast.success).toHaveBeenCalledWith('Romney is on New Zealand 101')
  })

  it('sets up a new family quest for the children the parent picks', async () => {
    api.post.mockImplementation((url) => {
      if (url === '/api/family/quests/create') return Promise.resolve({ data: { success: true, quest_id: 'new', quest: { id: 'new', title: 'Bake bread' } } })
      return Promise.resolve({ data: { success: true, enrolled: [{ child_id: 'romney' }], failed: [] } })
    })
    renderSection()
    await screen.findByText('New Zealand 101')

    await userEvent.click(screen.getByRole('button', { name: /New family quest/ }))
    expect(await screen.findByText('Who is it for? *')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Quest Title *'), 'Bake bread')
    await userEvent.type(screen.getByLabelText('Quest Description *'), 'Sourdough from scratch')
    // Everyone starts ticked; untick Sib.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sib' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create family quest' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/family/quests/create', { title: 'Bake bread', big_idea: 'Sourdough from scratch' })
    })
    expect(api.post).toHaveBeenCalledWith('/api/family/quests/new/enroll-children', { child_ids: ['romney'] })
    expect(toast.success).toHaveBeenCalledWith('Bake bread set up for 1 child')
  })

  it('refuses a family quest with nobody on it', async () => {
    renderSection()
    await screen.findByText('New Zealand 101')
    await userEvent.click(screen.getByRole('button', { name: /New family quest/ }))
    await userEvent.type(await screen.findByLabelText('Quest Title *'), 'Bake bread')
    await userEvent.type(screen.getByLabelText('Quest Description *'), 'Sourdough')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Romney' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sib' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create family quest' }))
    expect(await screen.findByText('Pick at least one child')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('shows an empty state with the create action when the family has none', async () => {
    api.get.mockResolvedValue({ data: { success: true, quests: [] } })
    renderSection()
    expect(await screen.findByText('No family quests yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /New family quest/ })).toBeInTheDocument()
  })
})
