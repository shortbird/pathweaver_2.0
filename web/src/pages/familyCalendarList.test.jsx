import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import api from '../services/api'
import FamilyCalendarPage from './FamilyCalendarPage'
import EventRsvp from '../components/school/EventRsvp'

/**
 * The family calendar's List view, and signing up named children.
 *
 * Apogee NoCo (Summer Hurd), SPARK Friday Excursions, 2026-10-16: a page
 * listing the semester's excursions with dates and locations, a sign-up button
 * per excursion, and a family able to change its sign-up. "Full" turns new
 * families away and never locks out a family that is already in.
 */

vi.mock('../hooks/useSchoolContext', () => ({
  default: () => ({ orgs: [{ organization_id: 'org-1', organization_name: 'Apogee NoCo' }] }),
}))
vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const ZOO = {
  id: 'e1', title: 'SPARK: Zoo', start_at: '2099-10-09T09:00:00Z', end_at: '2099-10-09T14:00:00Z',
  all_day: false, location: 'Denver Zoo', categories: ['SPARK'], rsvp_enabled: true,
  rsvp_mode: 'children', rsvp_capacity: 12, rsvp_spots_left: 4, rsvp_full: false,
  my_rsvp: { attending: true, party_size: 2, student_ids: ['a', 'b'] },
}
const MUSEUM = {
  ...ZOO, id: 'e2', title: 'SPARK: Museum', start_at: '2099-10-23T09:00:00Z', end_at: null,
  location: 'Museum of Nature', rsvp_spots_left: 0, rsvp_full: true, my_rsvp: null,
}
const PICNIC = {
  id: 'e3', title: 'Family picnic', start_at: '2099-10-12T00:00:00Z', all_day: true,
  categories: ['Community'], rsvp_enabled: false,
}

const renderAt = (url) => render(
  <MemoryRouter initialEntries={[url]}><FamilyCalendarPage /></MemoryRouter>,
)

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(() => Promise.resolve({ data: { success: true, events: [MUSEUM, PICNIC, ZOO] } }))
})

describe('the List view', () => {
  it('lists upcoming events in date order with where and the sign-up state', async () => {
    renderAt('/school-calendar?view=list')
    const list = await screen.findByRole('list', { name: 'Upcoming events' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows[1]).toHaveTextContent('Family picnic')
    expect(rows[0]).toHaveTextContent('SPARK: Zoo')
    expect(rows[0]).toHaveTextContent('Denver Zoo')
    expect(rows[0]).toHaveTextContent('Signed up · 2 children')
    expect(rows[2]).toHaveTextContent('Full')
    // From today with no end: the semester, not a month.
    const url = api.get.mock.calls.map((c) => c[0]).find((u) => !u.includes('&to='))
    expect(url).toMatch(/from=\d{4}-\d{2}-\d{2}$/)
  })

  it('filters by a category given in the link, so the school can share "the SPARK page"', async () => {
    renderAt('/school-calendar?category=SPARK')
    const list = await screen.findByRole('list', { name: 'Upcoming events' })
    expect(within(list).queryByText('Family picnic')).not.toBeInTheDocument()
    expect(within(list).getByText('SPARK: Zoo')).toBeInTheDocument()
    expect(screen.getByText('Upcoming: SPARK')).toBeInTheDocument()
    expect(screen.getByText('Copy link to this list')).toBeInTheDocument()
  })

  it('opens an event from the list with its sign-up', async () => {
    api.get.mockImplementation((url) => (url.includes('/rsvp')
      ? Promise.resolve({ data: { rsvp: null, children: [], spots_left: 0 } })
      : Promise.resolve({ data: { success: true, events: [MUSEUM, PICNIC, ZOO] } })))
    renderAt('/school-calendar?view=list')
    fireEvent.click(await screen.findByText('SPARK: Museum'))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Museum of Nature')
    expect(await within(dialog).findByText('This event is full.')).toBeInTheDocument()
  })
})

describe('signing up named children', () => {
  const KIDS = [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Ben' }]

  it('ticks the family\'s own children and sends who is coming', async () => {
    api.get.mockResolvedValue({ data: { rsvp: null, children: KIDS, spots_left: 5 } })
    api.post.mockResolvedValue({ data: { rsvp: { attending: true, student_ids: ['b'] } } })
    render(<EventRsvp event={{ ...ZOO, my_rsvp: null }} orgId="org-1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sign up' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ben' }))
    expect(screen.getByRole('checkbox', { name: 'Ada' })).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1]).toMatchObject({ attending: true, student_ids: ['b'] })
    expect(screen.getByText('5 spots left')).toBeInTheDocument()
  })

  it('turns a new family away when full', async () => {
    api.get.mockResolvedValue({ data: { rsvp: null, children: KIDS, spots_left: 0 } })
    render(<EventRsvp event={MUSEUM} orgId="org-1" />)
    expect(await screen.findByText('This event is full.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign up' })).not.toBeInTheDocument()
  })

  it('lets a family already in change down when full', async () => {
    api.get.mockResolvedValue({
      data: { rsvp: { attending: true, party_size: 2, student_ids: ['a', 'b'] }, children: KIDS, spots_left: 0 },
    })
    api.post.mockResolvedValue({ data: { rsvp: { attending: true, student_ids: ['a'] } } })
    render(<EventRsvp event={MUSEUM} orgId="org-1" />)
    expect(await screen.findByText('Signed up: Ada, Ben.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Change your reply' }))
    expect(screen.getByRole('checkbox', { name: 'Ben' })).toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ben' }))
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].student_ids).toEqual(['a'])
  })

  it('keeps the headcount form for a count event', async () => {
    api.get.mockResolvedValue({ data: { rsvp: null, spots_left: null } })
    render(<EventRsvp event={{ ...ZOO, rsvp_mode: 'count', rsvp_capacity: null, my_rsvp: null }} orgId="org-1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'RSVP' }))
    expect(screen.getByLabelText('How many people')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
