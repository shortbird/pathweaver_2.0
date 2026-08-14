/**
 * Prior learning — the office's side.
 *
 * This page puts numbers on a transcript, so what's tested is the shape of what
 * it sends: the credits a reviewer typed, only for the subjects they typed them
 * in, and nothing at all when they decline the record.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('./useSisOrg', () => ({ useSisOrg: () => ({ orgId: 'org-1' }) }))

import PriorLearningPage from './PriorLearningPage'

const SUBJECTS = [{ key: 'math', name: 'Math' }, { key: 'science', name: 'Science' }]

const RECORD = {
  id: 'rec-1', title: 'Algebra I at Riverside Co-op', status: 'submitted',
  student_name: 'Ada Byron', provider: 'Riverside Co-op', awarded_credits: {},
  evidence: [{ id: 'e1', evidence_type: 'document', url: 'https://x/t.pdf', title: 'Transcript' }],
}

const mockQueue = (records = [RECORD]) => {
  api.get.mockResolvedValue({
    data: { records, counts: { submitted: records.length }, subjects: SUBJECTS },
  })
}

beforeEach(() => vi.clearAllMocks())

describe('awarding credit', () => {
  it('sends only the subjects the reviewer actually typed a number into', async () => {
    mockQueue()
    api.post.mockResolvedValue({ data: {} })
    render(<PriorLearningPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Review' }))
    await userEvent.type(screen.getByLabelText(/math credits/i), '1')
    await userEvent.click(screen.getByRole('button', { name: /accept & award/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toContain('/api/sis/prior-learning/rec-1/review')
    expect(body.status).toBe('accepted')
    expect(body.awarded_credits).toEqual({ math: 1 })
  })

  it('carries quarter credits through, because schools award them', async () => {
    mockQueue()
    api.post.mockResolvedValue({ data: {} })
    render(<PriorLearningPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Review' }))
    await userEvent.type(screen.getByLabelText(/science credits/i), '0.25')
    await userEvent.click(screen.getByRole('button', { name: /accept & award/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].awarded_credits).toEqual({ science: 0.25 })
  })

  it('declining a record sends no credit at all', async () => {
    mockQueue()
    api.post.mockResolvedValue({ data: {} })
    render(<PriorLearningPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Review' }))
    await userEvent.type(screen.getByLabelText(/math credits/i), '1')
    await userEvent.click(screen.getByRole('button', { name: /don’t accept/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [, body] = api.post.mock.calls[0]
    expect(body.status).toBe('rejected')
    expect(body.awarded_credits).toBeUndefined()
  })
})

describe('reading the evidence without leaving the page', () => {
  const withEvidence = (evidence) => mockQueue([{ ...RECORD, evidence }])

  it('renders a PDF inline, in a frame that scrolls its own pages', async () => {
    withEvidence([{ id: 'e1', evidence_type: 'document', url: 'https://x/t.pdf',
                    title: 'Transcript', content_type: 'application/pdf' }])
    render(<PriorLearningPage />)

    const frame = await screen.findByTitle('Transcript')
    expect(frame.tagName).toBe('IFRAME')
    expect(frame).toHaveAttribute('src', 'https://x/t.pdf')
  })

  it('renders a photo inline', async () => {
    withEvidence([{ id: 'e1', evidence_type: 'image', url: 'https://x/p.jpg',
                    title: 'Project', content_type: 'image/jpeg' }])
    render(<PriorLearningPage />)

    expect(await screen.findByRole('img', { name: 'Project' }))
      .toHaveAttribute('src', 'https://x/p.jpg')
  })

  it('fetches a CSV export and shows what is in it', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, text: () => Promise.resolve('Student,Course\nAda,Algebra I'),
    })
    withEvidence([{ id: 'e1', evidence_type: 'document', url: 'https://x/e.csv',
                    title: 'export.csv', file_name: 'export.csv', content_type: 'text/csv' }])
    render(<PriorLearningPage />)

    expect(await screen.findByText(/Ada,Algebra I/)).toBeInTheDocument()
  })

  it('falls back to a link when a text file will not load', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('cors'))
    withEvidence([{ id: 'e1', evidence_type: 'document', url: 'https://x/e.csv',
                    file_name: 'export.csv', content_type: 'text/csv' }])
    render(<PriorLearningPage />)

    expect(await screen.findByText(/couldn’t load this file here/i)).toBeInTheDocument()
  })

  it('says so plainly for a file no browser can render, instead of an empty box', async () => {
    withEvidence([{ id: 'e1', evidence_type: 'document', url: 'https://x/e.docx',
                    file_name: 'essay.docx',
                    content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }])
    render(<PriorLearningPage />)

    expect(await screen.findByText(/can’t be shown here/i)).toBeInTheDocument()
  })

  it('trusts the extension when the upload arrived with a generic type', async () => {
    withEvidence([{ id: 'e1', evidence_type: 'document', url: 'https://x/t.pdf',
                    title: 'Scan', file_name: 'scan.pdf',
                    content_type: 'application/octet-stream' }])
    render(<PriorLearningPage />)

    expect((await screen.findByTitle('Scan')).tagName).toBe('IFRAME')
  })

  it('reads the URL when there is no content type and no stored file name', async () => {
    /* `title` is a label the parent chose, so "Transcript" must not decide the
       viewer — the .pdf on the end of the URL does. */
    withEvidence([{ id: 'e1', evidence_type: 'document', url: 'https://x/t.pdf',
                    title: 'Transcript' }])
    render(<PriorLearningPage />)

    expect((await screen.findByTitle('Transcript')).tagName).toBe('IFRAME')
  })

  it('ignores a query string hanging off a signed URL', async () => {
    withEvidence([{ id: 'e1', evidence_type: 'document',
                    url: 'https://x/t.pdf?token=abc&x=1', title: 'Signed' }])
    render(<PriorLearningPage />)

    expect((await screen.findByTitle('Signed')).tagName).toBe('IFRAME')
  })

  it('can be collapsed when a document is in the way', async () => {
    withEvidence([{ id: 'e1', evidence_type: 'image', url: 'https://x/p.jpg',
                    title: 'Project', content_type: 'image/jpeg' }])
    render(<PriorLearningPage />)

    await userEvent.click(await screen.findByRole('button', { name: /collapse/i }))
    expect(screen.queryByRole('img', { name: 'Project' })).not.toBeInTheDocument()
  })

  it('still offers a tab for anyone who wants one', async () => {
    withEvidence([{ id: 'e1', evidence_type: 'document', url: 'https://x/t.pdf',
                    title: 'Transcript', content_type: 'application/pdf' }])
    render(<PriorLearningPage />)

    expect(await screen.findByRole('link', { name: /open/i }))
      .toHaveAttribute('href', 'https://x/t.pdf')
  })

  it('shows the parent’s note next to the document it belongs to', async () => {
    withEvidence([{ id: 'e1', evidence_type: 'document', url: 'https://x/t.pdf',
                    title: 'Transcript', content_type: 'application/pdf',
                    content: '10th grade, first semester' }])
    render(<PriorLearningPage />)

    expect(await screen.findByText('10th grade, first semester')).toBeInTheDocument()
  })
})

describe('what the reviewer sees', () => {

  it('labels an AI proposal as a suggestion, not a decision', async () => {
    mockQueue([{
      ...RECORD,
      ai_suggestion: { summary: 'Looks like a full year of algebra.', subjects: [] },
    }])
    render(<PriorLearningPage />)

    expect(await screen.findByText(/not a decision/i)).toBeInTheDocument()
  })

  it('says the feature is off rather than showing an empty queue', async () => {
    api.get.mockRejectedValue({ response: { status: 403 } })
    render(<PriorLearningPage />)

    expect(await screen.findByText(/aren’t enabled for this school/i)).toBeInTheDocument()
  })
})
