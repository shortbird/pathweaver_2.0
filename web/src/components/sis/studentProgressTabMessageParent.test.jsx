/**
 * From a student's panel, a teacher can open their own Messages with that
 * student's parent.
 *
 * Nicole Connole (iCreate, 2026-09-17, 9c1b49a5): "It would be nice to have a
 * tab that would send me to messages with the parent and student. This will
 * allow me to send a more personalized message, like seeing if they need
 * help. Also, what does the 'send reminder' button do exactly?" The reminder
 * is a fixed list of what is open; a conversation is one click to the
 * parent's thread. Parent only, by decision. And the reminder button now says
 * what it does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

import StudentProgressTab from './StudentProgressTab'
import { withConfirm } from '../../tests/confirmTestUtils'

const render = (ui) => rtlRender(<MemoryRouter>{withConfirm(ui)}</MemoryRouter>)

const QUESTS = [{ quest_id: 'q1', title: 'Rock Cycle', due_date: null, student_ids: null }]
const SAM = {
  student_id: 'sam', name: 'Sam Bird', tasks_done: 0, tasks_total: 2,
  quests_started: 1, quests_completed: 0,
  cells: [{ quest_id: 'q1', assigned: true, started: true, completed: false, done: 0, total: 2 }],
}
const WORK = [
  { quest_id: 'q1', title: 'Rock Cycle', due_date: null, assigned: true, started: true, completed: false,
    tasks: [{ id: 't1', title: 'Draw the cycle', done: false }] },
]

const mockServer = (guardians) => api.get.mockImplementation((url) => (
  url.endsWith('/progress') && url.includes('/students/')
    ? Promise.resolve({ data: { quests: WORK, guardians } })
    : Promise.resolve({ data: { quests: QUESTS, students: [SAM] } })
))

beforeEach(() => { vi.clearAllMocks() })

describe('messaging a student\'s parent from their panel', () => {
  it('offers one Message link per guardian, into the teacher\'s own thread with them', async () => {
    mockServer([{ id: 'p-1', name: 'Jane Bird' }, { id: 'p-2', name: 'Grandpa Joe' }])
    render(<StudentProgressTab classId="c1" className="Earth Science" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sam Bird' }))

    const jane = await screen.findByRole('link', { name: 'Message Jane Bird' })
    expect(jane).toHaveAttribute('href', '/inbox?tab=mine&to=p-1')
    expect(screen.getByRole('link', { name: 'Message Grandpa Joe' }))
      .toHaveAttribute('href', '/inbox?tab=mine&to=p-2')
    // The student is not offered: parent only.
    expect(screen.queryByRole('link', { name: /Message Sam/ })).toBeNull()
  })

  it('offers nothing when the student has no guardian on file', async () => {
    mockServer([])
    render(<StudentProgressTab classId="c1" className="Earth Science" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sam Bird' }))
    await screen.findByRole('button', { name: 'Send reminder' })
    expect(screen.queryByRole('link', { name: /^Message / })).toBeNull()
  })

  it('says what the reminder does, next to it', async () => {
    mockServer([])
    render(<StudentProgressTab classId="c1" className="Earth Science" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sam Bird' }))
    const remind = await screen.findByRole('button', { name: 'Send reminder' })
    expect(remind.title).toMatch(/Sam and their parents/)
    expect(remind.title).toMatch(/quests and tasks still open/)
  })
})
