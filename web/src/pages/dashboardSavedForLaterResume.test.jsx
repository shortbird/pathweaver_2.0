/**
 * The dashboard's Saved for Later "Resume" names the right student.
 *
 * Ticket e17134c6 (2026-10-07) replaced End Quest with "Save for later"
 * (POST /api/quests/:id/archive) and lists saved quests under "Saved for
 * Later" on the student dashboard with a Resume button
 * (POST /api/quests/:id/unarchive). A parent in family scope sees the CHILD's
 * list, so Resume must carry the child's student_id; without it the backend
 * looks for the parent's own row and 404s.
 *
 * DashboardPage.test.jsx mocks useQuests whole; this file keeps the real
 * useUnarchiveEnrollment so the request body is the one the backend gets.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DashboardPage from './DashboardPage'
import { ConfirmProvider } from '../contexts/ConfirmContext'

const get = vi.fn()
const post = vi.fn()
vi.mock('../services/api', () => ({
  default: { get: (...a) => get(...a), post: (...a) => post(...a) },
}))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

let authState = {}
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../hooks/useHidePillars', () => ({ default: () => false }))
vi.mock('../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ school: null, organization: null, loading: false }),
}))

const scopeState = { selectedChildId: null, selectedChild: null, isScoped: false, exitScope: vi.fn() }
vi.mock('../contexts/FamilyScopeContext', () => ({
  useFamilyScope: () => scopeState,
}))

const dashboardData = {
  active_quests: [],
  enrolled_courses: [],
  stats: {},
  archived_quests: [
    { id: 'a-1', quest_id: 'q-1', archived_at: '2026-10-01T00:00:00Z', quests: { title: 'Birdhouse' } },
  ],
}
vi.mock('../hooks/api/useUserData', () => ({
  useUserDashboard: () => ({ data: dashboardData, isLoading: false, error: null, refetch: vi.fn() }),
}))

vi.mock('../hooks/api/useQuests', async (importOriginal) => ({
  ...(await importOriginal()),
  useGlobalEngagement: () => ({ data: { rhythm: { state: 'building' }, calendar: { days: [] } } }),
}))

vi.mock('../components/quest/QuestCardSimple', () => ({ default: () => null }))
vi.mock('../components/course/CourseCardWithQuests', () => ({ default: () => null }))
vi.mock('../components/quest/RhythmIndicator', () => ({ default: () => null }))
vi.mock('../components/quest/EngagementCalendar', () => ({ default: () => null }))
vi.mock('../components/quest/RhythmExplainerModal', () => ({ default: () => null }))
vi.mock('../components/CreateQuestModal', () => ({ default: () => null }))
vi.mock('../components/learning-events/QuickCaptureButton', () => ({ default: () => null }))
vi.mock('../components/diploma/DiplomaCreditTracker', () => ({ default: () => null }))
vi.mock('../components/overview/WeeklyXpGoalCard', () => ({ default: () => null }))

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ConfirmProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <DashboardPage />
        </MemoryRouter>
      </ConfirmProvider>
    </QueryClientProvider>
  )
}

async function clickResume() {
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
  await waitFor(() => expect(post).toHaveBeenCalled())
  return post.mock.calls.find(([url]) => url === '/api/quests/q-1/unarchive')
}

describe('Saved for Later Resume scope (ticket e17134c6)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    get.mockResolvedValue({ data: {} })
    post.mockResolvedValue({ data: { success: true } })
    authState = { user: { id: 'user-1', first_name: 'Alex', role: 'student', created_at: '2025-01-01T00:00:00Z' } }
    scopeState.selectedChildId = null
    scopeState.selectedChild = null
    scopeState.isScoped = false
  })

  it("sends the child's student_id when a parent is in family scope", async () => {
    authState = { user: { id: 'parent-1', first_name: 'Molly', role: 'parent', created_at: '2025-01-01T00:00:00Z' } }
    scopeState.selectedChildId = 'child-1'
    scopeState.selectedChild = { id: 'child-1', firstName: 'Brady' }
    scopeState.isScoped = true
    renderDashboard()
    const call = await clickResume()
    expect(call).toBeTruthy()
    expect(call[1]).toMatchObject({ student_id: 'child-1' })
  })

  it('sends no student_id for a student on their own dashboard', async () => {
    renderDashboard()
    const call = await clickResume()
    expect(call).toBeTruthy()
    expect(call[1]).not.toHaveProperty('student_id')
  })
})

describe('Saved for Later Remove (ticket e17134c6)', () => {
  // The owner's follow-up (2026-10-07): each Saved for Later row gets a small
  // "Remove" -- confirm, then archive with reason lost_interest ("I'm done
  // with it"), which hides the quest from every list. The copy says the work
  // and XP stay in the portfolio.
  beforeEach(() => {
    vi.clearAllMocks()
    get.mockResolvedValue({ data: {} })
    post.mockResolvedValue({ data: { success: true } })
    authState = { user: { id: 'user-1', first_name: 'Alex', role: 'student', created_at: '2025-01-01T00:00:00Z' } }
    scopeState.selectedChildId = null
    scopeState.selectedChild = null
    scopeState.isScoped = false
  })

  async function removeAndConfirm() {
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('Remove "Birdhouse" from Saved for Later?')).toBeInTheDocument()
    expect(screen.getByText('It leaves every list. Its work and XP stay in the portfolio.')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button', { name: 'Remove' })
    fireEvent.click(buttons[buttons.length - 1])
    await waitFor(() => expect(post).toHaveBeenCalled())
    return post.mock.calls.find(([url]) => url === '/api/quests/q-1/archive')
  }

  it('archives with reason lost_interest for a student, without student_id', async () => {
    renderDashboard()
    const call = await removeAndConfirm()
    expect(call[1]).toMatchObject({ reason: 'lost_interest' })
    expect(call[1]).not.toHaveProperty('student_id')
  })

  it("sends the child's student_id when a parent is in family scope", async () => {
    scopeState.selectedChildId = 'child-1'
    scopeState.selectedChild = { id: 'child-1', firstName: 'Brady' }
    scopeState.isScoped = true
    renderDashboard()
    const call = await removeAndConfirm()
    expect(call[1]).toMatchObject({ reason: 'lost_interest', student_id: 'child-1' })
  })

  it('does nothing when the person cancels', async () => {
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(await screen.findByText('Cancel'))
    await waitFor(() => expect(screen.queryByText(/from Saved for Later\?/)).not.toBeInTheDocument())
    expect(post).not.toHaveBeenCalled()
  })
})
