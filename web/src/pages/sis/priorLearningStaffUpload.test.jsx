/**
 * Prior learning — the office uploading a transcript it received itself.
 *
 * Transcripts come to the school directly, from the school the student left.
 * What's tested is what a wrong answer would cost: filing against the wrong
 * student, a record created with nothing attached while the screen says it
 * worked, and a document added to a record the reviewer wasn't looking at.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('./useSisOrg', () => ({ useSisOrg: () => ({ orgId: 'org-1' }) }))

import { toast } from 'react-hot-toast'
import PriorLearningPage from './PriorLearningPage'

const SUBJECTS = [{ key: 'math', name: 'Math' }]

const RECORD = {
  id: 'rec-1', title: 'Algebra I at Riverside Co-op', status: 'submitted',
  student_name: 'Ada Byron', awarded_credits: {}, source: 'family',
  evidence: [{ id: 'e1', evidence_type: 'document', url: 'https://x/t.pdf', title: 'Transcript' }],
}

const STUDENTS = [
  { student_id: 'kid-1', name: 'Ada Byron', enrollment_status: 'active' },
  { student_id: 'kid-2', name: 'Grace Hopper', enrollment_status: 'graduated' },
]

const pdf = (name = 'riverside-transcript.pdf') => (
  new File(['x'], name, { type: 'application/pdf' })
)

const mockPage = ({ records = [RECORD], students = STUDENTS } = {}) => {
  api.get.mockImplementation((url) => {
    if (url.includes('/prior-learning/students')) {
      return Promise.resolve({ data: { students } })
    }
    return Promise.resolve({
      data: { records, counts: { submitted: records.length }, subjects: SUBJECTS },
    })
  })
}

const openForm = async () => {
  render(<PriorLearningPage />)
  await userEvent.click(await screen.findByRole('button', { name: /upload a transcript/i }))
  return screen.findByRole('combobox', { name: /student/i })
}

beforeEach(() => vi.clearAllMocks())

describe('filing a transcript the office received', () => {
  it('creates one record for the chosen student and uploads each document to it', async () => {
    mockPage()
    api.post.mockImplementation((url) => (
      url.endsWith('/evidence') || url.includes('/evidence?')
        ? Promise.resolve({ data: { evidence: { id: 'new-1' } } })
        : Promise.resolve({ data: { record: { id: 'rec-new' } } })
    ))

    const picker = await openForm()
    await userEvent.selectOptions(picker, 'kid-1')
    await userEvent.type(screen.getByLabelText(/school it came from/i), 'Riverside High School')
    await userEvent.upload(screen.getByLabelText(/choose documents to upload/i),
                           [pdf('page-1.pdf'), pdf('page-2.pdf')])
    await userEvent.click(screen.getByRole('button', { name: /file for review/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(3))
    const [createUrl, createBody] = api.post.mock.calls[0]
    expect(createUrl).toBe('/api/sis/prior-learning')
    expect(createBody.student_user_id).toBe('kid-1')
    expect(createBody.provider).toBe('Riverside High School')
    // No typed title, so it is named after the school rather than left blank in
    // the queue.
    expect(createBody.title).toBe('Transcript from Riverside High School')

    for (const call of api.post.mock.calls.slice(1)) {
      expect(call[0]).toContain('/api/sis/prior-learning/rec-new/evidence')
      expect(call[1]).toBeInstanceOf(FormData)
      expect(call[1].get('evidence_type')).toBe('document')
    }
    expect(toast.success).toHaveBeenCalled()
  })

  it('cannot be filed without a student, however many documents are staged', async () => {
    mockPage()
    const picker = await openForm()
    await userEvent.upload(screen.getByLabelText(/choose documents to upload/i), pdf())

    expect(screen.getByRole('button', { name: /file for review/i })).toBeDisabled()
    await userEvent.selectOptions(picker, 'kid-1')
    expect(screen.getByRole('button', { name: /file for review/i })).toBeEnabled()
  })

  it('cannot be filed with a student but no document', async () => {
    mockPage()
    const picker = await openForm()
    await userEvent.selectOptions(picker, 'kid-1')
    expect(screen.getByRole('button', { name: /file for review/i })).toBeDisabled()
  })

  it('offers graduated and withdrawn students, because a final transcript arrives late', async () => {
    mockPage()
    await openForm()
    expect(screen.getByRole('option', { name: /grace hopper \(graduated\)/i })).toBeInTheDocument()
  })

  it('does not claim success when the record was created but nothing uploaded', async () => {
    mockPage()
    api.post.mockImplementation((url) => (
      url.includes('/evidence')
        ? Promise.reject({ response: { data: { error: '.xlsx files are not allowed' } } })
        : Promise.resolve({ data: { record: { id: 'rec-new' } } })
    ))

    const picker = await openForm()
    await userEvent.selectOptions(picker, 'kid-1')
    await userEvent.upload(screen.getByLabelText(/choose documents to upload/i), pdf())
    await userEvent.click(screen.getByRole('button', { name: /file for review/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(toast.success).not.toHaveBeenCalled()
    // The reason, not just "it failed" — it is the only thing that says what to
    // do next.
    expect(toast.error.mock.calls.at(-1)[0]).toContain('.xlsx files are not allowed')
  })

  // The file picker filters by the input's `accept` list, so this exercises the
  // DRAG path — where the browser hands over whatever was dropped and the page
  // itself has to turn the unusable ones away.
  it('refuses a dropped file the upload cannot take, before anything is sent', async () => {
    mockPage()
    const picker = await openForm()
    await userEvent.selectOptions(picker, 'kid-1')
    const zone = screen.getByText(/drop the transcript here/i).closest('div')
    fireEvent.drop(zone, {
      dataTransfer: {
        files: [new File(['x'], 'grades.xlsx', { type: 'application/vnd.ms-excel' })],
        types: ['Files'],
      },
    })

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('grades.xlsx')))
    expect(screen.getByRole('button', { name: /file for review/i })).toBeDisabled()
    expect(api.post).not.toHaveBeenCalled()
  })
})

describe('adding a document to a record that already exists', () => {
  it('posts it to that record, whatever the record status', async () => {
    mockPage({ records: [{ ...RECORD, status: 'under_review' }] })
    api.post.mockResolvedValue({ data: { evidence: { id: 'e2', title: 'Page 2' } } })
    render(<PriorLearningPage />)

    await userEvent.upload(await screen.findByLabelText(/add a document to this record/i),
                           pdf('page-2.pdf'))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toContain('/api/sis/prior-learning/rec-1/evidence')
    expect(body.get('file').name).toBe('page-2.pdf')
  })

  it('shows the new document without a reload', async () => {
    mockPage()
    api.post.mockResolvedValue({
      data: { evidence: { id: 'e2', evidence_type: 'document', url: 'https://x/p2.pdf', title: 'Page 2' } },
    })
    render(<PriorLearningPage />)

    await userEvent.upload(await screen.findByLabelText(/add a document to this record/i),
                           pdf('page-2.pdf'))

    expect(await screen.findByText('Page 2')).toBeInTheDocument()
  })
})

describe('where a record came from', () => {
  it('marks the ones the office filed itself', async () => {
    mockPage({ records: [{ ...RECORD, source: 'staff' }] })
    render(<PriorLearningPage />)
    expect(await screen.findByText(/filed by the office/i)).toBeInTheDocument()
  })

  it('says nothing extra about a family submission', async () => {
    mockPage()
    render(<PriorLearningPage />)
    await screen.findByText(RECORD.title)
    expect(screen.queryByText(/filed by the office/i)).not.toBeInTheDocument()
  })
})
