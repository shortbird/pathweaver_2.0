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
import { CREDIT_REQUIREMENTS, TOTAL_CREDITS_REQUIRED, XP_PER_CREDIT } from '../../utils/creditRequirements'

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
    expect(rowFor('Electives').getByText('4/4')).toBeInTheDocument()
  })

  it('caps an over-earned subject at its requirement', () => {
    render(<StudentContext context={CONTEXT} loading={false} />)
    expect(rowFor('CTE').getByText('1/1')).toBeInTheDocument()
  })

  it('leaves genuinely unfinished subjects short', () => {
    render(<StudentContext context={CONTEXT} loading={false} />)
    expect(rowFor('Social Studies').getByText('2/4')).toBeInTheDocument()
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

  it('is not defined anywhere under web/src', () => {
    // The definition moved to shared/data/credits.json, which the backend reads
    // too (backend/generated/credits.py). So the answer here is now zero: any
    // hit is a NEW copy, which is what the four-copy history above was.
    const src = join(process.cwd(), 'src')
    const definers = walk(src).filter((path) => (
      !/\.test\.jsx?$/.test(path) &&
      /(const|let|var)\s+CREDIT_REQUIREMENTS\s*=\s*\{/.test(readFileSync(path, 'utf8'))
    ))
    expect(definers.map((p) => p.replace(src, 'src'))).toEqual([])
  })

  it('reaches the app from the shared module, not a local table', () => {
    // Without this, deleting @shared/credits and pasting the table back into
    // src/utils/creditRequirements.js as a plain object literal would pass the
    // test above (it looks for `CREDIT_REQUIREMENTS = {`, and a re-export is
    // not that shape). Assert the import instead of the absence.
    const shim = readFileSync(join(process.cwd(), 'src', 'utils', 'creditRequirements.js'), 'utf8')
    expect(shim).toMatch(/from '@shared\/credits'/)
  })

  it('is the only place under web/src that spells the XP-per-credit rate', () => {
    // The backend had SIX copies of this number and the ratchet in
    // backend/tests/unit/test_credit_constants_generated.py found the last two.
    // The web app had five of its own, in the demo, the portfolio and the prior-
    // learning wizard -- every one of them dividing or multiplying XP by a bare
    // 2000. A rate that is typed out is a rate that can be changed in four
    // places and missed in the fifth.
    //
    // Matched as arithmetic (`/ 2000`, `* 2000`) rather than as the bare number,
    // and then two shapes are excluded by hand because they are the same
    // characters meaning something else entirely: `{message.length}/2000` is a
    // character counter rendered as text, and `w3.org/2000/svg` is a namespace.
    // A check that flags those gets switched off, which is worse than no check.
    const src = join(process.cwd(), 'src')
    const ARITHMETIC = /[*/]\s*2000\b/
    const NOT_ARITHMETIC = [/w3\.org/, /\}\s*\/\s*2000/]
    const offenders = walk(src)
      .filter((path) => !/\.test\.jsx?$/.test(path))
      .flatMap((path) => readFileSync(path, 'utf8').split('\n')
        .map((line, i) => ({ path, i, line }))
        .filter(({ line }) => ARITHMETIC.test(line) && !NOT_ARITHMETIC.some((r) => r.test(line)))
        .map(({ path, i, line }) => `${path.replace(src, 'src')}:${i + 1}: ${line.trim()}`))

    expect(offenders).toEqual([])
  })

  it('is the only place under web/src that spells a transcript subject name', () => {
    // EIGHT components kept their own copy of the transcript vocabulary, and by
    // 2026-09-09 three of them disagreed about one subject: 'Career & Technical
    // Education' in the transcript views, 'Career & Technical' in the demo, and
    // 'Career & Tech Ed' on two portfolio cards. Three abbreviations of one
    // subject, in one product, none of them wrong on purpose.
    //
    // Only the LONG CTE name is checked, and that is deliberate. 'Science' and
    // 'Health' are the same word in both vocabularies. 'Mathematics' and
    // 'Physical Education' read as ordinary English and turn up in prose all over
    // the app -- a quest description saying 'Mathematics, algebra, geometry', the
    // handbook expanding STEM. Flagging those makes the check something people
    // argue with, and a check that gets argued with gets deleted.
    //
    // 'Career & Technical Education' is a phrase nobody writes by accident, and
    // it is precisely the one that drifted into three spellings.
    //
    // Comments are stripped first: several of the files below now explain this
    // history in prose, and flagging their own explanation would make the check
    // annoying enough to delete.
    const DISTINCTIVE = ['Career & Technical Education', 'Career & Tech Ed', 'Career & Technical']
    const stripComments = (src) => src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')

    const src = join(process.cwd(), 'src')
    const offenders = walk(src)
      .filter((path) => !/\.test\.jsx?$/.test(path))
      .filter((path) => {
        const code = stripComments(readFileSync(path, 'utf8'))
        return DISTINCTIVE.some((name) => code.includes(name))
      })
      .map((path) => path.replace(src, 'src'))

    expect(offenders).toEqual([])
  })

  it('agrees with the canonical JSON the backend also reads', () => {
    const canonical = JSON.parse(
      readFileSync(join(process.cwd(), '..', 'shared', 'data', 'credits.json'), 'utf8'),
    )
    expect(XP_PER_CREDIT).toBe(canonical.xpPerCredit)
    expect(TOTAL_CREDITS_REQUIRED).toBe(canonical.totalCreditsRequired)
    for (const row of canonical.subjects) {
      expect(CREDIT_REQUIREMENTS[row.key].credits).toBe(row.credits)
      expect(CREDIT_REQUIREMENTS[row.key].xpRequired).toBe(row.credits * canonical.xpPerCredit)
    }
  })
})
