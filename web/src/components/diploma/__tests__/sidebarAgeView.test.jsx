import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * One picture of a learner's work, chosen by age.
 *
 * Tanner <> Finn, 2026-09-07: "show that radar chart on the left to younger
 * kids who are too young for a diploma, and once you're ready to start working
 * on your diploma, it switches to show you the diploma thing instead. We have
 * a lot of elementary age kids who use it and they're not worried about the
 * diploma credits."
 *
 * Before this the sidebar stacked both, so a nine-year-old carried a 26-credit
 * graduation tracker and a high schooler had their credit progress pushed
 * below a chart Finn described as "not really applied to me".
 */

vi.mock('../SkillsRadarChart', () => ({ default: () => <div data-testid="radar" /> }))

import CompactSidebar from '../CompactSidebar'

const dobForAge = (years) => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

const show = (dateOfBirth) => render(
  <CompactSidebar
    totalXP={{ stem: 500, art: 200 }}
    subjectXP={{ social_studies: 4600 }}
    pendingSubjectXP={{ social_studies: 2300 }}
    totalXPCount={4800}
    isOwner
    studentName="Finn"
    dateOfBirth={dateOfBirth}
    onCreditsClick={() => {}}
  />
)

describe('Diploma sidebar', () => {
  it('shows learning pillars and no credits under 13', () => {
    show(dobForAge(9))

    expect(screen.getByText('Learning Pillars')).toBeInTheDocument()
    expect(screen.queryByText('Diploma Credits')).not.toBeInTheDocument()
  })

  it('shows diploma credits and no pillars at 13 and up', () => {
    show(dobForAge(16))

    expect(screen.getByText('Diploma Credits')).toBeInTheDocument()
    expect(screen.queryByText('Learning Pillars')).not.toBeInTheDocument()
  })

  it('switches on the 13th birthday, not before', () => {
    show(dobForAge(13))

    expect(screen.getByText('Diploma Credits')).toBeInTheDocument()
    expect(screen.queryByText('Learning Pillars')).not.toBeInTheDocument()
  })

  it('falls back to credits when no birthday is on file', () => {
    // Public portfolio payloads omit date_of_birth on purpose. Defaulting to
    // the radar would hide a 17-year-old's transcript progress from them.
    show(undefined)

    expect(screen.getByText('Diploma Credits')).toBeInTheDocument()
    expect(screen.queryByText('Learning Pillars')).not.toBeInTheDocument()
  })
})
