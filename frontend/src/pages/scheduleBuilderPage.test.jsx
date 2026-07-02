import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

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

const ORG = { organization_id: 'org1', organization_name: 'Micro School', students: [{ student_id: 's1', name: 'Kid One' }] }

const mockApi = ({ orgs = [ORG], schedule = {}, classes = [] } = {}) => (url) => {
  if (url.includes('/parent/context')) return Promise.resolve({ data: { orgs } })
  if (url.includes('/schedule')) {
    return Promise.resolve({ data: { classes: [], waitlist: [], first_day_of_school: null, changes_locked: false, ...schedule } })
  }
  if (url.includes('/parent/classes')) return Promise.resolve({ data: { classes } })
  return Promise.resolve({ data: {} })
}

const POTTERY = {
  id: 'c1', name: 'Pottery', price_cents: 5000, capacity: 10, spots_left: 8, is_full: false,
  registration_status: 'open', meetings: [{ day_of_week: 2, start_time: '09:00', end_time: '10:30' }],
}

beforeEach(() => { vi.clearAllMocks() })

describe('ScheduleBuilderPage', () => {
  it('shows an empty state when the family is not set up', async () => {
    api.get.mockImplementation(mockApi({ orgs: [] }))
    render(<ScheduleBuilderPage />)
    expect(await screen.findByText(/No school schedules to manage/)).toBeInTheDocument()
  })

  it('opens the details modal and adds an available class from it', async () => {
    api.get.mockImplementation(mockApi({ classes: [{ ...POTTERY, description: 'Wheel-thrown pots.' }] }))
    api.post.mockResolvedValue({ data: { success: true, enrolled: true } })
    render(<ScheduleBuilderPage />)
    expect(await screen.findByText('Pottery')).toBeInTheDocument()
    // rows expose a Details button instead of a direct Add
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(await screen.findByText('Wheel-thrown pots.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add class' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/parent/students/s1/classes',
        expect.objectContaining({ organization_id: 'org1', class_id: 'c1' })),
    )
    // modal closes after a successful add
    await waitFor(() => expect(screen.queryByText('Wheel-thrown pots.')).not.toBeInTheDocument())
  })

  it('renders enrolled classes on the weekly calendar and can drop them', async () => {
    api.get.mockImplementation(mockApi({ schedule: { classes: [POTTERY] } }))
    api.delete.mockResolvedValue({ data: { success: true } })
    window.confirm = vi.fn(() => true)
    render(<ScheduleBuilderPage />)
    // appears in the calendar block and the enrolled list
    expect((await screen.findAllByText('Pottery')).length).toBeGreaterThanOrEqual(2)
    fireEvent.click(screen.getByRole('button', { name: 'Drop' }))
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
    expect(screen.queryByRole('button', { name: 'Drop' })).not.toBeInTheDocument()
    // details stay viewable when locked (enrolled rows and catalog rows both
    // have one), but the modal has no add action
    fireEvent.click(screen.getAllByRole('button', { name: 'Details' })[0])
    expect(await screen.findByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add class|Join waitlist/ })).not.toBeInTheDocument()
  })

  it('offers the waitlist for full classes', async () => {
    api.get.mockImplementation(mockApi({ classes: [{ ...POTTERY, is_full: true, spots_left: 0 }] }))
    api.post.mockResolvedValue({ data: { success: true, waitlisted: true, position: 2 } })
    render(<ScheduleBuilderPage />)
    expect(await screen.findByText('Full — waitlist')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Join waitlist' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
  })

  it('filters available classes to a clicked calendar time slot', async () => {
    api.get.mockImplementation(mockApi({ classes: [
      POTTERY, // Tue 9:00–10:30
      { ...POTTERY, id: 'c2', name: 'Basketry', meetings: [{ day_of_week: 3, start_time: '13:00', end_time: '14:00' }] },
    ] }))
    render(<ScheduleBuilderPage />)
    expect(await screen.findByText('Pottery')).toBeInTheDocument()
    expect(screen.getByText('Basketry')).toBeInTheDocument()
    // click Tuesday at 9am — grid starts at 8am, 0.9 px per minute → 54px down
    fireEvent.click(screen.getByTestId('schedule-day-2'), { clientY: 54 })
    expect(await screen.findByText(/Meets Tue 9am–10am/)).toBeInTheDocument()
    expect(screen.getByText('Pottery')).toBeInTheDocument()
    expect(screen.queryByText('Basketry')).not.toBeInTheDocument()
    // clearing the chip restores the full list
    fireEvent.click(screen.getByRole('button', { name: 'Clear time filter' }))
    expect(await screen.findByText('Basketry')).toBeInTheDocument()
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
