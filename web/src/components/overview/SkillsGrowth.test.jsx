import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SkillsGrowth from './SkillsGrowth'

// Radar chart pulls in heavy chart deps; not under test here.
vi.mock('../diploma/SkillsRadarChart', () => ({
  default: () => <div data-testid="radar" />
}))

const renderSG = (props) =>
  render(
    <MemoryRouter>
      <SkillsGrowth {...props} />
    </MemoryRouter>
  )

describe('SkillsGrowth', () => {
  it('shows Optio diploma credits for a non-OEA student', () => {
    renderSG({ xpByPillar: { stem: 4000 }, subjectXp: { math: 6000 }, totalXp: 4000 })
    expect(screen.getByText('Diploma Credits')).toBeInTheDocument()
    expect(screen.getByText('Mathematics')).toBeInTheDocument()
  })

  it('shows the OEA pathway panel when oea progress is present', () => {
    const oea = {
      is_oea_student: true,
      enrollment: { pathway: { name: 'Traditionally Aligned' } },
      gpa: { unweighted: 4.0, weighted: 4.0 },
      progress: {
        total_earned: 6, total_required: 24, percent_complete: 25,
        foundation_earned: 5, foundation_required: 13,
        elective_earned: 1, elective_required: 11,
        is_complete: false,
        requirements: [
          { key: 'math', label: 'Mathematics', category: 'foundation', earned: 1, required: 3 },
          { key: 'language_arts', label: 'Language Arts', category: 'foundation', earned: 2, required: 4 }
        ]
      }
    }
    renderSG({ xpByPillar: { stem: 100 }, oea, totalXp: 100 })
    expect(screen.getByText('Hearthwood Academy Diploma')).toBeInTheDocument()
    expect(screen.getByText('Traditionally Aligned')).toBeInTheDocument()
    expect(screen.getByText('Mathematics')).toBeInTheDocument()
    expect(screen.getByText('Language Arts')).toBeInTheDocument()
    // Optio credit panel should NOT show
    expect(screen.queryByText('Diploma Credits')).not.toBeInTheDocument()
  })

  it('prompts an OEA student with no pathway to choose one', () => {
    const oea = { is_oea_student: true, enrollment: null, progress: null }
    renderSG({ xpByPillar: {}, oea })
    expect(screen.getByText('Choose your pathway')).toBeInTheDocument()
    expect(screen.queryByText('Diploma Credits')).not.toBeInTheDocument()
  })

  it('hides the diploma section when showDiplomaCredits is false', () => {
    renderSG({ xpByPillar: { stem: 100 }, subjectXp: { math: 6000 }, showDiplomaCredits: false })
    expect(screen.queryByText('Diploma Credits')).not.toBeInTheDocument()
    expect(screen.getByText('Learning Pillars')).toBeInTheDocument()
  })
})
