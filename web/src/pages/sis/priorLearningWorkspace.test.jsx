/**
 * Prior learning by student (2026-10-13): the student list, one workspace per
 * student, and the one-step Approve.
 *
 * What a wrong answer would cost: credit approved that the reviewer never saw
 * on screen, a course split the backend refuses half-way (accepted but not on
 * the transcript), a family sent back with no reason, or the work that waits
 * longest buried under the work that came in today.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('./useSisOrg', () => ({ useSisOrg: () => ({ orgId: 'org-1' }) }))
const { downloadBlob } = vi.hoisted(() => ({ downloadBlob: vi.fn() }))
vi.mock('../../utils/csv', () => ({ downloadBlob }))

import PriorLearningPage from './PriorLearningPage'
import { awardFromRows } from './priorLearning/ApprovePanel'

const SUBJECTS = [
  { key: 'math', name: 'Math' },
  { key: 'social_studies', name: 'Social Studies' },
]

const STUDENTS = [
  { student_id: 'old', name: 'Finn Old', schools: ['Optio Academy'], waiting: 1, ai_ready: 1,
    needs_info: 0, not_transcribed: 0, needs_action: true, oldest_waiting_at: '2026-09-01T00:00:00Z' },
  { student_id: 'done', name: 'Dana Done', schools: ['Apogee'], waiting: 0, ai_ready: 0,
    needs_info: 0, not_transcribed: 0, needs_action: false },
]

const RECORD = {
  id: 'rec-1', title: 'Junior year', status: 'submitted', source: 'family', provider: 'Cava',
  awarded_credits: {}, evidence: [], can_review: true, events: [
    { id: 'ev1', kind: 'submitted', created_at: '2026-09-01T00:00:00Z', actor_name: 'Pat' },
  ],
  overlaps: [{ kind: 'course_on_transcript', message: '“US History” is already on the transcript from Lincoln.' }],
  ai_suggestion: {
    school_name: 'Cava Academy',
    subjects: [
      { subject: 'social_studies', credits: 1.0, confidence: 0.9,
        courses: [{ name: 'US History', credits: 1.0 }] },
      { subject: 'math', credits: 0.5, confidence: 0.4 },
    ],
  },
}

const WORKSPACE = {
  subjects: SUBJECTS,
  student: { student_id: 'old', name: 'Finn Old', schools: ['Optio Academy'] },
  records: [RECORD],
  transfer_credits: [{ id: 't1', school_name: 'Lincoln High', credits: { math: 1 }, course_names: {} }],
  pricing: { price_list: 'private', credit_cents: 10000 },
  progress: {
    total_required: 24, total_counted: 1,
    subjects: [{ subject: 'math', name: 'Math', required: 3, earned: 1, transfer: 1, optio: 0,
      pending: 0, suggested: 0.5, remaining: 2 }],
  },
}

const mockApi = ({ workspace = WORKSPACE, students = STUDENTS } = {}) => {
  api.get.mockImplementation((url) => {
    if (url.includes('/workspace')) return Promise.resolve({ data: workspace })
    if (url.includes('/queue')) {
      return Promise.resolve({ data: { students, totals: { waiting: 1, students_needing_action: 1 } } })
    }
    return Promise.resolve({ data: { records: [], counts: {}, subjects: SUBJECTS } })
  })
}

const openFinn = async () => {
  render(<PriorLearningPage />)
  await userEvent.click(await screen.findByRole('button', { name: /Finn Old/ }))
  return screen.findByRole('heading', { name: 'Finn Old' })
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState({}, '', '/prior-learning')
})

describe('the student list', () => {
  it('shows students who need something, and hides finished ones until asked', async () => {
    mockApi()
    render(<PriorLearningPage />)
    expect(await screen.findByRole('button', { name: /Finn Old/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Dana Done/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /All students/ }))
    expect(screen.getByRole('button', { name: /Dana Done/ })).toBeInTheDocument()
  })

  it('opens the student a link names', async () => {
    mockApi()
    window.history.replaceState({}, '', '/prior-learning?student=old')
    render(<PriorLearningPage />)
    expect(await screen.findByRole('heading', { name: 'Finn Old' })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining('/students/old/workspace'), expect.anything())
  })
})

describe('the workspace', () => {
  it('shows what is already on the transcript and what to check first', async () => {
    mockApi()
    await openFinn()
    expect(screen.getByText('Lincoln High')).toBeInTheDocument()
    expect(screen.getByText(/already on the transcript from Lincoln/)).toBeInTheDocument()
    expect(screen.getByText('Diploma progress')).toBeInTheDocument()
  })

  it('approves the AI’s reading as shown, in one call', async () => {
    mockApi()
    api.post.mockResolvedValue({ data: { action: 'created' } })
    await openFinn()

    await userEvent.click(screen.getByRole('button', { name: /^Approve 1\.5 credits/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/api/sis/prior-learning/rec-1/approve')
    expect(body.school_name).toBe('Cava Academy')
    expect(body.subject_credits).toEqual({ social_studies: 1, math: 0.5 })
    // Math has an unnamed row, so it goes on as credit alone; its course list
    // would not add up and the backend would refuse the whole approval.
    expect(body.course_names).toEqual({ social_studies: [{ name: 'US History', credits: 1 }] })
  })

  it('approves the reviewer’s edit, not the suggestion', async () => {
    mockApi()
    api.post.mockResolvedValue({ data: {} })
    await openFinn()

    const credits = screen.getByLabelText('Course 2 credits')
    await userEvent.clear(credits)
    await userEvent.type(credits, '1')
    await userEvent.click(screen.getByRole('button', { name: /^Approve 2 credits/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].subject_credits).toEqual({ social_studies: 1, math: 1 })
  })

  it('needs a reason before sending a record back', async () => {
    mockApi()
    api.post.mockResolvedValue({ data: {} })
    await openFinn()

    await userEvent.click(screen.getByRole('button', { name: /Send back for more/ }))
    const send = screen.getByRole('button', { name: 'Send to family' })
    expect(send).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/What the family needs to send/), 'Page 2 is missing.')
    await userEvent.click(send)

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][0]).toBe('/api/sis/prior-learning/rec-1/request-info')
    expect(api.post.mock.calls[0][1].message).toBe('Page 2 is missing.')
  })

  it('offers no send-back on a record the office filed itself', async () => {
    mockApi({ workspace: { ...WORKSPACE, records: [{ ...RECORD, source: 'staff' }] } })
    await openFinn()
    expect(screen.queryByRole('button', { name: /Send back for more/ })).not.toBeInTheDocument()
  })

  it('saves a private note to the record', async () => {
    mockApi()
    api.post.mockResolvedValue({ data: {} })
    await openFinn()

    await userEvent.click(screen.getByRole('button', { name: /History \(1\)/ }))
    await userEvent.type(screen.getByLabelText('Private note'), 'Called the school{Enter}')

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][0]).toBe('/api/sis/prior-learning/rec-1/notes')
    expect(api.post.mock.calls[0][1].body).toBe('Called the school')
  })

  it('gives a record on the transcript no approve button', async () => {
    mockApi({ workspace: { ...WORKSPACE, records: [{
      ...RECORD, status: 'accepted', awarded_credits: { math: 1 }, transfer_credit: { id: 't9', school_name: 'Cava' },
    }] } })
    await openFinn()
    expect(screen.queryByRole('button', { name: /^Approve/ })).not.toBeInTheDocument()
    expect(within(screen.getByText(/On the transcript under/)).getByText('Cava')).toBeInTheDocument()
  })
})

describe('awardFromRows', () => {
  it('sums credit per subject and keeps named courses', () => {
    expect(awardFromRows([
      { name: 'Algebra I', subject: 'math', credits: '1' },
      { name: 'Geometry', subject: 'math', credits: '0.5' },
    ])).toEqual({
      subject_credits: { math: 1.5 },
      course_names: { math: [{ name: 'Algebra I', credits: 1 }, { name: 'Geometry', credits: 0.5 }] },
    })
  })

  it('drops course names for a subject with an unnamed row, keeping its credit', () => {
    const out = awardFromRows([
      { name: 'Algebra I', subject: 'math', credits: '1' },
      { name: '', subject: 'math', credits: '0.5' },
    ])
    expect(out.subject_credits).toEqual({ math: 1.5 })
    expect(out.course_names).toEqual({})
  })

  it('ignores rows with no subject or no credit', () => {
    expect(awardFromRows([
      { name: 'Art', subject: '', credits: '1' },
      { name: 'Band', subject: 'math', credits: '0' },
    ])).toEqual({ subject_credits: {}, course_names: {} })
  })
})

describe('one way to decide', () => {
  it('offers Approve and Other decisions, not a separate Review button', async () => {
    mockApi()
    await openFinn()
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Read again with AI' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Other decisions…' }))
    expect(screen.getByRole('button', { name: /Don’t accept/ })).toBeInTheDocument()
  })
})


describe('the top of a student page', () => {
  it('lists what still needs review, oldest wait shown', async () => {
    mockApi()
    await openFinn()
    const section = screen.getByRole('region', { name: /Needs review \(1\)/ })
    expect(within(section).getByRole('link', { name: /Junior year/ })).toHaveAttribute('href', '#record-rec-1')
    expect(screen.getByText('Diploma progress')).toBeInTheDocument()
  })

  it('says Nothing to review when every record has a decision, and lists them below', async () => {
    mockApi({ workspace: { ...WORKSPACE, records: [{
      ...RECORD, status: 'accepted', awarded_credits: { math: 1 }, transfer_credit: { id: 't9', school_name: 'Cava' },
    }] } })
    await openFinn()
    expect(screen.getByText('Nothing to review')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Previously reviewed \(1\)/ })).toBeInTheDocument()
  })

  it('counts accepted credit that never reached the transcript as still to do', async () => {
    mockApi({ workspace: { ...WORKSPACE, records: [{
      ...RECORD, status: 'accepted', awarded_credits: { math: 1 }, transfer_credit: null,
    }] } })
    await openFinn()
    expect(screen.getByText(/Accepted — add to the transcript/)).toBeInTheDocument()
  })

  it('downloads the credit report as a PDF', async () => {
    mockApi()
    await openFinn()
    api.get.mockResolvedValueOnce({ data: new Blob(['%PDF']) })
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled())
    expect(api.get).toHaveBeenCalledWith('/api/sis/prior-learning/students/old/report',
      expect.objectContaining({ responseType: 'blob' }))
    expect(downloadBlob.mock.calls[0][1]).toBe('Optio-credit-report-Finn-Old.pdf')
  })
})


describe('the fee on Approve', () => {
  it('shows what the awarded credit costs, and nothing for an accredited transcript', async () => {
    mockApi()
    await openFinn()
    expect(screen.getByText('$150')).toBeInTheDocument()
    expect(screen.getByText(/1\.5 × \$100, Optio Academy price/)).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText(/Official transcript from an accredited school/))
    expect(screen.getByText('$0')).toBeInTheDocument()
  })

  it('sends the accredited call with the approval', async () => {
    mockApi()
    api.post.mockResolvedValue({ data: {} })
    await openFinn()
    await userEvent.click(screen.getByLabelText(/Official transcript from an accredited school/))
    await userEvent.click(screen.getByRole('button', { name: /^Approve 1\.5 credits/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].source_accredited).toBe(true)
  })
})

describe('an OpenEd family', () => {
  it('sees no price on Approve: OpenEd pays Optio', async () => {
    mockApi({ workspace: { ...WORKSPACE, pricing: { price_list: 'opened', credit_cents: 0 } } })
    await openFinn()
    expect(screen.getByText(/Purchased through OpenEd/)).toBeInTheDocument()
    expect(screen.queryByText(/^Fee:/)).not.toBeInTheDocument()
  })
})
