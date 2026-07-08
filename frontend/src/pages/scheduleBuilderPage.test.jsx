import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
vi.mock('../services/api', () => ({ default: api }))

import ScheduleBuilderPage from './ScheduleBuilderPage'

const ORG = { organization_id: 'org1', organization_name: 'Micro School', students: [{ student_id: 's1', name: 'Kid One', avatar_url: 'x.jpg' }] }

const mockApi = ({ orgs = [ORG], schedule = {}, classes = [] } = {}) => (url) => {
  if (url.includes('/parent/context')) return Promise.resolve({ data: { orgs, my_avatar_url: 'me.jpg' } })
  if (url.includes('/schedule')) {
    return Promise.resolve({ data: { classes: [], waitlist: [], time_blocks: [], first_day_of_school: null, changes_locked: false, ...schedule } })
  }
  if (url.includes('/parent/classes')) return Promise.resolve({ data: { classes } })
  return Promise.resolve({ data: {} })
}

const POTTERY = {
  id: 'c1', name: 'Pottery', price_cents: 5000, capacity: 10, spots_left: 8, is_full: false,
  registration_status: 'open', meetings: [{ day_of_week: 2, start_time: '09:00', end_time: '10:30' }],
}

// Clicking Tuesday at 9am: the grid starts at 8am with 0.9 px per minute, and
// jsdom's getBoundingClientRect().top is 0, so clientY 54 → 9:00.
const clickTue9am = () => fireEvent.click(screen.getByTestId('schedule-day-2'), { clientY: 54 })

beforeEach(() => { vi.clearAllMocks() })

describe('ScheduleBuilderPage', () => {
  it('shows an empty state when the family is not set up', async () => {
    api.get.mockImplementation(mockApi({ orgs: [] }))
    render(<ScheduleBuilderPage />)
    expect(await screen.findByText(/No school schedules to manage/)).toBeInTheDocument()
  })

  it('pops up the classes for a clicked time slot and adds one', async () => {
    api.get.mockImplementation(mockApi({ classes: [
      POTTERY, // Tue 9:00–10:30
      { ...POTTERY, id: 'c2', name: 'Basketry', meetings: [{ day_of_week: 3, start_time: '13:00', end_time: '14:00' }] },
    ] }))
    api.post.mockResolvedValue({ data: { success: true, enrolled: true } })
    render(<ScheduleBuilderPage />)
    await screen.findByTestId('schedule-day-2')
    // the catalog is no longer listed on the page itself
    expect(screen.queryByText('Pottery')).not.toBeInTheDocument()
    clickTue9am()
    expect(await screen.findByText(/Classes at Tue 9am–10am/)).toBeInTheDocument()
    expect(screen.getByText('Pottery')).toBeInTheDocument()
    expect(screen.queryByText('Basketry')).not.toBeInTheDocument() // meets Wed, not this slot
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/parent/students/s1/classes',
        expect.objectContaining({ organization_id: 'org1', class_id: 'c1' })),
    )
    // the slot modal closes after a successful add
    await waitFor(() => expect(screen.queryByText(/Classes at Tue 9am–10am/)).not.toBeInTheDocument())
  })

  it('opens full details from the slot popup', async () => {
    api.get.mockImplementation(mockApi({ classes: [{ ...POTTERY, description: 'Wheel-thrown pots.' }] }))
    api.post.mockResolvedValue({ data: { success: true, enrolled: true } })
    render(<ScheduleBuilderPage />)
    await screen.findByTestId('schedule-day-2')
    clickTue9am()
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    expect(await screen.findByText('Wheel-thrown pots.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add class' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
  })

  it('shows enrolled classes on the calendar; clicking one offers details + drop', async () => {
    api.get.mockImplementation(mockApi({ schedule: { classes: [POTTERY] } }))
    api.delete.mockResolvedValue({ data: { success: true } })
    window.confirm = vi.fn(() => true)
    render(<ScheduleBuilderPage />)
    fireEvent.click(await screen.findByText('Pottery')) // the calendar block
    fireEvent.click(await screen.findByRole('button', { name: 'Drop class' }))
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith('/api/sis/parent/students/s1/classes/c1?organization_id=org1'),
    )
  })

  it('locks add/drop after the first day of school', async () => {
    api.get.mockImplementation(mockApi({
      schedule: { classes: [POTTERY], changes_locked: true, first_day_of_school: '2026-06-01' },
      classes: [{ ...POTTERY, id: 'c2', name: 'Woodshop' }],
    }))
    render(<ScheduleBuilderPage />)
    expect(await screen.findByText(/schedule changes are now made by/i)).toBeInTheDocument()
    // clicking an open slot does nothing when locked
    clickTue9am()
    expect(screen.queryByText(/Classes at/)).not.toBeInTheDocument()
    // enrolled classes stay viewable, but with no drop action
    fireEvent.click(screen.getByText('Pottery'))
    expect(await screen.findByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Drop class|Add class|Join waitlist/ })).not.toBeInTheDocument()
  })

  it('offers the waitlist for full classes in the slot popup', async () => {
    api.get.mockImplementation(mockApi({ classes: [{ ...POTTERY, is_full: true, spots_left: 0 }] }))
    api.post.mockResolvedValue({ data: { success: true, waitlisted: true, position: 2 } })
    render(<ScheduleBuilderPage />)
    await screen.findByTestId('schedule-day-2')
    clickTue9am()
    expect(await screen.findByText('Full — waitlist')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Waitlist' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
  })

  it('preview route walks the builder with the real catalog and saves nothing', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/icreate/schedule-preview/abc123') {
        return Promise.resolve({ data: {
          organization_name: 'Micro School', scheduling_url: '',
          classes: [POTTERY], time_blocks: [], first_day_of_school: null,
        } })
      }
      return Promise.reject(new Error(`unexpected ${url}`))
    })
    rtlRender(
      <MemoryRouter initialEntries={['/schedule-builder/preview/abc123']}>
        <Routes>
          <Route path="/schedule-builder/preview/:previewCode" element={<ScheduleBuilderPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Preview mode')).toBeInTheDocument()
    expect(screen.getByText('Casey Sample')).toBeInTheDocument()
    clickTue9am()
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }))
    // added to the calendar locally — no write hits the API
    expect(await screen.findByText('Pottery')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('totals estimated tuition across the selected classes', async () => {
    api.get.mockImplementation(mockApi({
      schedule: { classes: [POTTERY, { ...POTTERY, id: 'c2', name: 'Woodshop', price_cents: 2550 }] },
    }))
    render(<ScheduleBuilderPage />)
    expect(await screen.findByText('Estimated tuition')).toBeInTheDocument()
    expect(screen.getByText('$75.50')).toBeInTheDocument()
    expect(screen.getByText('2 classes')).toBeInTheDocument()
  })
})
