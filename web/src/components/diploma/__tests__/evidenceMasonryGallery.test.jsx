/**
 * The evidence gallery's subject filter, and the spellings it has to survive.
 *
 * Evidence arrives with `diploma_subjects` keyed by DISPLAY NAME, and which
 * display name depends on what wrote the row. A transcript-shaped path sends
 * 'Career & Technical Education'; a picker-shaped one sends 'CTE'; older rows
 * and imported data carry loose spellings like 'Arts', 'Music', 'Business' and
 * 'Technology' that belong to no current vocabulary at all.
 *
 * The gallery normalises all of them to a key before filtering. When a spelling
 * is missing from that map the code does not fail — it slugifies, so
 * 'Career & Technical Education' becomes the key 'career_&_technical_education'.
 * That is the failure this file exists to catch: the filter dropdown grows a
 * second entry for a subject the student already has, labelled with the raw
 * slug, and selecting either one shows only half their work. Nothing throws and
 * nothing logs.
 *
 * On 2026-09-09 that map stopped being eighteen hand-written entries and became
 * derived from the two shared vocabularies plus four explicit local aliases.
 * These tests pin the behaviour that derivation has to preserve.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import EvidenceMasonryGallery from '../EvidenceMasonryGallery'

// The gallery's job here is normalisation and filtering, not rendering media.
vi.mock('../../evidence/UnifiedEvidenceDisplay', () => ({
  default: () => <div data-testid="evidence-block" />,
}))
vi.mock('../../../hooks/useHidePillars', () => ({ default: () => false }))

/** One achievement whose single task is tagged with the given display names. */
const achievementTagged = (id, ...displayNames) => ({
  quest: { id, title: `Quest ${id}` },
  status: 'completed',
  task_evidence: {
    [`Task ${id}`]: {
      evidence_text: 'Some evidence',
      pillar: 'stem',
      diploma_subjects: Object.fromEntries(displayNames.map((n) => [n, 100])),
    },
  },
})

const subjectOptions = () => {
  // The subject filter is the second select; the first is the quest/pillar one.
  const selects = screen.getAllByRole('combobox')
  const subjectSelect = selects.find((s) =>
    within(s).queryByText('All Subjects') !== null
  )
  return within(subjectSelect)
    .getAllByRole('option')
    .map((o) => o.textContent)
    .filter((t) => t !== 'All Subjects')
}

describe('one subject, however it was spelled', () => {
  it('folds the transcript name and the picker name into a single filter', () => {
    render(
      <EvidenceMasonryGallery
        achievements={[
          achievementTagged('a', 'Career & Technical Education'),
          achievementTagged('b', 'CTE'),
        ]}
      />
    )
    // Two pieces of evidence, spelled two ways, one option counting both. A
    // regression here reads as "(1)" twice, under two different labels.
    expect(subjectOptions()).toEqual(['Career & Technical Education (2)'])
  })

  it('does the same where the two vocabularies differ on wording', () => {
    render(
      <EvidenceMasonryGallery
        achievements={[
          achievementTagged('a', 'Mathematics'),  // transcript
          achievementTagged('b', 'Math'),         // picker
        ]}
      />
    )
    expect(subjectOptions()).toEqual(['Mathematics (2)'])
  })

  it('and where both vocabularies agree', () => {
    render(<EvidenceMasonryGallery achievements={[achievementTagged('a', 'Science')]} />)
    expect(subjectOptions()).toEqual(['Science (1)'])
  })
})

describe('the loose spellings that belong to no vocabulary', () => {
  // These four cannot be derived from anything -- they are what older evidence
  // rows and imported transcripts actually contain. They are the reason the
  // gallery keeps an explicit alias map alongside the derived one.
  it.each([
    ['Arts', 'Fine Arts'],
    ['Music', 'Fine Arts'],
    ['Business', 'Career & Technical Education'],
    ['Technology', 'Digital Literacy'],
  ])('%s still resolves to %s', (loose, expectedLabel) => {
    render(<EvidenceMasonryGallery achievements={[achievementTagged('a', loose)]} />)
    expect(subjectOptions()).toEqual([`${expectedLabel} (1)`])
  })

  it('folds a loose spelling together with its canonical one', () => {
    render(
      <EvidenceMasonryGallery
        achievements={[
          achievementTagged('a', 'Music'),
          achievementTagged('b', 'Fine Arts'),
        ]}
      />
    )
    expect(subjectOptions()).toEqual(['Fine Arts (2)'])
  })
})

describe('a subject it has never heard of', () => {
  it('slugifies rather than dropping the evidence', () => {
    // Deliberately pinned: the fallback is not obviously right, but it is what
    // the gallery has always done, and silently discarding a student's evidence
    // because its subject was unfamiliar would be worse.
    render(<EvidenceMasonryGallery achievements={[achievementTagged('a', 'Underwater Basket Weaving')]} />)
    expect(subjectOptions()).toEqual(['underwater_basket_weaving (1)'])
  })
})
