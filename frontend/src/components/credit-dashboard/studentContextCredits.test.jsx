/**
 * The advisor's credit dashboard, and the one-table rule.
 *
 * This panel and the student's own diploma panel describe the same standing to
 * two different people, so they have to agree. It used to hold its own copy of
 * the requirement table and cap each subject itself, which predated elective
 * overflow — an advisor reviewing credit saw a subject as unfinished that the
 * student's own page already showed as complete.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import StudentContext from './StudentContext'

// Finn: CTE over-earned (4500 against 2000) while Electives sits 1500 short.
const CONTEXT = {
  student: { first_name: 'Finn', last_name: "O'Neill" },
  subject_xp: [
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
  ],
}

const rowFor = (label) => within(screen.getByText(label).closest('div').parentElement)

describe('the advisor sees the same standing the student does', () => {
  it('counts credit that overflowed into Electives', () => {
    render(<StudentContext context={CONTEXT} loading={false} />)
    expect(rowFor('Electives').getByText('4.0/4')).toBeInTheDocument()
  })

  it('caps an over-earned subject at its requirement', () => {
    render(<StudentContext context={CONTEXT} loading={false} />)
    expect(rowFor('CTE').getByText('1.0/1')).toBeInTheDocument()
  })

  it('leaves genuinely unfinished subjects short', () => {
    render(<StudentContext context={CONTEXT} loading={false} />)
    expect(rowFor('Social Studies').getByText('2.0/4')).toBeInTheDocument()
  })

  it('totals the applied credit, matching the diploma panel', () => {
    render(<StudentContext context={CONTEXT} loading={false} />)
    expect(screen.getByText(/20\.5 \/ 24 credits/)).toBeInTheDocument()
  })

  it('asks for the shared Social Studies requirement, not a stale 3.5', () => {
    render(<StudentContext context={CONTEXT} loading={false} />)
    expect(rowFor('Social Studies').queryByText(/\/3\.5/)).not.toBeInTheDocument()
  })
})

describe('one requirement table', () => {
  /**
   * Four copies of this table existed. They drifted — two said Social Studies
   * was 3.5 against the 4.0 in the shared table and in the backend — and
   * because two of them were never read, nothing caught it. None of the copies
   * knew about elective overflow either.
   *
   * This walks the source rather than trusting a grep, so a new copy fails here
   * instead of being found the next time a student is told two different things
   * on two screens.
   */
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path)
    return /\.(js|jsx)$/.test(name) ? [path] : []
  })

  it('is defined in exactly one place', () => {
    const src = join(process.cwd(), 'src')
    const definers = walk(src).filter((path) => (
      !/\.test\.jsx?$/.test(path) &&
      /(const|let|var)\s+CREDIT_REQUIREMENTS\s*=\s*\{/.test(readFileSync(path, 'utf8'))
    ))
    expect(definers.map((p) => p.replace(src, 'src'))).toEqual([
      join('src', 'utils', 'creditRequirements.js'),
    ])
  })
})
