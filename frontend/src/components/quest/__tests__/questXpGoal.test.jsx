import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * "0 / 300 XP" on a quest that has a finish line.
 *
 * iCreate, 2026-09-03 (Nicole Connole): "can we have 0/and the amount of XP that
 * they need to complete." The header showed the quest's TOTAL XP, which is what
 * the work is worth rather than what it takes to finish, and the school's target
 * (quests.xp_threshold) was invisible until POST /api/quests/:id/end refused the
 * student at the end with "you need 300 XP to submit (you have 150)".
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, effectiveRole: 'student' }),
}))
vi.mock('../../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn() }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock('../../../hooks/api/useQuests', () => ({ useQuestEngagement: () => ({ data: null }) }))
vi.mock('../RhythmIndicator', () => ({ default: () => null }))
vi.mock('../EngagementCalendar', () => ({ default: () => null }))
vi.mock('../RhythmExplainerModal', () => ({ default: () => null }))

import QuestDetailHeader from '../QuestDetailHeader'

const quest = (extra = {}) => ({
  id: 'q1', title: 'Reading Appreciation', quest_type: 'project',
  metadata: { total_xp: 400 }, user_enrollment: { id: 'e1' }, ...extra,
})

const show = (q, earnedXP = 0) => render(
  <MemoryRouter>
    <QuestDetailHeader quest={q} earnedXP={earnedXP} isQuestCompleted={false}
      onEndQuest={vi.fn()} endQuestMutation={{ isPending: false }} />
  </MemoryRouter>,
)

beforeEach(() => vi.clearAllMocks())

describe('the quest XP badge', () => {
  it('counts towards the school\'s target once the student is on the quest', () => {
    show(quest({ xp_threshold: 300 }), 0)
    expect(screen.getByText('0 / 300 XP')).toBeInTheDocument()
    // Not the total, which is a different number and the one that misled.
    expect(screen.queryByText('400 XP')).not.toBeInTheDocument()
  })

  it('shows progress part-way through', () => {
    show(quest({ xp_threshold: 300 }), 150)
    expect(screen.getByText('150 / 300 XP')).toBeInTheDocument()
  })

  it('does not run past the target it has reached', () => {
    show(quest({ xp_threshold: 300 }), 450)
    expect(screen.getByText('450 / 300 XP')).toBeInTheDocument()
  })

  it('falls back to the quest total when no target is set', () => {
    show(quest(), 150)
    expect(screen.getByText('400 XP')).toBeInTheDocument()
    expect(screen.queryByText(/ \/ /)).not.toBeInTheDocument()
  })

  // Before enrolling there is no progress to report, so a bare "0 /" would read
  // as a score rather than a starting line.
  it('names the total, not a target, to somebody who has not started', () => {
    show(quest({ xp_threshold: 300, user_enrollment: null }), 0)
    expect(screen.getByText('400 XP')).toBeInTheDocument()
    expect(screen.queryByText('0 / 300 XP')).not.toBeInTheDocument()
  })
})
