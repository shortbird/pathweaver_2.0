/**
 * Diploma Credits — the panel a student reads to answer "what's left".
 *
 * Two properties matter here, and both are about not lying to a student.
 *
 * ORDER AND STATE: unfinished subjects lead, finished ones read as DONE rather
 * than as another bar, and the numbers a student tracks themselves by are
 * stated rather than left to be worked out.
 *
 * THE OVERFLOW RULE: credit earned past a subject's requirement flows into
 * Electives — the bucket defined as "anything" — capped at the Electives
 * requirement, and never between academic subjects. Before this, the excess was
 * silently discarded, which is both wrong about how transcripts work and the
 * reason a student's XP disagreed with their headline credits.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import SkillsGrowth from './SkillsGrowth'
import {
  splitCreditProgress,
  getCreditStanding,
  meetsGraduationRequirements,
} from '../../utils/creditRequirements'

// Finn's real shape after his prior learning was transcribed. CTE is over-earned
// against a 1.0 requirement while Electives is short — the exact case the
// overflow rule exists for.
const FINN_XP = {
  math: 6000,            // 3.0 / 3    complete
  science: 6000,         // 3.0 / 3    complete
  pe: 4000,              // 2.0 / 2    complete
  cte: 4500,             // 2.25 / 1   complete, 1.25 surplus
  financial_literacy: 1000,
  health: 1000,
  digital_literacy: 1000,
  electives: 6500,       // 3.25 / 4   0.75 short -> filled by CTE surplus
  language_arts: 6000,   // 3.0 / 4
  fine_arts: 2000,       // 1.0 / 1.5
  social_studies: 4000,  // 2.0 / 4
}

const ALL_MET = {
  language_arts: 8000, math: 6000, science: 6000, social_studies: 8000,
  financial_literacy: 1000, health: 1000, pe: 4000, fine_arts: 3000,
  cte: 2000, digital_literacy: 1000, electives: 8000,
}

const renderPanel = (xp = FINN_XP) =>
  render(<SkillsGrowth subjectXp={xp} xpByPillar={{ stem: 100 }} totalXp={42000} />)

const groupRows = (heading) => {
  const group = screen.getByRole('heading', { name: heading }).parentElement
  return within(group)
}

describe('the overflow rule', () => {
  it('spills surplus into Electives, completing it', () => {
    const { progress } = getCreditStanding(FINN_XP)
    const electives = progress.find((c) => c.subject === 'electives')
    expect(electives.overflowIn).toBe(0.75)
    expect(electives.isComplete).toBe(true)
  })

  it('takes only what the gap needs, leaving the rest genuinely beyond', () => {
    const { progress, beyond } = getCreditStanding(FINN_XP)
    const cte = progress.find((c) => c.subject === 'cte')
    expect(cte.overflowOut).toBe(0.75)   // of its 1.25 surplus
    expect(cte.creditsBeyond).toBe(0.5) // the remainder helps nobody
    expect(beyond).toBe(0.5)
  })

  it('never lets one academic subject satisfy another', () => {
    // Math wildly over-earned; Science untouched. Science must stay at zero.
    const { progress } = getCreditStanding({ math: 20000, science: 0 })
    const science = progress.find((c) => c.subject === 'science')
    expect(science.creditsCounted).toBe(0)
    expect(science.isComplete).toBe(false)
  })

  it('caps the spill at the Electives requirement', () => {
    const { progress, beyond } = getCreditStanding({ cte: 20000 }) // 10 credits
    const electives = progress.find((c) => c.subject === 'electives')
    expect(electives.creditsCounted).toBe(4)   // its requirement, not 9
    expect(beyond).toBe(5)                     // 10 earned - 1 cte - 4 electives
  })

  it('leaves elective over-earning as beyond, having nowhere to go', () => {
    const { progress, beyond } = getCreditStanding({ electives: 10000 }) // 5 / 4
    const electives = progress.find((c) => c.subject === 'electives')
    expect(electives.overflowIn).toBe(0)
    expect(beyond).toBe(1)
  })

  it('reports earned and applied as separate totals', () => {
    const standing = getCreditStanding(FINN_XP)
    expect(standing.totalEarned).toBe(21)
    expect(standing.totalApplied).toBe(20.5)
    expect(standing.remaining).toBe(3.5)
  })

  it('lets the graduation check use the same arithmetic as the panel', () => {
    /** A student told every subject is complete must not fail this. */
    expect(meetsGraduationRequirements(FINN_XP)).toBe(false)
    expect(meetsGraduationRequirements(ALL_MET)).toBe(true)
  })
})

