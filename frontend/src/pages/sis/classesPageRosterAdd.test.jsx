import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Adding and moving a student from the class's own roster.
 *
 * iCreate, 2026-08-17: "It would be great if we could add kids from the roster
 * link. Otherwise we have to go look up families and add them that way." And:
 * "It'd be super nice if we could move kids from one class to another
 * roster/waitlist popup."
 *
 * The waitlist half of the popup could already move somebody into a sibling
 * section; the enrolled half could only drop. Both endpoints existed — what was
 * missing was a way to reach them from the class you are looking at.
 *
 * Moving is limited to sibling sections on purpose: the same class at a
 * different time is what "she is in the wrong one" nearly always means, and it
 * is the only move that cannot change what the family is charged.
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
import { withConfirm, answerConfirm } from '../../tests/confirmTestUtils'

const ROSTER = [{ student_id: 's1', name: 'Nora Candland', age: 8, email: 'nora@example.com' }]
const PEOPLE = [
  { student_id: 's1', name: 'Nora Candland', age: 8, is_student: true },
  { student_id: 's2', name: 'Ryder Swenson', age: 9, is_student: true },
  { student_id: 'p1', name: 'Pat Parent', is_student: false },
]

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/sibling-sections')) {
      return Promise.resolve({ data: { sections: [
        { class_id: 'c2', name: 'Lego Robotics (Thu 1:00)', capacity: 12, enrolled_count: 9, spots_left: 3 },
      ] } })
    }
    if (url.includes('/enrollments')) return Promise.resolve({ data: { roster: ROSTER } })
    if (url.includes('/api/sis/roster')) return Promise.resolve({ data: { roster: PEOPLE } })
    if (url.includes('/waitlist')) return Promise.resolve({ data: { waitlist: [] } })
    if (url.includes('/api/sis/classes')) {
      return Promise.resolve({ data: { classes: [
        { id: 'c1', name: 'Lego Robotics (Tue 1:00)', enrolled_count: 1, capacity: 15, meetings: [] },
      ] } })
    }
    return Promise.resolve({ data: {} })
  })
})

const openRoster = async () => {
  render(<ClassesPage />)
  await screen.findByText('Lego Robotics (Tue 1:00)')
  const cardToggle = screen.getByTitle('Card view')
  if (cardToggle.getAttribute('aria-pressed') !== 'true') fireEvent.click(cardToggle)
  fireEvent.click(await screen.findByText('Lego Robotics (Tue 1:00)'))
  fireEvent.click(await screen.findByRole('button', { name: 'Roster' }))
  return screen.findByText('Nora Candland')
}

// SearchSelect commits on mouseDown (so a click outside can close it without
// eating the choice), which is what the picker has to be driven with.
const pickStudent = async (name) => {
  fireEvent.focus(screen.getByPlaceholderText('Search students…'))
  fireEvent.change(screen.getByPlaceholderText('Search students…'), { target: { value: name } })
  fireEvent.mouseDown(await screen.findByRole('button', { name: new RegExp(name) }))
}

describe('adding a student from the roster', () => {
  it('offers the org\'s students, and not its parents', async () => {
    await openRoster()
    fireEvent.focus(screen.getByPlaceholderText('Search students…'))
    expect(await screen.findByText(/Ryder Swenson/)).toBeInTheDocument()
    expect(screen.queryByText('Pat Parent')).not.toBeInTheDocument()
  })

  it('does not offer somebody already on this roster', async () => {
    await openRoster()
    fireEvent.focus(screen.getByPlaceholderText('Search students…'))
    await screen.findByText(/Ryder Swenson/)
    // Nora is in the list above as an enrolled row, but not in the picker.
    const options = [...document.querySelectorAll('li,button')].map((n) => n.textContent)
    expect(options.filter((t) => t === 'Nora Candland (age 8)')).toHaveLength(0)
  })

  it('enrolls the chosen student in this class', async () => {
    await openRoster()
    await pickStudent('Ryder Swenson')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/classes/c1/enrollments',
      { organization_id: 'org-1', student_user_id: 's2', force: false }))
  })

  it('asks before adding somebody still waiting for a place at the school', async () => {
    api.post.mockImplementation((url, body) => (
      body.force
        ? Promise.resolve({ data: { success: true } })
        : Promise.reject({ response: { status: 409, data: {
            enrollment_waitlisted: true,
            error: 'This student is still on the enrollment waitlist for the school.' } } })
    ))
    await openRoster()
    await pickStudent('Ryder Swenson')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await answerConfirm()
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/classes/c1/enrollments',
      { organization_id: 'org-1', student_user_id: 's2', force: true }))
  })
})

