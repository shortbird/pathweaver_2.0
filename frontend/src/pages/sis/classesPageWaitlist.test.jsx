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

const render = (ui) => rtlRender(<MemoryRouter>{withConfirm(ui)}</MemoryRouter>)

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'Org' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const WAITLIST = [
  { id: 'w1', student_user_id: 'v1', position: 1, student_name: 'Van Stanfill', student_age: 9,
    status: 'offered', offer_expires_at: new Date(Date.now() + 3.5 * 86400000).toISOString() },
  { id: 'w2', student_user_id: 'n1', position: 2, student_name: 'Nora Candland', student_age: 8,
    status: 'expired', offer_expires_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 'w3', student_user_id: 'w3', position: 3, student_name: 'Milo Larson', student_age: 10,
    status: 'waiting' },
]

// Whoever the office might queue by hand. w1-w3 above are already on this
// waitlist and must not be offered again.
const PEOPLE = [
  { student_id: 's9', name: 'Ryder Swenson', age: 9, is_student: true },
  { student_id: 'w3', name: 'Milo Larson', age: 10, is_student: true },
  { student_id: 'p1', name: 'Pat Parent', is_student: false },
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
import { withConfirm, answerConfirm, confirmText } from '../../tests/confirmTestUtils'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/sibling-sections')) {
      return Promise.resolve({ data: { sections: [
        { class_id: 'c2', name: 'Lego Robotics (Thu 1:00)', capacity: 12, enrolled_count: 9 },
      ] } })
    }
    if (url.includes('/waitlist')) return Promise.resolve({ data: { waitlist: WAITLIST } })
    if (url.includes('/api/sis/roster')) return Promise.resolve({ data: { roster: PEOPLE } })
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
    await openWaitlistTab()
    fireEvent.click(screen.getAllByRole('button', { name: 'Enroll now' })[0])
    await answerConfirm()
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/waitlist/w1/enroll',
        { organization_id: 'org-1', force: false }),
    )
  })

  it('names the clash before admitting into the class they queued for', async () => {
    // The gap that double-booked Charlotte Myers into two Wednesday sections:
    // the sibling-section move asked first, admitting into the original didn't.
    api.post.mockImplementation((url, body) => (
      url.includes('/enroll') && !body.force
        ? Promise.reject({ response: { status: 409, data: {
            conflicts: [{ class_id: 'cX', class_name: 'Elementary Microschool (Wednesday)' }] } } })
        : Promise.resolve({ data: { success: true } })
    ))
    await openWaitlistTab()
    fireEvent.click(screen.getAllByRole('button', { name: 'Enroll now' })[0])
    await answerConfirm()                       // the plain "enroll now?" ask
    expect(await confirmText()).toMatch(/already has Elementary Microschool/)
    await answerConfirm()                       // the clash warning
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/waitlist/w1/enroll',
      { organization_id: 'org-1', force: true }))
  })

  it('enrolls even when the class is full — an admin doing this by hand is the override', async () => {
    await openWaitlistTab()
    // "Offer next seat" stays disabled on a full class...
    expect(screen.getByRole('button', { name: 'Offer next seat' })).toBeDisabled()
    // ...but admitting a named student is not blocked by it.
    const enroll = screen.getAllByRole('button', { name: 'Enroll now' })[0]
    expect(enroll).not.toBeDisabled()
    fireEvent.click(enroll)
    await answerConfirm()
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
    await openWaitlistTab()
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    await answerConfirm()
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith('/api/sis/waitlist/w1?organization_id=org-1'),
    )
  })

  it('does not enroll when the confirm is dismissed', async () => {
    await openWaitlistTab()
    fireEvent.click(screen.getAllByRole('button', { name: 'Enroll now' })[0])
    await answerConfirm(false)
    expect(api.post).not.toHaveBeenCalled()
  })

  // iCreate, 2026-07-31: "Could we offer other sections of classes to people on a
  // waitlist? For example, there are 8 on the waitlist on tuesday at 10:30am, but
  // we have spots in the other ukelele classes."
  // iCreate, 2026-08-01, on the first cut of this: "can we OFFER them the seat
  // since we don't know what their schedule is? If we enroll them, then they'll
  // be enrolled in two sections at the same time." Offering is the primary
  // action; the family claims it.
  it('offers the other section to the family to claim', async () => {
    await openWaitlistTab()
    fireEvent.click(screen.getAllByRole('button', { name: 'Other section ▾' })[0])
    fireEvent.click(await screen.findByRole('button', { name: 'Offer it' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/waitlist/w1/offer-section',
      { organization_id: 'org-1', class_id: 'c2' },
    ))
  })

  it('still allows a direct enroll when the office knows the time works', async () => {
    await openWaitlistTab()
    fireEvent.click(screen.getAllByRole('button', { name: 'Other section ▾' })[0])
    fireEvent.click(await screen.findByRole('button', { name: 'Enroll directly' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/waitlist/w1/enroll',
      { organization_id: 'org-1', class_id: 'c2', force: false },
    ))
  })

  it('names the clash before double-booking a student, and forces on confirm', async () => {
    api.post.mockImplementation((url, body) => {
      if (url.includes('/enroll') && !body.force) {
        return Promise.reject({ response: { status: 409, data: {
          conflicts: [{ class_id: 'cX', class_name: 'Art Expeditions' }],
          section: 'Lego Robotics (Thu 1:00)',
        } } })
      }
      return Promise.resolve({ data: { success: true } })
    })
    await openWaitlistTab()
    fireEvent.click(screen.getAllByRole('button', { name: 'Other section ▾' })[0])
    fireEvent.click(await screen.findByRole('button', { name: 'Enroll directly' }))
    expect(await confirmText()).toMatch(/already has Art Expeditions at that time/)
    await answerConfirm()
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/waitlist/w1/enroll',
      { organization_id: 'org-1', class_id: 'c2', force: true },
    ))
  })

  it('leaves the student alone when the clash confirm is dismissed', async () => {
    api.post.mockImplementation((url, body) => (
      url.includes('/enroll') && !body.force
        ? Promise.reject({ response: { status: 409, data: {
            conflicts: [{ class_id: 'cX', class_name: 'Art Expeditions' }] } } })
        : Promise.resolve({ data: { success: true } })
    ))
    await openWaitlistTab()
    fireEvent.click(screen.getAllByRole('button', { name: 'Other section ▾' })[0])
    fireEvent.click(await screen.findByRole('button', { name: 'Enroll directly' }))
    await answerConfirm(false)
    expect(api.post).toHaveBeenCalledTimes(1)   // never re-sent with force
  })

  it('shows how many seats the other section has left', async () => {
    await openWaitlistTab()
    fireEvent.click(screen.getAllByRole('button', { name: 'Other section ▾' })[0])
    expect(await screen.findByText(/3 seat\(s\)/)).toBeInTheDocument()
  })

  // iCreate, 2026-09-02: "It would help if we could manually add people to the
  // waitlist." Families queue themselves in the Schedule Builder; the office
  // takes the same ask at the desk and had nowhere to put it.
  it('queues a student the office adds by hand', async () => {
    await openWaitlistTab()
    fireEvent.focus(screen.getByPlaceholderText('Search students…'))
    fireEvent.change(screen.getByPlaceholderText('Search students…'),
      { target: { value: 'Ryder' } })
    fireEvent.mouseDown(await screen.findByRole('button', { name: /Ryder Swenson/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/classes/c1/waitlist',
      { organization_id: 'org-1', student_user_id: 's9', force: false }))
  })

  it('does not offer somebody already in this queue', async () => {
    await openWaitlistTab()
    fireEvent.focus(screen.getByPlaceholderText('Search students…'))
    expect(await screen.findByText(/Ryder Swenson/)).toBeInTheDocument()
    // Milo is on the waitlist already (w3) — listed as an entry, not as an option.
    const options = [...document.querySelectorAll('li,button')].map((n) => n.textContent)
    expect(options.filter((t) => t === 'Milo Larson (age 10)')).toHaveLength(0)
  })

  it('offers no other-section picker when every sibling is full', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/sibling-sections')) return Promise.resolve({ data: { sections: [] } })
      if (url.includes('/waitlist')) return Promise.resolve({ data: { waitlist: WAITLIST } })
      if (url.includes('/api/sis/classes')) {
        return Promise.resolve({ data: { classes: [
          { id: 'c1', name: 'Lego Robotics', enrolled_count: 15, capacity: 15, is_full: true,
            waitlist_count: 3, meetings: [], registration_status: 'closed' },
        ] } })
      }
      return Promise.resolve({ data: {} })
    })
    await openWaitlistTab()
    expect(screen.queryByRole('button', { name: 'Other section ▾' })).not.toBeInTheDocument()
  })
})
