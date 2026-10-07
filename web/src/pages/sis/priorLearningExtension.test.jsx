/**
 * Prior learning at an extension of Optio Academy. The school's students get
 * Optio Academy diplomas, so Optio reviews; the school's office uploads and
 * follows progress, and must never be offered the review tools.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
// vi.mock calls below are hoisted above these imports by vitest.
import PriorLearningPage from './PriorLearningPage'
import { stepFor } from './priorLearning/ExtensionUploadView'

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('./useSisOrg', () => ({ useSisOrg: () => ({ orgId: 'micro-1' }) }))

const record = (over) => ({
  id: 'r1', title: 'Transcript from Riverside High', status: 'submitted', source: 'staff',
  student_name: 'Ada Byron', awarded_credits: {}, evidence: [], created_at: '2026-10-07T12:00:00Z',
  can_review: false, ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('an extension school', () => {
  it('gets an upload page and progress, not the review queue', async () => {
    api.get.mockResolvedValue({ data: {
      optio_reviews: true,
      records: [record({ status: 'accepted', awarded_credits: { math: 1 }, transfer_credit: { id: 't1' },
        review_notes: 'Thanks, all four pages arrived.' })],
      subjects: [{ key: 'math', name: 'Math' }],
    } })
    render(<PriorLearningPage />)

    expect(await screen.findByText('Credit awarded: 1 Math')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload a transcript' })).toBeInTheDocument()
    expect(screen.getByText(/all four pages arrived/)).toBeInTheDocument()
    expect(screen.getByLabelText('Optio Academy review: On transcript')).toBeInTheDocument()
    for (const name of ['Review', 'Analyze evidence', 'Re-analyze']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('tab', { name: /In review/ })).not.toBeInTheDocument()
  })
})

describe('the progress steps', () => {
  it('follow the record through Optio Academy’s review', () => {
    expect(stepFor(record({ status: 'submitted' }))).toBe(0)
    expect(stepFor(record({ status: 'under_review' }))).toBe(1)
    expect(stepFor(record({ status: 'accepted' }))).toBe(2)
    expect(stepFor(record({ status: 'accepted', transfer_credit: { id: 't1' } }))).toBe(3)
    expect(stepFor(record({ status: 'rejected' }))).toBe(2)
  })
})