/**
 * iCreate, 2026-08-26: "I think it's a bug when you add a student to the roster
 * & waitlist that it doesn't update the enrolled number. This is happening on a
 * bunch of classes that i'm adding kids to." Followed the next morning by "Ok,
 * nevermind. The enrolled number finally updated" — it had taken a reload.
 *
 * The roster panel refetched only its own list. The "X / Y enrolled" column, the
 * Full chip and spots_left all live on the parent's class list, so they kept the
 * value they were loaded with until something else happened to reload the page.
 */
const classListCalls = () => api.get.mock.calls
  .filter(([url]) => url.includes('/api/sis/classes') && !url.includes('/enrollments')
    && !url.includes('/sibling-sections') && !url.includes('/waitlist')).length

describe('the enrolled count on the class list', () => {
  it('refreshes after a student is added to the roster', async () => {
    // clearAllMocks keeps implementations, so the 409 case above would otherwise
    // still be in force here and the add would stop on its confirm.
    api.post.mockResolvedValue({ data: { success: true } })
    await openRoster()
    const before = classListCalls()
    await pickStudent('Ryder Swenson')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(classListCalls()).toBeGreaterThan(before))
  })

  it('refreshes after a student is dropped', async () => {
    await openRoster()
    const before = classListCalls()
    fireEvent.click(screen.getByRole('button', { name: 'Drop' }))
    await answerConfirm()
    await waitFor(() => expect(classListCalls()).toBeGreaterThan(before))
  })

  it('refreshes after a student is moved to another section', async () => {
    await openRoster()
    const before = classListCalls()
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    fireEvent.click(await screen.findByRole('button', { name: /Lego Robotics \(Thu 1:00\)/ }))
    await waitFor(() => expect(classListCalls()).toBeGreaterThan(before))
  })
})

describe('moving a student to another section', () => {
  it('offers only the other sections with room', async () => {
    await openRoster()
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    expect(await screen.findByRole('button', { name: /Lego Robotics \(Thu 1:00\)/ })).toBeInTheDocument()
  })

  it('enrols into the new section before dropping the old one', async () => {
    /** A failure halfway through must leave the student somewhere. */
    const order = []
    api.post.mockImplementation((url) => { order.push(`post ${url}`); return Promise.resolve({ data: {} }) })
    api.delete.mockImplementation((url) => { order.push(`delete ${url}`); return Promise.resolve({ data: {} }) })

    await openRoster()
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    fireEvent.click(await screen.findByRole('button', { name: /Lego Robotics \(Thu 1:00\)/ }))

    await waitFor(() => expect(api.delete).toHaveBeenCalled())
    expect(order[0]).toBe('post /api/sis/classes/c2/enrollments')
    expect(order[1]).toContain('/api/sis/classes/c1/enrollments/s1')
  })

  it('does not offer Move when the class has no other sections', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/sibling-sections')) return Promise.resolve({ data: { sections: [] } })
      if (url.includes('/enrollments')) return Promise.resolve({ data: { roster: ROSTER } })
      if (url.includes('/api/sis/roster')) return Promise.resolve({ data: { roster: PEOPLE } })
      if (url.includes('/waitlist')) return Promise.resolve({ data: { waitlist: [] } })
      if (url.includes('/api/sis/classes')) {
        return Promise.resolve({ data: { classes: [
          { id: 'c1', name: 'Lego Robotics (Tue 1:00)', enrolled_count: 1, capacity: 15, meetings: [] },
        ] } })
      }
      return Promise.resolve({ data: {} })
    })
    await openRoster()
    expect(screen.queryByRole('button', { name: 'Move' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Drop' })).toBeInTheDocument()
  })
})
