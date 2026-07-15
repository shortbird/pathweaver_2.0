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

// The page resolves several mocked fetches in separate microtasks, and each
// re-render can replace the day-column node. A click that lands on a node
// React just swapped out is silently lost (flaky in CI). Retry the click
// until the slot popup actually appears.
const openTue9am = () => waitFor(() => {
  clickTue9am()
  expect(screen.getByText(/Classes at Tue 9am–10am/)).toBeInTheDocument()
})

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
    await openTue9am()
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
    await openTue9am()
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

  it('blocks adding a class that overlaps an enrolled class', async () => {
    const twoHour = { ...POTTERY, id: 'c9', name: 'Fashion 101', meetings: [{ day_of_week: 2, start_time: '10:30', end_time: '12:30' }] }
    const overlapping = { ...POTTERY, id: 'c8', name: 'Lego Lab', meetings: [{ day_of_week: 2, start_time: '11:30', end_time: '12:30' }] }
    api.get.mockImplementation(mockApi({ schedule: { classes: [twoHour] }, classes: [overlapping] }))
    render(<ScheduleBuilderPage />)
    await screen.findByText('Fashion 101')
    // Tue at 11:30 — inside the enrolled 2-hour class: (11.5h - 8h) * 60min * 0.9px.
    // Retried like openTue9am: a click during a data-driven re-render is lost.
    await waitFor(() => {
      fireEvent.click(screen.getByTestId('schedule-day-2'), { clientY: 189 })
      expect(screen.getByText('Lego Lab')).toBeInTheDocument()
    })
    expect(screen.getByText(/Overlaps Fashion 101/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  })

  it('offers the waitlist for full classes in the slot popup', async () => {
    api.get.mockImplementation(mockApi({ classes: [{ ...POTTERY, is_full: true, spots_left: 0 }] }))
    api.post.mockResolvedValue({ data: { success: true, waitlisted: true, position: 2 } })
    render(<ScheduleBuilderPage />)
    await screen.findByTestId('schedule-day-2')
    await openTue9am()
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
    await openTue9am()
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
    expect(await screen.findByText('Estimated total')).toBeInTheDocument()
    expect(screen.getByText('$75.50')).toBeInTheDocument()
    expect(screen.getByText(/2 classes/)).toBeInTheDocument()
  })

  // ── Block-based tuition (sis_settings.block_pricing) ────────────────────────
  const BLOCKS = [
    { start: '09:30', end: '10:30' }, { start: '10:30', end: '11:30' }, { start: '11:30', end: '12:30' },
    { start: '12:30', end: '13:00', label: 'Lunch' }, { start: '13:00', end: '14:00' }, { start: '14:00', end: '15:00' },
  ]
  const PRICING = {
    tiers: [
      { blocks: 5, year_cents: 150000 },
      { blocks: 10, year_cents: 280000 },
    ],
    installments: 10,
    convenience_fee_pct: 6,
    ufa: { year_cents: 475000, min_blocks: 5 },
  }
  // A one-block class aligned to the 9:30 block on a given day.
  const oneBlock = (id, day) => ({
    ...POTTERY, id, name: `Class ${id}`, price_cents: 36500,
    meetings: [{ day_of_week: day, start_time: '09:30', end_time: '10:30' }],
  })

  it('block tier wins when cheaper than the per-class sum, with the payment plan', async () => {
    // 5 one-block classes = $1825 per-class vs the 5-block tier at $1500;
    // payment plan = $1500 × 1.06 / 10 = $159.00.
    api.get.mockImplementation(mockApi({
      schedule: {
        classes: [1, 2, 3, 4, 5].map((i) => oneBlock(`c${i}`, (i % 4) + 1)),
        time_blocks: BLOCKS, block_pricing: PRICING,
      },
    }))
    render(<ScheduleBuilderPage />)
    expect(await screen.findByText('Estimated total')).toBeInTheDocument()
    expect(screen.getByText('$1500.00')).toBeInTheDocument()
    expect(screen.getByText('or 10 payments of $159.00')).toBeInTheDocument()
    expect(screen.getByText(/5 blocks\/wk · 5-block plan/)).toBeInTheDocument()
    expect(screen.getByText(/6% convenience fee/)).toBeInTheDocument()
  })

  it('stays per-class priced below the tiers and rolls supply fees into the total', async () => {
    // 2 blocks = $730 per-class + $35 supplies = $765; 10 payments of $81.09.
    api.get.mockImplementation(mockApi({
      schedule: {
        classes: [{ ...oneBlock('c1', 2), supply_fee: 35 }, oneBlock('c2', 4)],
        time_blocks: BLOCKS, block_pricing: PRICING,
      },
    }))
    render(<ScheduleBuilderPage />)
    expect(await screen.findByText('Estimated total')).toBeInTheDocument()
    expect(screen.getByText('$765.00')).toBeInTheDocument()
    expect(screen.getByText('or 10 payments of $81.09')).toBeInTheDocument()
    expect(screen.getByText(/Includes \$35\.00 in supply fees/)).toBeInTheDocument()
  })

  it('billing_blocks overrides the hourly block count (Exceptional Kids bills as 4)', async () => {
    // 2 hourly blocks billing as 4, plus a 1-block class = 5 billing blocks:
    // per-class $1225 + $365 = $1590 vs the 5-block tier $1500 — tier wins.
    const exceptional = {
      ...POTTERY, id: 'ek', name: 'Exceptional Kids (Tuesday)', price_cents: 122500, billing_blocks: 4,
      meetings: [{ day_of_week: 2, start_time: '13:00', end_time: '15:00' }],
    }
    api.get.mockImplementation(mockApi({
      schedule: { classes: [exceptional, oneBlock('c1', 4)], time_blocks: BLOCKS, block_pricing: PRICING },
    }))
    render(<ScheduleBuilderPage />)
    expect(await screen.findByText('Estimated total')).toBeInTheDocument()
    expect(screen.getByText('$1500.00')).toBeInTheDocument()
    expect(screen.getByText(/5 blocks\/wk · 5-block plan/)).toBeInTheDocument()
  })

  it('requires-full-day programs prompt until every block on their days is filled', async () => {
    // Program anchors blocks 1 & 5 on Mon/Wed; blocks 2-4 are open on both
    // days (6 open) minus one filler on Monday block 2 = 5 open blocks.
    const program = {
      ...POTTERY, id: 'p1', name: 'Middle School Microschool (Mon/Wed)', price_cents: 122500,
      requires_full_day: true,
      meetings: [
        { day_of_week: 1, start_time: '09:30', end_time: '10:30' }, { day_of_week: 1, start_time: '14:00', end_time: '15:00' },
        { day_of_week: 3, start_time: '09:30', end_time: '10:30' }, { day_of_week: 3, start_time: '14:00', end_time: '15:00' },
      ],
    }
    const filler = { ...POTTERY, id: 'f1', name: 'Pre-Algebra', meetings: [{ day_of_week: 1, start_time: '10:30', end_time: '11:30' }] }
    api.get.mockImplementation(mockApi({
      schedule: { classes: [program, filler], time_blocks: BLOCKS, block_pricing: PRICING },
    }))
    render(<ScheduleBuilderPage />)
    expect(await screen.findByText(/requires a full day of classes/)).toBeInTheDocument()
    expect(screen.getByText(/5 open blocks on Monday and Wednesday/)).toBeInTheDocument()
  })

  it('UFA academy students pay the flat plan price and must reach the block minimum', async () => {
    api.get.mockImplementation(mockApi({
      schedule: {
        classes: [oneBlock('c1', 2)],
        time_blocks: BLOCKS, block_pricing: PRICING, tuition_plan: 'ufa_academy',
      },
    }))
    render(<ScheduleBuilderPage />)
    expect(await screen.findByText('Estimated total')).toBeInTheDocument()
    expect(screen.getByText('$4750.00')).toBeInTheDocument()
    expect(screen.getByText(/UFA academy tuition/)).toBeInTheDocument()
    expect(screen.getByText(/must schedule at least 5 blocks/)).toBeInTheDocument()
    expect(screen.getByText(/Add 4 more blocks/)).toBeInTheDocument()
  })

  // ── Age-exception requests ───────────────────────────────────────────────────
  // DOB 2018-03-10 + first day 2026-09-01 → the student is 8; Robotics is 9–12.
  const ORG_AGE8 = { ...ORG, students: [{ ...ORG.students[0], date_of_birth: '2018-03-10' }] }
  const ROBOTICS = { ...POTTERY, id: 'c3', name: 'Robotics', min_age: 9, max_age: 12 }

  it('hides out-of-age classes but offers a quiet exception request', async () => {
    api.get.mockImplementation(mockApi({
      orgs: [ORG_AGE8],
      schedule: { first_day_of_school: '2026-09-01' },
      classes: [POTTERY, ROBOTICS],
    }))
    api.post.mockResolvedValue({ data: { success: true, request: { id: 'r1' } } })
    render(<ScheduleBuilderPage />)
    await screen.findByTestId('schedule-day-2')
    await openTue9am()
    expect(screen.getByText('Pottery')).toBeInTheDocument()
    expect(screen.queryByText('Robotics')).not.toBeInTheDocument() // age 8 < min 9
    fireEvent.click(screen.getByRole('button', { name: 'ask the school for an age exception' }))
    expect(screen.getByRole('option', { name: 'Robotics (ages 9–12)' })).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/Why does this class fit/), {
      target: { value: 'She loves robots' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/parent/age-exception-requests', {
      organization_id: 'org1', student_user_id: 's1', class_id: 'c3', message: 'She loves robots',
    }))
  })

  it('shows a pending exception request instead of the ask link', async () => {
    api.get.mockImplementation(mockApi({
      orgs: [ORG_AGE8],
      schedule: { first_day_of_school: '2026-09-01', age_exception_requests: ['c3'] },
      classes: [ROBOTICS],
    }))
    render(<ScheduleBuilderPage />)
    await screen.findByTestId('schedule-day-2')
    await openTue9am()
    expect(screen.getByText(/Age exception requested for Robotics/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ask the school/ })).not.toBeInTheDocument()
  })

  it('never offers exception requests when the age is unknown', async () => {
    // No DOB on file: nothing is hidden by age, so there is nothing to request.
    api.get.mockImplementation(mockApi({ classes: [POTTERY, ROBOTICS] }))
    render(<ScheduleBuilderPage />)
    await screen.findByTestId('schedule-day-2')
    await openTue9am()
    expect(screen.getByText('Robotics')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ask the school/ })).not.toBeInTheDocument()
  })

  // ── Empty-slot messaging ─────────────────────────────────────────────────────
  it('blames age only when the age filter hid something at the slot', async () => {
    // Robotics (9–12) meets Tue 9am but the student is 8 → age did the hiding.
    api.get.mockImplementation(mockApi({
      orgs: [ORG_AGE8],
      schedule: { first_day_of_school: '2026-09-01' },
      classes: [ROBOTICS],
    }))
    render(<ScheduleBuilderPage />)
    await screen.findByTestId('schedule-day-2')
    await openTue9am()
    expect(screen.getByText(/No open classes for age 8 meet at this time/)).toBeInTheDocument()
  })

  it('uses a neutral empty message when no class meets at the slot at all', async () => {
    // The only class meets Wednesday — Tue 9am is empty for every age, so the
    // message must not imply an age problem.
    api.get.mockImplementation(mockApi({
      orgs: [ORG_AGE8],
      schedule: { first_day_of_school: '2026-09-01' },
      classes: [{ ...POTTERY, meetings: [{ day_of_week: 3, start_time: '09:00', end_time: '10:30' }] }],
    }))
    render(<ScheduleBuilderPage />)
    await screen.findByTestId('schedule-day-2')
    await openTue9am()
    expect(screen.getByText(/No classes are open for registration at this time/)).toBeInTheDocument()
    expect(screen.queryByText(/No open classes for age/)).not.toBeInTheDocument()
  })

  // ── Enrollment age-group waitlist ────────────────────────────────────────────
  it('renders read-only with a position banner when the student is enrollment-waitlisted', async () => {
    api.get.mockImplementation(mockApi({
      orgs: [ORG_AGE8],
      schedule: {
        enrollment_waitlist: { position: 4, band_label: 'ages 5–9' },
        time_blocks: [{ start: '09:00', end: '10:00' }],
      },
      classes: [POTTERY],
    }))
    render(<ScheduleBuilderPage />)
    await screen.findByTestId('schedule-day-2')
    expect(screen.getByText(/#4 on the enrollment waitlist for ages 5–9/)).toBeInTheDocument()
    // slots are inert: clicking the day column never opens the class picker
    clickTue9am()
    expect(screen.queryByText(/Classes at Tue/)).not.toBeInTheDocument()
  })

  it('shows the fee-due hold with a link back to the registration page', async () => {
    api.get.mockImplementation(mockApi({
      orgs: [ORG_AGE8],
      schedule: {
        registration_hold: true,
        registration_hold_reason: 'Registration fee due — finish it from your registration page.',
      },
      classes: [POTTERY],
    }))
    render(<ScheduleBuilderPage />)
    await screen.findByTestId('schedule-day-2')
    expect(screen.getByText(/Registration fee due/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Finish your registration fee' }))
      .toHaveAttribute('href', '/register/icreate/resume')
  })

  // ── Missing birthdate ────────────────────────────────────────────────────────
  it('warns when the student has no birthdate on file (age filtering is off)', async () => {
    api.get.mockImplementation(mockApi({ classes: [POTTERY] }))
    render(<ScheduleBuilderPage />)
    await screen.findByTestId('schedule-day-2')
    expect(screen.getByText(/We don't have Kid's birthdate/)).toBeInTheDocument()
    expect(screen.getByText(/Ask Micro School to add it/)).toBeInTheDocument()
  })

  it('shows no birthdate warning when the DOB is on file', async () => {
    api.get.mockImplementation(mockApi({ orgs: [ORG_AGE8], classes: [POTTERY] }))
    render(<ScheduleBuilderPage />)
    await screen.findByTestId('schedule-day-2')
    expect(screen.queryByText(/birthdate/)).not.toBeInTheDocument()
  })
})
