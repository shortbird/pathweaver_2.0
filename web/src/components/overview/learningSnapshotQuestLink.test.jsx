/**
 * Where a quest card points depends on WHO is looking.
 *
 * The card used to choose its destination from `!!studentId`, and every
 * caller passes a studentId -- including the student's own overview page,
 * which passes the viewer's own id, and the advisor/admin student overview.
 * So a student clicking their own quest, and a teacher clicking their
 * student's, both navigated to a parent-only page that answers 403 (Sentry
 * OPTIO-WEB-1B: an org admin at Arete Academy, from her own student overview,
 * 2026-09-10). Same mistake the engagement fetch was fixed for (OPTIO-WEB-6).
 *
 * Since 2026-09-15 a parent opens the child's quest in family scope -- the
 * same /quests/:id page the child sees, pointed at the child -- instead of the
 * thinner ParentQuestView (linked students) or an act-as token swap
 * (dependents). Observers have no per-quest page and get no link.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import LearningSnapshot from './LearningSnapshot'

const STUDENT_ID = 'student-1'
const QUEST_ID = 'quest-1'
const VIEWER_ID = 'viewer-1'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: VIEWER_ID } }),
}))

const enterScope = vi.fn()
const navigate = vi.fn()
vi.mock('../../contexts/FamilyScopeContext', () => ({
  useFamilyScope: () => ({ enterScope }),
}))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('../../hooks/api/useQuests', () => ({
  useQuestEngagement: () => ({ data: null }),
  useStudentQuestEngagement: () => ({ data: null }),
}))

const activeQuests = [{
  quest_id: QUEST_ID,
  quests: { id: QUEST_ID, title: 'Build a telescope' },
}]

function renderSnapshot(props) {
  return render(
    <MemoryRouter>
      <LearningSnapshot
        engagementData={{ calendar: [], summary: {} }}
        activeQuests={activeQuests}
        recentCompletions={[]}
        studentId={STUDENT_ID}
        {...props}
      />
    </MemoryRouter>
  )
}

function questHref() {
  const link = screen.getByText('Build a telescope').closest('a')
  return link ? link.getAttribute('href') : null
}

describe('quest card destination', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens the child\'s quest in family scope for a guardian', () => {
    renderSnapshot({ viewerMode: 'parent' })
    expect(questHref()).toBeNull()
    screen.getByText('Build a telescope').closest('button').click()
    expect(enterScope).toHaveBeenCalledWith(STUDENT_ID)
    expect(navigate).toHaveBeenCalledWith(`/quests/${QUEST_ID}`)
  })

  it('does not link an observer anywhere', () => {
    // Observers had a link to the parent quest view, a page that refused them.
    renderSnapshot({ viewerMode: 'observer' })
    expect(screen.getByText('Build a telescope')).toBeInTheDocument()
    expect(questHref()).toBeNull()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('sends a student to their own quest page, not the parent view', () => {
    // StudentOverviewPage passes the viewer's own id as studentId, so a
    // studentId alone never meant "somebody else's child".
    renderSnapshot({ viewerMode: 'student' })
    expect(questHref()).toBe(`/quests/${QUEST_ID}`)
  })

  it('does not link a staff viewer anywhere', () => {
    // There is no teacher-facing per-quest page. A card that navigates to a
    // refusal is worse than one that does not navigate.
    renderSnapshot({ viewerMode: 'advisor' })
    expect(screen.getByText('Build a telescope')).toBeInTheDocument()
    expect(questHref()).toBeNull()
  })

  it('never points a staff viewer at the parent quest view', () => {
    const { container } = renderSnapshot({ viewerMode: 'advisor' })
    expect(container.innerHTML).not.toContain('/parent/quest/')
  })
})
