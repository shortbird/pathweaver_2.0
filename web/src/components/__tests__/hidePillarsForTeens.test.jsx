/**
 * From 13 a student works toward the diploma, so the diploma subject is the
 * label and the five pillars go (product decision, 2026-09-28). The rule lives
 * in hooks/useHidePillars.js; these pin the student-facing surfaces that read
 * it: a 13+ student sees the subject and no pillar, an under-13 still sees the
 * pillar.
 *
 * The hook is mocked here -- its own age and org-flag logic has its own tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import QuestEnrollment from '../quest/QuestEnrollment'
import TaskLibraryBrowser from '../../pages/TaskLibraryBrowser'
import EvidenceDetailModal from '../diploma/EvidenceDetailModal'
import AchievementDetailModal from '../diploma/AchievementDetailModal'
import CompactSidebar from '../diploma/CompactSidebar'
import SkillsGrowth from '../overview/SkillsGrowth'

const state = vi.hoisted(() => ({ hide: false }))
vi.mock('../../hooks/useHidePillars', () => ({ default: () => state.hide }))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ hasAnyRole: () => false }),
}))
vi.mock('../../contexts/ConfirmContext', () => ({
  useConfirm: () => async () => true,
}))
vi.mock('../evidence/UnifiedEvidenceDisplay', () => ({
  default: () => <div data-testid="evidence" />,
}))
vi.mock('../diploma/SkillsRadarChart', () => ({
  default: () => <div data-testid="radar" />,
}))

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }))
vi.mock('../../services/api', () => ({ default: api, evidenceAPI: {} }))

// A Communication task that mostly counts toward Language Arts.
const credits = { language_arts: 40, social_studies: 10 }

beforeEach(() => {
  state.hide = false
  api.get.mockReset()
})

describe('QuestEnrollment template tasks', () => {
  const quest = {
    template_tasks: [{
      id: 't1', title: 'Write a letter to the editor', pillar: 'communication',
      xp_value: 50, is_required: true, subject_xp_distribution: credits,
    }],
  }
  const show = () => render(
    <QuestEnrollment quest={quest} isQuestCompleted={false} totalTasks={1}
      isEnrolling={false} onEnroll={() => {}} onShowPersonalizationWizard={() => {}} />,
  )

  it('labels each task by its lead subject for a 13+ student', () => {
    state.hide = true
    show()
    expect(screen.getByText('Language Arts')).toBeInTheDocument()
    expect(screen.queryByText('Communication')).not.toBeInTheDocument()
  })

  it('keeps the pillar for a student under 13', () => {
    show()
    expect(screen.getByText('Communication')).toBeInTheDocument()
    expect(screen.queryByText('Language Arts')).not.toBeInTheDocument()
  })
})

describe('Task library', () => {
  const show = () => {
    api.get.mockImplementation((url) => Promise.resolve({
      data: url.endsWith('/task-library')
        ? { tasks: [{ id: 's1', title: 'Map your block', pillar: 'civics', xp_value: 75, diploma_subjects: { 'Social Studies': 75 } }] }
        : { id: 'q1', title: 'Neighbourhood', quest_tasks: [] },
    }))
    render(
      <MemoryRouter initialEntries={['/quests/q1/library']}>
        <Routes><Route path="/quests/:questId/library" element={<TaskLibraryBrowser />} /></Routes>
      </MemoryRouter>,
    )
    return screen.findByText('Map your block')
  }

  it('drops the pillar chip for a 13+ student', async () => {
    state.hide = true
    await show()
    expect(screen.queryByText('Civics')).not.toBeInTheDocument()
  })

  it('keeps the pillar chip for a student under 13', async () => {
    await show()
    await waitFor(() => expect(screen.getByText('Civics')).toBeInTheDocument())
  })
})

describe('Portfolio evidence modal', () => {
  const item = {
    questTitle: 'Neighbourhood', taskTitle: 'Write a letter', pillar: 'communication',
    xpAwarded: 50, completedAt: '2026-09-01',
    evidence: { evidence_text: 'Dear editor', diploma_subjects: { 'Language Arts': 40, 'Social Studies': 10 } },
  }

  it('names the subject in a brand header for a 13+ student', () => {
    state.hide = true
    render(<EvidenceDetailModal isOpen onClose={() => {}} evidenceItem={item} />)
    expect(screen.getByText('Language Arts')).toBeInTheDocument()
    expect(screen.queryByText('Communication')).not.toBeInTheDocument()
    expect(screen.getByText('Neighbourhood').closest('.sticky').className).toContain('from-optio-purple')
  })

  it('keeps the pillar for a student under 13', () => {
    render(<EvidenceDetailModal isOpen onClose={() => {}} evidenceItem={item} />)
    expect(screen.getByText('Communication')).toBeInTheDocument()
    expect(screen.getByText('Neighbourhood').closest('.sticky').className).toContain('from-pillar-communication')
  })
})

describe('Portfolio achievement modal', () => {
  const achievement = {
    quest: { title: 'Neighbourhood', description: 'Look around.' },
    status: 'completed', completed_at: '2026-09-01',
    task_evidence: {
      'Write a letter': {
        pillar: 'communication', xp_awarded: 50, completed_at: '2026-09-01',
        evidence_text: 'Dear editor', diploma_subjects: { 'Language Arts': 50 },
      },
    },
  }

  it('names the subject for a 13+ student', () => {
    state.hide = true
    render(<AchievementDetailModal isOpen onClose={() => {}} achievement={achievement} />)
    expect(screen.getByText('Language Arts')).toBeInTheDocument()
    expect(screen.queryByText('Communication')).not.toBeInTheDocument()
  })

  it('keeps the pillar for a student under 13', () => {
    render(<AchievementDetailModal isOpen onClose={() => {}} achievement={achievement} />)
    expect(screen.getByText('Communication')).toBeInTheDocument()
  })
})

describe('Pillar charts', () => {
  it('the overview shows no pillar radar where the pillars are hidden', () => {
    state.hide = true
    render(<MemoryRouter><SkillsGrowth xpByPillar={{ stem: 400 }} subjectXp={{ math: 600 }} totalXp={400} /></MemoryRouter>)
    expect(screen.queryByText('Learning Pillars')).not.toBeInTheDocument()
    expect(screen.queryByTestId('radar')).not.toBeInTheDocument()
  })

  it('the overview keeps the radar for a student under 13', () => {
    render(<MemoryRouter><SkillsGrowth xpByPillar={{ stem: 400 }} subjectXp={{ math: 600 }} totalXp={400} /></MemoryRouter>)
    expect(screen.getByText('Learning Pillars')).toBeInTheDocument()
    expect(screen.getByTestId('radar')).toBeInTheDocument()
  })

  // The sidebar already picks credits over the radar by the owner's age; a
  // school with the pillars off gets the credit view for its under-13s too.
  it('the portfolio sidebar trades the radar for credits where the pillars are hidden', () => {
    state.hide = true
    const nineYearsAgo = `${new Date().getFullYear() - 9}-01-01`
    render(
      <CompactSidebar totalXP={{ stem: 500 }} subjectXP={{ math: 600 }} totalXPCount={500}
        isOwner studentName="Ada" dateOfBirth={nineYearsAgo} onCreditsClick={() => {}} />,
    )
    expect(screen.queryByText('Learning Pillars')).not.toBeInTheDocument()
    expect(screen.getByText('Diploma Credits')).toBeInTheDocument()
  })
})
