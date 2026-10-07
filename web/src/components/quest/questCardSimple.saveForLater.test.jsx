/**
 * The dashboard card's "Save for later" names the right student.
 *
 * Ticket e17134c6 (2026-10-07) replaced End Quest with "Save for later"
 * (POST /api/quests/:id/archive) and made /archive student-scoped. The card
 * still archived the CALLER's row: a parent looking at a child's dashboard in
 * family scope got a 404, because the parent has no enrollment of their own.
 *
 * These tests run the real useArchiveEnrollment hook so the request body is
 * what the backend would receive; only the API and the family scope are faked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import QuestCardSimple from './QuestCardSimple'

const get = vi.fn()
const post = vi.fn()

vi.mock('../../services/api', () => ({
  default: { get: (...a) => get(...a), post: (...a) => post(...a) },
}))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

const scopeState = { selectedChildId: null, selectedChild: null, isScoped: false, exitScope: vi.fn() }
vi.mock('../../contexts/FamilyScopeContext', () => ({
  useFamilyScope: () => scopeState,
}))

const inProgressQuest = {
  id: 'quest-1',
  title: 'Birdhouse',
  description: 'Build one',
  is_public: true,
  user_enrollment: { id: 'e-1' },
  completed_enrollment: false,
  quest_tasks: [{ id: 't1', title: 'Cut wood', is_completed: false }],
}

function renderCard(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <QuestCardSimple quest={inProgressQuest} {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

async function saveForLater() {
  fireEvent.click(screen.getByRole('button', { name: 'Save this quest for later' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save for later' }))
  await waitFor(() => expect(post).toHaveBeenCalled())
  return post.mock.calls.find(([url]) => url === '/api/quests/quest-1/archive')
}

describe('QuestCardSimple Save for later scope (ticket e17134c6)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    get.mockResolvedValue({ data: { engagement: null } })
    post.mockResolvedValue({ data: { success: true } })
    scopeState.selectedChildId = null
    scopeState.selectedChild = null
    scopeState.isScoped = false
  })

  it("sends the child's student_id when a parent is in family scope", async () => {
    scopeState.selectedChildId = 'child-1'
    scopeState.selectedChild = { id: 'child-1', firstName: 'Brady' }
    scopeState.isScoped = true
    renderCard()
    const call = await saveForLater()
    expect(call).toBeTruthy()
    expect(call[1]).toMatchObject({ student_id: 'child-1' })
  })

  it('sends no student_id for a student on their own dashboard', async () => {
    renderCard()
    const call = await saveForLater()
    expect(call).toBeTruthy()
    expect(call[1]).not.toHaveProperty('student_id')
  })

  it("an own card (ownOnly) archives the signed-in user's quest even while a child is picked", async () => {
    // MyEnrolledQuests on the role homes: Molly's own quest, Brady picked.
    scopeState.selectedChildId = 'child-1'
    scopeState.selectedChild = { id: 'child-1', firstName: 'Brady' }
    scopeState.isScoped = true
    renderCard({ ownOnly: true })
    const call = await saveForLater()
    expect(call).toBeTruthy()
    expect(call[1]).not.toHaveProperty('student_id')
  })
})
