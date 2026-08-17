/**
 * Prior learning -> transcript, and the AI step in front of it.
 *
 * The whole design rests on one property: the model proposes and a person
 * decides. So the tests that matter are the ones that would catch that property
 * quietly breaking — a suggestion becoming an award without a click, or a
 * record reaching a transcript twice.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('./useSisOrg', () => ({ useSisOrg: () => ({ orgId: 'org-1' }) }))

import PriorLearningPage, { creditsFromSuggestion, parseCourseText } from './PriorLearningPage'

const SUBJECTS = [
  { key: 'math', name: 'Math' },
  { key: 'social_studies', name: 'Social Studies' },
]

const SUGGESTION = {
  summary: 'A junior year transcript from Cava Academy.',
  school_name: 'Cava Academy',
  started_on: '2024-08-20',
  subjects: [
    {
      subject: 'social_studies', credits: 1.0, confidence: 0.94,
      rationale: 'US History with a passing grade.',
      courses: [{ name: 'US History', credits: 1.0, term: 'full_year' }],
    },
    { subject: 'math', credits: 0.5, confidence: 0.41, rationale: 'Unclear term.' },
  ],
  flags: ['Page 2 of the scan is cut off'],
}

const record = (over = {}) => ({
  id: 'rec-1', title: 'Junior year', status: 'submitted', student_name: 'Finn',
  provider: 'Cava Academy', awarded_credits: {}, evidence: [], ...over,
})

const mockQueue = (records) => {
  api.get.mockResolvedValue({
    data: { records, counts: {}, subjects: SUBJECTS },
  })
}

beforeEach(() => vi.clearAllMocks())

describe('the analyze step', () => {
  it('asks the backend to read the evidence and shows what came back', async () => {
    mockQueue([record()])
    api.post.mockResolvedValue({ data: { suggestion: SUGGESTION } })
    render(<PriorLearningPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Analyze evidence' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/prior-learning/rec-1/analyze', { organization_id: 'org-1' }))
    expect(await screen.findByText('US History')).toBeInTheDocument()
    expect(screen.getByText(/Suggested transcript — not a decision/i)).toBeInTheDocument()
  })

  it('draws the proposal as transcript rows, not a paragraph', async () => {
    mockQueue([record({ ai_suggestion: SUGGESTION })])
    render(<PriorLearningPage />)

    // One row per course, with the columns a registrar checks.
    const row = (await screen.findByText('US History')).closest('tr')
    expect(within(row).getByText('social_studies')).toBeInTheDocument()
    expect(within(row).getByText('Full year')).toBeInTheDocument()
    expect(within(row).getByText('1')).toBeInTheDocument()

    // The foot totals in both units the decision is made in.
    expect(screen.getByText('1.5')).toBeInTheDocument()
    expect(screen.getByText('3000 XP')).toBeInTheDocument()
  })

  // A subject missing from the table is credit approved without being seen.
  it('gives a credited subject a row even when no course was named', async () => {
    mockQueue([record({ ai_suggestion: SUGGESTION })])
    render(<PriorLearningPage />)
    const cells = [...(await screen.findByText('math')).closest('tr').cells]
      .map((c) => c.textContent.trim())
    // Course and Term both read "—"; the credit is still on the row.
    expect(cells[0]).toMatch(/^—/)
    expect(cells[1]).toBe('math')
    expect(cells[2]).toBe('—')
    expect(cells[3]).toBe('0.5')
  })

  it('calls out a shaky reading instead of showing it like the confident one', async () => {
    mockQueue([record({ ai_suggestion: SUGGESTION })])
    render(<PriorLearningPage />)

    const shaky = (await screen.findByText('math')).closest('tr')
    expect(within(shaky).getByText('41%')).toBeInTheDocument()
    expect(within(shaky).getByText('check this')).toBeInTheDocument()

    const confident = screen.getByText('US History').closest('tr')
    expect(within(confident).getByText('94%')).toBeInTheDocument()
    expect(within(confident).queryByText('check this')).not.toBeInTheDocument()

    expect(screen.getByText(/Page 2 of the scan is cut off/)).toBeInTheDocument()
  })

  it('never awards on its own — analyzing posts nothing to review', async () => {
    mockQueue([record()])
    api.post.mockResolvedValue({ data: { suggestion: SUGGESTION } })
    render(<PriorLearningPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Analyze evidence' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))

    const called = api.post.mock.calls.map(([url]) => url)
    expect(called.some((u) => u.includes('/review') || u.includes('/credit'))).toBe(false)
  })
})

describe('using a suggestion', () => {
  it('copies the numbers into the reviewer’s boxes, still needing an Accept', async () => {
    mockQueue([record({ ai_suggestion: SUGGESTION })])
    api.post.mockResolvedValue({ data: {} })
    render(<PriorLearningPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Use these numbers' }))

    expect(await screen.findByLabelText('Social Studies credits')).toHaveValue(1)
    expect(screen.getByLabelText('Math credits')).toHaveValue(0.5)
    // Filling boxes is not awarding.
    expect(api.post).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /Accept & award/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/prior-learning/rec-1/review',
      expect.objectContaining({
        status: 'accepted',
        awarded_credits: { social_studies: 1, math: 0.5 },
      })))
  })

  it('lets the reviewer overrule the suggestion before accepting', async () => {
    mockQueue([record({ ai_suggestion: SUGGESTION })])
    api.post.mockResolvedValue({ data: {} })
    render(<PriorLearningPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Use these numbers' }))
    const math = await screen.findByLabelText('Math credits')
    await userEvent.clear(math)
    await userEvent.type(math, '1')

    await userEvent.click(screen.getByRole('button', { name: /Accept & award/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/prior-learning/rec-1/review',
      expect.objectContaining({ awarded_credits: { social_studies: 1, math: 1 } })))
  })
})

describe('the transcript step', () => {
  const accepted = record({
    status: 'accepted',
    awarded_credits: { social_studies: 1.0 },
    ai_suggestion: SUGGESTION,
  })

  it('only appears once a record is accepted', async () => {
    mockQueue([record({ status: 'submitted' })])
    render(<PriorLearningPage />)
    await screen.findByText('Junior year')
    expect(screen.queryByRole('button', { name: 'Add to transcript' })).not.toBeInTheDocument()
  })

  it('shows the XP the award is worth at 2000 per credit', async () => {
    mockQueue([accepted])
    render(<PriorLearningPage />)
    expect(await screen.findByText(/2000 XP/)).toBeInTheDocument()
  })

  it('sends the award, the school and the AI-drafted course split', async () => {
    mockQueue([accepted])
    api.post.mockResolvedValue({ data: { action: 'created' } })
    render(<PriorLearningPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Add to transcript' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/prior-learning/rec-1/credit', {
        organization_id: 'org-1',
        school_name: 'Cava Academy',
        subject_credits: { social_studies: 1.0 },
        course_names: { social_studies: [{ name: 'US History', credits: 1.0 }] },
      }))
  })

  it('offers no button at all once the record is already on the transcript', async () => {
    mockQueue([{ ...accepted, transfer_credit: { id: 'tc-1', school_name: 'Cava Academy' } }])
    render(<PriorLearningPage />)

    expect(await screen.findByText(/On the transcript under/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add to transcript' })).not.toBeInTheDocument()
  })

  it('says so plainly when a record was accepted without credit', async () => {
    mockQueue([record({ status: 'accepted', awarded_credits: {} })])
    render(<PriorLearningPage />)
    expect(await screen.findByText(/Accepted without credit/)).toBeInTheDocument()
  })
})

describe('not losing the record after accepting it', () => {
  /**
   * The bug this covers: accepting flips the record to `accepted`, so the
   * refetch of the "New" tab dropped it from the list — carrying the unfinished
   * "Add to transcript" step away with it. The credit was recorded on the
   * record and the student got nothing, with nothing on screen saying so.
   */
  it('follows the record to the Accepted tab after awarding credit', async () => {
    mockQueue([record({ ai_suggestion: SUGGESTION })])
    api.post.mockResolvedValue({ data: {} })
    render(<PriorLearningPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Use these numbers' }))
    await userEvent.click(screen.getByRole('button', { name: /Accept & award/i }))

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining('status=accepted')))
  })

  it('stays put when a record is declined', async () => {
    mockQueue([record()])
    api.post.mockResolvedValue({ data: {} })
    render(<PriorLearningPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Review' }))
    await userEvent.click(screen.getByRole('button', { name: /Don’t accept/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('status=accepted'))
  })

  it('marks an accepted record that never reached the transcript', async () => {
    mockQueue([record({ status: 'accepted', awarded_credits: { social_studies: 1 } })])
    render(<PriorLearningPage />)

    expect(await screen.findByText('not on transcript')).toBeInTheDocument()
    expect(screen.getByText('Not on the transcript yet')).toBeInTheDocument()
  })

  it('drops the warning once it is on the transcript', async () => {
    mockQueue([record({
      status: 'accepted', awarded_credits: { social_studies: 1 },
      transfer_credit: { id: 'tc-1', school_name: 'Cava Academy' },
    })])
    render(<PriorLearningPage />)

    await screen.findByText(/On the transcript under/)
    expect(screen.queryByText('not on transcript')).not.toBeInTheDocument()
  })

  it('does not warn when a record was accepted without credit', async () => {
    mockQueue([record({ status: 'accepted', awarded_credits: {} })])
    render(<PriorLearningPage />)

    await screen.findByText(/Accepted without credit/)
    expect(screen.queryByText('not on transcript')).not.toBeInTheDocument()
  })
})

describe('unlocking a password-protected PDF', () => {
  const withLocked = () => record({
    ai_suggestion: { ...SUGGESTION, locked_files: ['CAVA-LA_Transcript.pdf'] },
  })

  it('asks for a password only when a file is actually locked', async () => {
    mockQueue([record({ ai_suggestion: SUGGESTION })])
    render(<PriorLearningPage />)
    await screen.findByText('Junior year')
    expect(screen.queryByLabelText('PDF password')).not.toBeInTheDocument()
  })

  it('names the file it needs the password for', async () => {
    mockQueue([withLocked()])
    render(<PriorLearningPage />)
    expect(await screen.findByText('CAVA-LA_Transcript.pdf')).toBeInTheDocument()
    expect(screen.getByLabelText('PDF password')).toBeInTheDocument()
  })

  it('re-reads the evidence with the password and clears the box', async () => {
    mockQueue([withLocked()])
    api.post.mockResolvedValue({ data: { suggestion: SUGGESTION } })
    render(<PriorLearningPage />)

    const box = await screen.findByLabelText('PDF password')
    await userEvent.type(box, 'hunter2')
    fireEvent.click(screen.getByRole('button', { name: 'Unlock and re-read' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/prior-learning/rec-1/analyze',
      { organization_id: 'org-1', passwords: ['hunter2'] }))
    // The suggestion that comes back has no locked files, so the prompt goes.
    await waitFor(() => expect(screen.queryByLabelText('PDF password')).not.toBeInTheDocument())
  })

  it('does nothing on an empty password', async () => {
    mockQueue([withLocked()])
    render(<PriorLearningPage />)
    await screen.findByLabelText('PDF password')
    expect(screen.getByRole('button', { name: 'Unlock and re-read' })).toBeDisabled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('sends no passwords on an ordinary analyze', async () => {
    mockQueue([record()])
    api.post.mockResolvedValue({ data: { suggestion: SUGGESTION } })
    render(<PriorLearningPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Analyze evidence' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/prior-learning/rec-1/analyze', { organization_id: 'org-1' }))
  })
})

describe('deleting an uploaded document', () => {
  // Built fresh per test: the page keeps records in state and rewrites them on
  // delete, so a shared fixture would carry one test's edits into the next.
  const withDoc = () => record({
    evidence: [{ id: 'ev-1', evidence_type: 'document', url: 'https://x/invoice.pdf',
                 title: 'Invoice-ZEZUKC-00003.pdf', content_type: 'application/pdf' }],
  })

  it('asks before removing a family’s file, and does nothing if declined', async () => {
    const confirm = vi.fn(() => false)
    window.confirm = confirm
    mockQueue([withDoc()])
    render(<PriorLearningPage />)

    await screen.findByText('Junior year')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Invoice-ZEZUKC-00003.pdf'))
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('deletes the document once confirmed and drops it from the list', async () => {
    const confirm = vi.fn(() => true)
    window.confirm = confirm
    mockQueue([withDoc()])
    api.delete.mockResolvedValue({ data: { deleted: true } })
    render(<PriorLearningPage />)

    await screen.findByText('Junior year')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(
      '/api/sis/prior-learning/rec-1/evidence/ev-1',
      { params: { organization_id: 'org-1' } }))
    await waitFor(() => expect(screen.queryByText('Invoice-ZEZUKC-00003.pdf')).not.toBeInTheDocument())
  })

  it('keeps the document on screen when the delete fails', async () => {
    const confirm = vi.fn(() => true)
    window.confirm = confirm
    mockQueue([withDoc()])
    api.delete.mockRejectedValue({ response: { data: { error: 'nope' } } })
    render(<PriorLearningPage />)

    await screen.findByText('Junior year')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(api.delete).toHaveBeenCalled())
    expect(screen.getByText('Invoice-ZEZUKC-00003.pdf')).toBeInTheDocument()
  })
})

describe('course splits that do not add up', () => {
  /**
   * The failure this prevents: the course boxes are prefilled from the AI's
   * split, but the credit comes from what the REVIEWER awarded. Override a
   * subject (or accept an older suggestion) and the two disagree — which used
   * to surface only as a server rejection after pressing the button, with no
   * indication of which course to fix.
   */
  const mismatched = () => record({
    status: 'accepted',
    awarded_credits: { cte: 2.0 },
    ai_suggestion: {
      ...SUGGESTION,
      subjects: [{
        subject: 'cte', credits: 2.25, confidence: 0.9,
        courses: [
          { name: 'Principles of Engineering', credits: 1.0, term: 'full_year' },
          { name: 'Aerospace Engineering', credits: 1.0, term: 'full_year' },
          { name: 'Online Career Learning', credits: 0.25, term: 'semester' },
        ],
      }],
    },
  })

  it('shows the running total against the award before anything is sent', async () => {
    mockQueue([mismatched()])
    render(<PriorLearningPage />)
    expect(await screen.findByText('2.25 / 2')).toBeInTheDocument()
    expect(screen.getByText(/These courses add up to 2.25, but cte was awarded 2/))
      .toBeInTheDocument()
  })

  it('will not let a transcript that disagrees with itself be submitted', async () => {
    mockQueue([mismatched()])
    render(<PriorLearningPage />)
    await screen.findByText('2.25 / 2')
    expect(screen.getByRole('button', { name: 'Add to transcript' })).toBeDisabled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('offers dropping the course names as the way out', async () => {
    mockQueue([mismatched()])
    api.post.mockResolvedValue({ data: { action: 'created' } })
    render(<PriorLearningPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'drop the course names' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to transcript' }))

    // The credit still transcribes; only the line items are gone.
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/prior-learning/rec-1/credit',
      expect.objectContaining({ subject_credits: { cte: 2.0 }, course_names: {} })))
  })

  it('clears once the courses are corrected by hand', async () => {
    mockQueue([mismatched()])
    render(<PriorLearningPage />)

    const box = await screen.findByLabelText(/cte courses/)
    await userEvent.clear(box)
    await userEvent.type(box, 'Principles of Engineering (1.0), Aerospace Engineering (1.0)')

    await waitFor(() => expect(screen.getByText('2 / 2')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Add to transcript' })).toBeEnabled()
  })

  it('accepts a split that already matches', async () => {
    mockQueue([record({
      status: 'accepted',
      awarded_credits: { social_studies: 1.0 },
      ai_suggestion: SUGGESTION,
    })])
    render(<PriorLearningPage />)
    expect(await screen.findByText('1 / 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to transcript' })).toBeEnabled()
  })
})

describe('parseCourseText', () => {
  it('reads name and credits out of the free-text form', () => {
    expect(parseCourseText({ math: 'Algebra I (1.0), Geometry (0.5)' })).toEqual({
      math: [{ name: 'Algebra I', credits: 1 }, { name: 'Geometry', credits: 0.5 }],
    })
  })

  it('ignores an entry with no credits, which shows up as a bad total', () => {
    expect(parseCourseText({ math: 'Algebra I' })).toEqual({})
  })

  it('skips a stray credit with no course name', () => {
    expect(parseCourseText({ math: '(1.0)' })).toEqual({})
  })

  it('leaves an empty box out entirely', () => {
    expect(parseCourseText({ math: '   ' })).toEqual({})
  })
})

describe('creditsFromSuggestion', () => {
  it('keeps only positive credits, as strings the inputs can hold', () => {
    expect(creditsFromSuggestion({
      subjects: [
        { subject: 'math', credits: 1.0 },
        { subject: 'science', credits: 0 },
      ],
    })).toEqual({ math: '1' })
  })

  it('is empty for a suggestion that proposed nothing', () => {
    expect(creditsFromSuggestion({ subjects: [], flags: ['unreadable'] })).toEqual({})
  })
})
