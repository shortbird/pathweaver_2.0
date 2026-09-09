/**
 * SubjectBadges answers to every spelling a subject arrives as.
 *
 * A subject reaches this component three different ways depending on which
 * endpoint produced the data: as a database key ('cte'), as the picker name
 * ('CTE'), or as the transcript name ('Career & Technical Education'). The badge
 * has to render the same thing for all three, or the same subject looks like
 * three different subjects across two screens.
 *
 * That used to be twenty-five hand-written entries, three per subject. On
 * 2026-09-09 they became derived from the two shared vocabularies
 * (shared/data/subjects.json and shared/data/credits.json), which is what stops
 * a twelfth subject from silently rendering as a grey "unknown" badge because
 * somebody added two of its three spellings.
 *
 * WHY THIS FILE EXISTS AT ALL. The component had no test. The derivation was
 * checked once, by hand, against the literal it replaced -- and a one-off check
 * that is then deleted is exactly the thing this repo keeps getting caught by
 * (see docs/remediation-2026-09, where four defects shipped in artifacts that
 * were reviewed but never executed). So the check is a test now.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SUBJECTS as SHARED_SUBJECTS } from '@shared/subjects'
import { TRANSCRIPT_SUBJECT_NAMES } from '@shared/credits'
import SubjectBadges from '../SubjectBadges'

const spellingsOf = (s) => [
  ...new Set([s.key, s.name, TRANSCRIPT_SUBJECT_NAMES[s.key] || s.name]),
]

describe('every spelling of a subject renders the same badge', () => {
  it.each(SHARED_SUBJECTS.map((s) => [s.key, s]))(
    '%s answers to its key, its picker name and its transcript name',
    (_key, subject) => {
      for (const spelling of spellingsOf(subject)) {
        const { unmount } = render(<SubjectBadges subjectXpDistribution={{ [spelling]: 100 }} />)
        // The label is always the short picker name, whichever spelling came in.
        expect(screen.getByText(new RegExp(`^${subject.name}\\b`))).toBeInTheDocument()
        unmount()
      }
    }
  )

  it('gives CTE one identity across all three of its spellings', () => {
    // The subject that actually drifted: three names in three components.
    const colours = ['cte', 'CTE', 'Career & Technical Education'].map((spelling) => {
      const { container, unmount } = render(
        <SubjectBadges subjectXpDistribution={{ [spelling]: 100 }} showIcon />
      )
      const badge = container.querySelector('[style*="color"]')
      const colour = badge.getAttribute('style')
      const text = badge.textContent
      unmount()
      return { colour, text }
    })
    expect(colours[0]).toEqual(colours[1])
    expect(colours[1]).toEqual(colours[2])
    expect(colours[0].text).toContain('CTE')
  })
})

describe('what it does with a subject it does not know', () => {
  it('falls back to a grey badge rather than an uncoloured one', () => {
    // The fallback must survive the derivation. Building the map by iterating
    // the shared subjects makes it tempting to emit a config for every subject
    // whether or not this file gives it a colour -- which would render a badge
    // with `color: undefined` instead of taking this path.
    const { container } = render(
      <SubjectBadges subjectXpDistribution={{ underwater_basket_weaving: 50 }} />
    )
    const badge = container.querySelector('[style*="color"]')
    // jsdom normalises the hex to rgb(), so assert the colour it resolves to.
    expect(badge.getAttribute('style')).toContain('rgb(107, 114, 128)')
    expect(badge.textContent).toContain('underwater_basket_weaving')
  })

  it('renders nothing at all for no distribution', () => {
    const { container } = render(<SubjectBadges subjectXpDistribution={null} />)
    expect(container.firstChild).toBeNull()
  })
})