describe('ordering', () => {
  it('puts unfinished subjects above finished ones', () => {
    renderPanel()
    const body = document.body.textContent
    expect(body.indexOf('Still to earn')).toBeLessThan(body.indexOf('Complete ·'))
  })

  it('leads the unfinished group with the closest one to done', () => {
    const { remaining } = splitCreditProgress(getCreditStanding(FINN_XP).progress)
    expect(remaining[0].subject).toBe('language_arts')     // 3 of 4
    expect(remaining[remaining.length - 1].subject).toBe('social_studies') // 2 of 4
  })

  it('counts each group in its heading', () => {
    renderPanel()
    expect(screen.getByRole('heading', { name: /Still to earn · 3/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Complete · 8/ })).toBeInTheDocument()
  })
})

describe('telling a student where they stand', () => {
  it('states the subject tally and the credits left', () => {
    renderPanel()
    expect(screen.getByText('8 of 11 subjects complete')).toBeInTheDocument()
    expect(screen.getByText('3.5 credits to go')).toBeInTheDocument()
  })

  it('says what was earned in total when it exceeds what the diploma needs', () => {
    renderPanel()
    expect(screen.getByText(/21 earned in total/)).toBeInTheDocument()
    expect(screen.getByText(/0.5 beyond what the diploma requires/)).toBeInTheDocument()
  })

  it('stays quiet about surplus when there is none', () => {
    renderPanel({ math: 2000 })
    expect(screen.queryByText(/earned in total/)).not.toBeInTheDocument()
  })

  it('says every subject is complete rather than showing an empty to-do list', () => {
    renderPanel(ALL_MET)
    expect(screen.getByText('Every subject complete')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Still to earn/ })).not.toBeInTheDocument()
  })
})

describe('a finished subject reads as finished', () => {
  it('says Done instead of a ratio', () => {
    renderPanel()
    expect(groupRows(/Complete · 8/).getAllByText('Done').length).toBe(8)
  })

  it('marks it complete for screen readers too, not just in colour', () => {
    renderPanel()
    expect(groupRows(/Complete · 8/).getAllByLabelText('Complete').length).toBe(8)
  })

  it('shows what is left on an unfinished subject, which is the useful number', () => {
    renderPanel()
    const todo = groupRows(/Still to earn · 3/)
    expect(todo.getByText('2 to go')).toBeInTheDocument()   // social studies
    expect(todo.getByText('1 to go')).toBeInTheDocument()   // language arts
    expect(todo.getByText('0.5 to go')).toBeInTheDocument() // fine arts
  })
})

describe('showing a student where their surplus went', () => {
  it('names the credit that arrived in Electives', () => {
    renderPanel()
    expect(screen.getByText('+0.75 from other subjects')).toBeInTheDocument()
  })

  it('names the credit that left the over-earned subject', () => {
    renderPanel()
    expect(screen.getByText('0.75 counted as electives')).toBeInTheDocument()
  })

  it('still shows the part that helps nobody, rather than hiding it', () => {
    renderPanel()
    expect(screen.getByText('+0.5')).toBeInTheDocument()
    // The old bug-looking ratio is gone either way.
    expect(screen.queryByText('2.25/1')).not.toBeInTheDocument()
  })
})
