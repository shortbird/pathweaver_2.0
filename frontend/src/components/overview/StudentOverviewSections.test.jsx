import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import StudentOverviewSections from './StudentOverviewSections'

vi.mock('./LearningSnapshot', () => ({ default: () => <div data-testid="snapshot" /> }))
vi.mock('./SkillsGrowth', () => ({ default: () => <div data-testid="skills" /> }))
vi.mock('./PortfolioSection', () => ({ default: () => <div data-testid="portfolio" /> }))
vi.mock('./LearningJournalSection', () => ({ default: () => <div data-testid="journal" /> }))
vi.mock('./TranscriptSection', () => ({ default: () => <div data-testid="transcript" /> }))
vi.mock('./CollapsibleSection', () => ({
  default: ({ title, children }) => <section><h2>{title}</h2>{children}</section>
}))

const baseData = {
  activeQuests: [{ id: 'q1' }],
  recentCompletions: [],
  xpByPillar: { stem: 1000 },
  subjectXp: { math: 4000 },
  totalXp: 1000,
  pillarsData: [],
  questOrbs: [{ id: 'o1' }],
  achievements: [{ id: 'a1' }],
  oea: null
}

describe('StudentOverviewSections', () => {
  it('renders the Skills & Growth section when there is data', () => {
    render(<StudentOverviewSections data={baseData} studentId="s1" showJournal />)
    expect(screen.getByText('Skills & Growth')).toBeInTheDocument()
    expect(screen.getByTestId('skills')).toBeInTheDocument()
  })

  it('shows Skills & Growth for an OEA student even with no XP when hiding empties', () => {
    const data = { ...baseData, totalXp: 0, xpByPillar: {}, oea: { is_oea_student: true } }
    render(<StudentOverviewSections data={data} studentId="s1" hideEmptySections />)
    expect(screen.getByText('Skills & Growth')).toBeInTheDocument()
  })

  it('hides Skills & Growth for a non-OEA student with no XP when hiding empties', () => {
    const data = { ...baseData, totalXp: 0, xpByPillar: {}, questOrbs: [], achievements: [], activeQuests: [], oea: null }
    render(<StudentOverviewSections data={data} studentId="s1" hideEmptySections />)
    expect(screen.queryByText('Skills & Growth')).not.toBeInTheDocument()
  })
})
