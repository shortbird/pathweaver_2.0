import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The class Waitlist tab's per-entry actions.
 *
 * iCreate, 2026-07-30: "We can't add people into a class from the waitlist that
 * got offered a seat. They also can't accept the offer. And, we have waitlisted
 * people that get offered a seat and it has expired before we can get them into
 * the class."
 *
 * The tab used to show a status word and nothing else — the only action was
 * "Offer next seat", which only ever reaches the front of the queue. An offered
 * or expired entry was a dead end.
 */

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'Org' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const WAITLIST = [
  { id: 'w1', position: 1, student_name: 'Van Stanfill', student_age: 9, status: 'offered',
    offer_expires_at: new Date(Date.now() + 3.5 * 86400000).toISOString() },
  { id: 'w2', position: 2, student_name: 'Nora Candland', student_age: 8, status: 'expired',
    offer_expires_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 'w3', position: 3, student_name: 'Milo Larson', student_age: 10, status: 'waiting' },
]

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(() => Promise.resolve({ data: { success: true } })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: { success: true } })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('../../pages/courses/CourseHomepage', () => ({ default: () => <div /> }))

import ClassesPage from './ClassesPage'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/waitlist')) return Promise.resolve({ data: { waitlist: WAITLIST } })
    if (url.includes('/api/sis/classes')) {
      return Promise.resolve({ data: { classes: [
        { id: 'c1', name: 'Lego Robotics', enrolled_count: 15, capacity: 15, is_full: true,
          waitlist_count: 3, meetings: [], registration_status: 'closed' },
      ] } })
    }
    return Promise.resolve({ data: {} })
  })
})

// The class modal (which owns the Waitlist tab) opens from the card view; the
// table view expands an inline editor instead.
const openWaitlistTab = async () => {
  render(<ClassesPage />)
  await screen.findByText('Lego Robotics')
  const cardToggle = screen.getByTitle('Card view')
  if (cardToggle.getAttribute('aria-pressed') !== 'true') fireEvent.click(cardToggle)
  fireEvent.click(await screen.findByText('Lego Robotics'))
  fireEvent.click(await screen.findByRole('button', { name: 'Waitlist' }))
  return screen.findByText(/Van Stanfill/)
}

describe('class waitlist — staff actions', () => {
  it('shows every entry with a readable status and the time left on an offer', async () => {
    await openWaitlistTab()
    expect(screen.getByText('Offered')).toBeInTheDocument()
    expect(screen.getByText('(3 days left)')).toBeInTheDocument() // 3.5 days out
    // An expired offer is still listed — it used to be a dead end.
    expect(screen.getByText('Offer expired')).toBeInTheDocument()
    expect(screen.getByText('Waiting')).toBeInTheDocument()
  })

  it('enrolls an offered student directly, without waiting for the family', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await openWaitlistTab()
    fireEvent.click(screen.getAllByRole('button', { name: 'Enroll now' })[0])
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/waitlist/w1/enroll', { organization_id: 'org-1' }),
    )
  })

  it('enrolls even when the class is full — an admin doing this by hand is the override', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await openWaitlistTab()
    // "Offer next seat" stays disabled on a full class...
    expect(screen.getByRole('button', { name: 'Offer next seat' })).toBeDisabled()
    // ...but admitting a named student is not blocked by it.
    const enroll = screen.getAllByRole('button', { name: 'Enroll now' })[0]
    expect(enroll).not.toBeDisabled()
    fireEvent.click(enroll)
    await waitFor(() => expect(api.post).toHaveBeenCalled())
  })

  it('re-offers a seat whose offer expired', async () => {
    await openWaitlistTab()
    // w1 (offered) and w2 (expired) both read "Offer again"; w3 reads "Offer seat".
    const again = screen.getAllByRole('button', { name: 'Offer again' })
    expect(again).toHaveLength(2)
    fireEvent.click(again[1])
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/waitlist/w2/offer', { organization_id: 'org-1' }),
    )
  })

  it('offers the seat to a specific waiting student, not just the next one', async () => {
    await openWaitlistTab()
    fireEvent.click(screen.getByRole('button', { name: 'Offer seat' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/waitlist/w3/offer', { organization_id: 'org-1' }),
    )
  })

  it('removes an entry after confirming', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await openWaitlistTab()
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith('/api/sis/waitlist/w1?organization_id=org-1'),
    )
  })

  it('does not enroll when the confirm is dismissed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await openWaitlistTab()
    fireEvent.click(screen.getAllByRole('button', { name: 'Enroll now' })[0])
    expect(api.post).not.toHaveBeenCalled()
  })
})
