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
  it('shows Optio diploma credits', () => {
    renderSG({ xpByPillar: { stem: 4000 }, subjectXp: { math: 6000 }, totalXp: 4000 })
    expect(screen.getByText('Diploma Credits')).toBeInTheDocument()
    expect(screen.getByText('Mathematics')).toBeInTheDocument()
  })

  it('hides the diploma section when showDiplomaCredits is false', () => {
    renderSG({ xpByPillar: { stem: 100 }, subjectXp: { math: 6000 }, showDiplomaCredits: false })
    expect(screen.queryByText('Diploma Credits')).not.toBeInTheDocument()
    expect(screen.getByText('Learning Pillars')).toBeInTheDocument()
  })
})
