import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The schedule reads as a table, not a card wall.
 *
 * iCreate, 2026-08-12: "Can you make the view bigger so they can see the
 * complete info on the class names? And add headers - time, class name, room?
 * Also, having the age would be good too." Long class names were truncating in
 * the old three-column card grid, and rows had no labels.
 */

const authState = { user: { id: 'u1', role: 'org_managed', org_role: 'advisor' } }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('./teacherPreview', () => ({
  getPreviewTeacher: () => null,
  withPreview: (p) => p,
  setPreviewTeacher: vi.fn(),
  clearPreviewTeacher: vi.fn(),
}))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null }),
  withOrg: (url, orgId) => `${url}?organization_id=${orgId}`,
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import MySchedulePanel from './classesPage/MySchedulePanel'

// The persisted list|grid choice must not leak between tests.
beforeEach(() => { try { localStorage.clear() } catch { /* jsdom */ } })

const LONG_NAME = 'Creative Explorers: Nature & Art (Thurs, Block 2)'

const scheduleData = {
  meetings: [
    { class_id: 'c1', class_name: LONG_NAME, day_of_week: 4,
      start_time: '09:00', end_time: '10:00', location: 'Art Studio',
      min_age: 5, max_age: 9 },
    { class_id: 'c2', class_name: 'Beginning Guitar Jam', day_of_week: 4,
      start_time: '10:00', end_time: '11:00', location: 'Music Studio',
      min_age: 10, max_age: null },
  ],
  assignments: [
    { title: 'Lunch duty', assignment_type: 'duty', day_of_week: 4,
      start_time: '12:00', end_time: '12:30', location: 'Cafeteria' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: scheduleData })
})

const renderPage = () => render(<MemoryRouter><MySchedulePanel /></MemoryRouter>)

describe('MySchedulePage table view', () => {
  it('shows column headers: Time, Class, Room, Ages', async () => {
    renderPage()
    await screen.findByText('Thursday')
    for (const header of ['Time', 'Class', 'Room', 'Ages']) {
      expect(screen.getAllByRole('columnheader', { name: header }).length).toBeGreaterThan(0)
    }
  })

  it('shows the complete class name as a link to the class', async () => {
    renderPage()
    const link = await screen.findByRole('link', { name: LONG_NAME })
    expect(link).toHaveAttribute('href', '/my-classes/c1')
  })

  it('shows the room and age range for each class', async () => {
    renderPage()
    await screen.findByText('Art Studio')
    expect(screen.getByText('5–9')).toBeInTheDocument()
    expect(screen.getByText('10+')).toBeInTheDocument()
    expect(screen.getByText('Music Studio')).toBeInTheDocument()
  })

  it('shows duties in the same table with a dash for ages', async () => {
    renderPage()
    await screen.findByText('Lunch duty')
    expect(screen.getByText('Cafeteria')).toBeInTheDocument()
    const dutyRow = screen.getByText('Lunch duty').closest('tr')
    expect(dutyRow).toHaveTextContent('—')
  })
})

/**
 * The same week as a grid (E4, 2026-09-18): one drawing, the student
 * record's WeeklyScheduleGrid, with the duties on it that the My classes
 * tab's own grid never showed. Mon-Fri always, today marked, a class block
 * opens the class.
 */
describe('MySchedulePanel week grid', () => {
  it('draws classes and duties on one grid, Monday to Friday', async () => {
    renderPage()
    await screen.findByText('Thursday')
    fireEvent.click(screen.getByTitle('Week grid'))
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
      expect(screen.getByRole('columnheader', { name: new RegExp(`^${day}`) })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: LONG_NAME })).toBeInTheDocument()
    expect(screen.getByText('Lunch duty')).toBeInTheDocument()
    expect(screen.getByText('Cafeteria')).toBeInTheDocument()
    // The list's day tables are gone while the grid is up.
    expect(screen.queryByRole('columnheader', { name: 'Ages' })).not.toBeInTheDocument()
  })

  it('a class block opens the class; a duty is not a door', async () => {
    renderPage()
    await screen.findByText('Thursday')
    fireEvent.click(screen.getByTitle('Week grid'))
    expect(screen.getByRole('button', { name: LONG_NAME })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lunch duty' })).not.toBeInTheDocument()
  })
})
