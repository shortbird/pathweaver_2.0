import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The class schedule on /parent/dashboard.
 *
 * This is the THIRD family surface showing a schedule, and the one a parent
 * actually lands on. When the day-by-day view shipped on 2026-08-25 it went to
 * the printable schedule and the school hub but not here, so the reporting
 * parent looked at their dashboard and still saw an undifferentiated week.
 *
 * The day list has to be on every family-facing schedule or the fix isn't one.
 */

const get = vi.fn()
vi.mock('../../services/api', () => ({ default: { get: (...a) => get(...a) } }))

import StudentSchedulePreview from './StudentSchedulePreview'

const CONTEXT = {
  orgs: [{
    organization_id: 'org-1',
    organization_name: 'iCreate',
    students: [{ student_id: 's1', name: 'Nora' }],
  }],
}

const SCHEDULE = {
  classes: [
    {
      id: 'c1', name: 'Guitar Jam', location: 'Studio A',
      primary_instructor: { name: 'Molly C' },
      meetings: [
        { day_of_week: 2, start_time: '10:30', end_time: '11:30' },
        { day_of_week: 4, start_time: '10:30', end_time: '11:30' },
      ],
    },
    {
      id: 'c2', name: 'Pottery', location: 'Studio B',
      primary_instructor: { name: 'Ravi P' },
      meetings: [{ day_of_week: 2, start_time: '09:30', end_time: '10:30' }],
    },
  ],
  waitlist: [],
  courses: [],
}

const renderPreview = () =>
  render(<MemoryRouter><StudentSchedulePreview studentId="s1" /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  get.mockImplementation((url) => {
    if (url.includes('/parent/context')) return Promise.resolve({ data: CONTEXT })
    if (url.includes('/schedule')) return Promise.resolve({ data: SCHEDULE })
    return Promise.resolve({ data: {} })
  })
})

describe('StudentSchedulePreview', () => {
  it('breaks the week into days instead of one undifferentiated list', async () => {
    renderPreview()
    expect(await screen.findByText('Tuesday')).toBeInTheDocument()
    expect(screen.getByText('Thursday')).toBeInTheDocument()
  })

  it('orders each day by start time', async () => {
    // 9:30 above 10:30 — the parent's ask, on the page they actually open.
    renderPreview()
    await screen.findByText('Tuesday')
    const rows = within(screen.getByText('Tuesday').parentElement).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Pottery')
    expect(rows[1]).toHaveTextContent('Guitar Jam')
  })

  it('shows a twice-weekly class under both of its days', async () => {
    renderPreview()
    await screen.findByText('Thursday')
    const tuesday = within(screen.getByText('Tuesday').parentElement)
    const thursday = within(screen.getByText('Thursday').parentElement)
    expect(tuesday.getByText('Guitar Jam')).toBeInTheDocument()
    expect(thursday.getByText('Guitar Jam')).toBeInTheDocument()
  })

  it('carries teacher and room, which the grid has no room for', async () => {
    renderPreview()
    expect(await screen.findByText('Ravi P · Studio B')).toBeInTheDocument()
  })

  it('renders nothing for a student outside a SIS school', async () => {
    get.mockImplementation((url) => {
      if (url.includes('/parent/context')) return Promise.resolve({ data: { orgs: [] } })
      return Promise.resolve({ data: {} })
    })
    const { container } = renderPreview()
    // Nothing to wait for; the component bails before the schedule call.
    await vi.waitFor(() => expect(get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
