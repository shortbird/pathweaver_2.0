/**
 * Where a quest card points depends on WHO is looking.
 *
 * /parent/quest/:studentId/:questId is gated allow=('parent','observer') on the
 * backend. The card used to choose its destination from `!!studentId`, and
 * every caller passes a studentId -- including the student's own overview page,
 * which passes the viewer's own id, and the advisor/admin student overview.
 *
 * So a student clicking their own quest, and a teacher clicking their student's,
 * both navigated to a page that answers 403 (Sentry OPTIO-WEB-1B: an org admin
 * at Arete Academy, from her own student overview, 2026-09-10).
 *
 * This is the same mistake the engagement fetch in this component was already
 * fixed for (OPTIO-WEB-6). The link kept it a while longer.
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

vi.mock('../../contexts/ActingAsContext', () => ({
  useActingAs: () => ({ setActingAs: vi.fn() }),
}))

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

  it('sends a guardian to the parent quest view', () => {
    renderSnapshot({ viewerMode: 'parent' })
    expect(questHref()).toBe(`/parent/quest/${STUDENT_ID}/${QUEST_ID}`)
  })

  it('sends an observer to the parent quest view', () => {
    renderSnapshot({ viewerMode: 'observer' })
    expect(questHref()).toBe(`/parent/quest/${STUDENT_ID}/${QUEST_ID}`)
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
