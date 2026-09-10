import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import StudentAttendanceCard from './StudentAttendanceCard'

/**
 * Families had no way to see what the school recorded. A parent could report an
 * absence — there is a whole page for it — and never find out what came of it,
 * including whether the absence they phoned in had been marked excused, which
 * is why they phoned.
 */

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

const withClient = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const RECORDS = [
  { id: 'a1', date: '2026-09-09', status: 'present' },
  { id: 'a2', date: '2026-09-08', status: 'absent' },
  { id: 'a3', date: '2026-09-07', status: 'excused' },
]

describe('StudentAttendanceCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({
      data: {
        records: RECORDS,
        summary: { counts: { present: 1, absent: 1, excused: 1, late: 0 },
                   total: 3, attendance_rate: 0.5 },
      },
    })
  })

  it('shows the recorded days', async () => {
    withClient(<StudentAttendanceCard studentId="kid-1" />)
    expect(await screen.findByText('Present')).toBeInTheDocument()
    expect(screen.getByText('Absent')).toBeInTheDocument()
    expect(screen.getByText('Excused')).toBeInTheDocument()
  })

  it('shows the rate', async () => {
    withClient(<StudentAttendanceCard studentId="kid-1" />)
    expect(await screen.findByText('50% present')).toBeInTheDocument()
  })

  it('leaves out a status nothing was recorded for', async () => {
    withClient(<StudentAttendanceCard studentId="kid-1" />)
    await screen.findByText('Present')
    expect(screen.queryByText(/0 late/)).not.toBeInTheDocument()
  })

  it('renders nothing when nothing is recorded', async () => {
    /* A card saying "no attendance yet" would sit on every family dashboard in
       every school that does not take a roll. */
    api.get.mockResolvedValue({ data: { records: [], summary: null } })
    const { container } = withClient(<StudentAttendanceCard studentId="kid-1" />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })

  it('renders nothing when the school has attendance turned off', async () => {
    api.get.mockRejectedValue({ response: { status: 404 } })
    const { container } = withClient(<StudentAttendanceCard studentId="kid-1" />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })

  it('asks for one class when given one', async () => {
    withClient(<StudentAttendanceCard studentId="kid-1" classId="c1" />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(api.get.mock.calls[0][1]).toEqual({ params: { class_id: 'c1' } })
  })

  it('asks for the whole record when given no class', async () => {
    withClient(<StudentAttendanceCard studentId="kid-1" />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(api.get.mock.calls[0][1]).toEqual({ params: undefined })
  })

  it('caps the list and says how many there are', async () => {
    const many = Array.from({ length: 14 }, (_, i) => ({
      id: `a${i}`, date: `2026-09-${String(i + 1).padStart(2, '0')}`, status: 'present',
    }))
    api.get.mockResolvedValue({
      data: { records: many, summary: { counts: { present: 14 }, total: 14, attendance_rate: 1 } },
    })
    withClient(<StudentAttendanceCard studentId="kid-1" />)
    expect(await screen.findByText('Showing the last 10 of 14 records.')).toBeInTheDocument()
  })
})
