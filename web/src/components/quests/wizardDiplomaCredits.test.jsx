/**
 * The wizard's Diploma Credits step.
 *
 * It asks a student which subjects to aim a quest at, so it has to agree with
 * the diploma panel about where they stand. Two ways it didn't:
 *
 *   It carried its own copy of the requirement table, which had drifted —
 *   Social Studies wanted 7000 XP here and 8000 on the overview.
 *
 *   It read raw subject XP, so a subject already satisfied by overflow from an
 *   over-earned subject still showed as unfinished, inviting a student to spend
 *   a quest earning credit they already had. Finn hit exactly this: Electives
 *   read 81% when his over-earned CTE had already completed it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import QuestPersonalizationWizard from './QuestPersonalizationWizard'
import api from '../../services/api'
import { CREDIT_REQUIREMENTS, XP_PER_CREDIT } from '../../utils/creditRequirements'

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../contexts/AIAccessContext', () => ({
  useAIAccess: () => ({ canUseTaskGeneration: true }),
}))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', preferred_challenge_level: null } }),
}))
vi.mock('../../utils/logger', () => ({
  default: { error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

// Finn's real standing: CTE over-earned (4500 against a 2000 requirement) while
// Electives is 1500 short — the exact pair the overflow rule resolves.
const FINN = [
  { school_subject: 'math', xp_amount: 6000 },
  { school_subject: 'science', xp_amount: 6000 },
  { school_subject: 'pe', xp_amount: 4000 },
  { school_subject: 'cte', xp_amount: 4500 },
  { school_subject: 'financial_literacy', xp_amount: 1000 },
  { school_subject: 'health', xp_amount: 1000 },
  { school_subject: 'digital_literacy', xp_amount: 1000 },
  { school_subject: 'electives', xp_amount: 6500 },
  { school_subject: 'language_arts', xp_amount: 6000 },
  { school_subject: 'fine_arts', xp_amount: 2000 },
  { school_subject: 'social_studies', xp_amount: 4000 },
]

const cardFor = (label) =>
  within(screen.getByText(label).closest('button'))

const openWizard = async (subject_xp = FINN) => {
  api.get.mockResolvedValue({ data: { success: true, subject_xp } })
  api.post.mockResolvedValue({ data: { success: true, tasks: [] } })
  render(
    <QuestPersonalizationWizard
      questId="q1" questTitle="Build Your Own Website"
      onComplete={vi.fn()} onCancel={vi.fn()}
    />
  )
  // The credits step sits behind the AI-generate branch.
  api.post.mockResolvedValueOnce({ data: { session_id: 'sess-1' } })
  fireEvent.click(await screen.findByText('AI Generate'))
  await screen.findByText('Diploma Credits (Optional)')
}

beforeEach(() => vi.clearAllMocks())

describe('overflow reaches the wizard', () => {
  it('shows Electives as complete once surplus has filled it', async () => {
    await openWizard()
    const electives = cardFor('Electives')
    // 6500 of its own + 1500 overflowed from CTE = its full 8000.
    expect(electives.getByText('8,000 / 8,000 XP')).toBeInTheDocument()
    expect(electives.queryByText(/81%/)).not.toBeInTheDocument()
  })

  it('still shows genuinely unfinished subjects as unfinished', async () => {
    await openWizard()
    expect(cardFor('Social Studies').getByText(/%/)).toBeInTheDocument()
    expect(cardFor('Fine Arts').getByText(/%/)).toBeInTheDocument()
  })

  it('does not let one academic subject complete another', async () => {
    await openWizard([
      { school_subject: 'math', xp_amount: 20000 },
      { school_subject: 'science', xp_amount: 0 },
    ])
    expect(cardFor('Science').getByText('0 / 6,000 XP')).toBeInTheDocument()
  })
})

describe('one source of truth for requirements', () => {
  it('asks for the same Social Studies requirement as the diploma panel', async () => {
    await openWizard()
    const required = CREDIT_REQUIREMENTS.social_studies.credits * XP_PER_CREDIT
    expect(required).toBe(8000)
    expect(cardFor('Social Studies').getByText(`4,000 / ${required.toLocaleString()} XP`))
      .toBeInTheDocument()
  })

  it('caps a subject display at its requirement rather than showing over 100%', async () => {
    await openWizard()
    // CTE earned 4500 against 2000; the card reads full, not 225%.
    expect(cardFor('CTE').getByText('2,000 / 2,000 XP')).toBeInTheDocument()
  })

  it('handles a student with no XP at all', async () => {
    await openWizard([])
    expect(cardFor('Math').getByText('0 / 6,000 XP')).toBeInTheDocument()
  })
})
