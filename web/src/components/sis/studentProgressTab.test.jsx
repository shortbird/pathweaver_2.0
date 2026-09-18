import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// The tab links out to the class's submissions, so it needs router context.
const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

import StudentProgressTab from './StudentProgressTab'

const QUESTS = [
  { quest_id: 'q1', title: 'Bridge Building', due_date: null },
  { quest_id: 'q2', title: 'Poetry Slam', due_date: '2026-09-01' },
]

const student = (name, cells, done = 0, total = 0) => ({
  student_id: name, name, cells, tasks_done: done, tasks_total: total,
  quests_started: cells.filter((c) => c.started).length,
  quests_completed: cells.filter((c) => c.completed).length,
})

const cell = (quest_id, over = {}) => ({
  quest_id, started: false, completed: false, done: 0, total: 0, ...over,
})

beforeEach(() => { vi.clearAllMocks() })

describe('StudentProgressTab', () => {
  it('reads progress from the class progress endpoint', async () => {
    api.get.mockResolvedValue({ data: { quests: [], students: [] } })
    render(<StudentProgressTab classId="c1" className="Art" />)
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/api/sis/classes/c1/progress'))
  })

  it('points the teacher at the Quests tab when nothing is assigned', async () => {
    api.get.mockResolvedValue({ data: { quests: [], students: [] } })
    render(<StudentProgressTab classId="c1" className="Art" />)
    expect(await screen.findByText('No quests assigned to this class yet.')).toBeInTheDocument()
    expect(screen.getByText(/Assign one on the Quests tab/)).toBeInTheDocument()
  })

  it('offers a way into this class\'s submissions', async () => {
    /** Submissions is another tab of Classes, a long way from the page a
     *  teacher is on when they wonder what somebody handed in (Gryffin,
     *  2026-08-27: "a submissions tab should be under student progress. It is
     *  hard to figure out where to find that"). Pre-filtered to the class. */
    api.get.mockResolvedValue({
      data: { quests: QUESTS, students: [student('Ada', [cell('q1'), cell('q2')])] },
    })
    render(<StudentProgressTab classId="c1" className="Art" />)
    const link = await screen.findByRole('link', { name: /Review submissions/i })
    expect(link).toHaveAttribute('href', '/classes?tab=submissions&class_id=c1&from=progress')
  })

  it('says the roster is empty rather than showing a bare table', async () => {
    api.get.mockResolvedValue({ data: { quests: QUESTS, students: [] } })
    render(<StudentProgressTab classId="c1" className="Art" />)
    expect(await screen.findByText('No students enrolled in this class yet.')).toBeInTheDocument()
  })

  it('shows a column per quest and a row per student', async () => {
    api.get.mockResolvedValue({
      data: {
        quests: QUESTS,
        students: [
          student('Ada Byron', [cell('q1', { started: true, completed: true, done: 3, total: 3 }), cell('q2')], 3, 3),
          student('Blaise Pascal', [cell('q1', { started: true, done: 1, total: 4 }), cell('q2')], 1, 4),
        ],
      },
    })
    render(<StudentProgressTab classId="c1" className="Art" />)

    // Each name is also an <option> in the student picker; the row is the button.
    expect(await screen.findByRole('button', { name: 'Ada Byron' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Blaise Pascal' })).toBeInTheDocument()
    expect(screen.getByText('Bridge Building')).toBeInTheDocument()
    expect(screen.getByText('Poetry Slam')).toBeInTheDocument()
  })

  it('distinguishes done, part-way, and not started', async () => {
    api.get.mockResolvedValue({
      data: {
        quests: [QUESTS[0]],
        students: [
          student('Ada Byron', [cell('q1', { started: true, completed: true, done: 3, total: 3 })], 3, 3),
          student('Blaise Pascal', [cell('q1', { started: true, done: 1, total: 4 })], 1, 4),
          student('Carl Gauss', [cell('q1')], 0, 0),
        ],
      },
    })
    render(<StudentProgressTab classId="c1" className="Art" />)

    expect(await screen.findByText('Done')).toBeInTheDocument()
    expect(screen.getByText('1/4')).toBeInTheDocument()
    expect(screen.getByText('Not started')).toBeInTheDocument()
  })

  it('calls out students who have started nothing', async () => {
    api.get.mockResolvedValue({
      data: {
        quests: [QUESTS[0]],
        students: [
          student('Ada Byron', [cell('q1', { started: true, done: 1, total: 4 })], 1, 4),
          student('Carl Gauss', [cell('q1')], 0, 0),
        ],
      },
    })
    render(<StudentProgressTab classId="c1" className="Art" />)

    expect(await screen.findByText(/1 student hasn’t started anything yet/)).toBeInTheDocument()
  })

  it('says plainly that nothing needs filling in', async () => {
    api.get.mockResolvedValue({
      data: {
        quests: [QUESTS[0]],
        students: [student('Ada Byron', [cell('q1', { started: true, done: 1, total: 4 })], 1, 4)],
      },
    })
    render(<StudentProgressTab classId="c1" className="Art" />)

    expect(await screen.findByText(/there is nothing to fill in/)).toBeInTheDocument()
  })

  it('surfaces a load failure instead of rendering an empty table', async () => {
    const { toast } = await import('react-hot-toast')
    api.get.mockRejectedValue({ response: { data: { error: 'Class not found' } } })
    render(<StudentProgressTab classId="c1" className="Art" />)

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Class not found'))
  })
})

/**
 * Check-in mode (Dallin, 2026-09-15). A teacher turns the screen toward one
 * student: the grid narrows to that student, the total stays in view however
 * far the quest columns scroll, and the grid opens on the newest quests.
 */
describe('StudentProgressTab during a check-in', () => {
  const threeStudents = () => api.get.mockResolvedValue({
    data: {
      quests: QUESTS,
      students: [
        student('Ada Byron', [cell('q1', { started: true, completed: true, done: 3, total: 3 }), cell('q2')], 3, 3),
        student('Blaise Pascal', [cell('q1', { started: true, done: 1, total: 4 }), cell('q2')], 1, 4),
        student('Carl Gauss', [cell('q1'), cell('q2')], 0, 0),
      ],
    },
  })

  it('narrows the grid to one student, and back to everyone', async () => {
    threeStudents()
    render(<StudentProgressTab classId="c1" className="Art" />)
    await screen.findByRole('button', { name: 'Ada Byron' })

    const picker = screen.getByRole('combobox', { name: 'Show one student' })
    fireEvent.change(picker, { target: { value: 'Blaise Pascal' } })

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByRole('button', { name: 'Blaise Pascal' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ada Byron' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Carl Gauss' })).not.toBeInTheDocument()
    // The quest columns are all still there: this is one student's whole row.
    expect(screen.getByText('Bridge Building')).toBeInTheDocument()
    expect(screen.getByText('Poetry Slam')).toBeInTheDocument()

    fireEvent.change(picker, { target: { value: '' } })
    expect(within(screen.getByRole('table')).getAllByRole('row').slice(1)).toHaveLength(3)
  })

  it('does not tell the picked student about the other students', async () => {
    /** "1 student hasn't started anything yet" is about Carl. With Blaise on
     *  screen it would be a hint about somebody else's work. */
    threeStudents()
    render(<StudentProgressTab classId="c1" className="Art" />)
    expect(await screen.findByText(/1 student hasn’t started anything yet/)).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'Show one student' }),
      { target: { value: 'Blaise Pascal' } })
    expect(screen.queryByText(/started anything yet/)).not.toBeInTheDocument()
  })

  it('prints only the picked student', async () => {
    threeStudents()
    const printed = { html: '' }
    const fakeWindow = {
      document: { write: (h) => { printed.html += h }, close: vi.fn() },
      print: vi.fn(),
    }
    const open = vi.spyOn(window, 'open').mockReturnValue(fakeWindow)
    try {
      render(<StudentProgressTab classId="c1" className="Art" />)
      await screen.findByRole('button', { name: 'Ada Byron' })
      fireEvent.change(screen.getByRole('combobox', { name: 'Show one student' }),
        { target: { value: 'Blaise Pascal' } })
      fireEvent.click(screen.getByRole('button', { name: /Print/ }))

      expect(fakeWindow.print).toHaveBeenCalled()
      expect(printed.html).toContain('Blaise Pascal')
      expect(printed.html).not.toContain('Ada Byron')
      expect(printed.html).not.toContain('Carl Gauss')
    } finally {
      open.mockRestore()
    }
  })

  it('keeps the tasks-done column pinned to the right edge', async () => {
    threeStudents()
    render(<StudentProgressTab classId="c1" className="Art" />)
    await screen.findByRole('button', { name: 'Ada Byron' })

    const header = screen.getByRole('columnheader', { name: 'Tasks done' })
    expect(header.className).toMatch(/\bsticky\b/)
    expect(header.className).toMatch(/\bright-0\b/)
    // And every cell under it, or the header pins while the numbers slide away.
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    for (const row of rows) {
      const last = within(row).getAllByRole('cell').at(-1)
      expect(last.className).toMatch(/\bsticky\b/)
      expect(last.className).toMatch(/\bright-0\b/)
    }
  })

  it('opens scrolled to the newest quests at the far right', async () => {
    /** jsdom lays nothing out, so scrollWidth is faked and the scrollLeft
     *  write is captured. */
    threeStudents()
    const scrolled = []
    const proto = HTMLElement.prototype
    Object.defineProperty(proto, 'scrollWidth', { configurable: true, get: () => 1234 })
    Object.defineProperty(proto, 'scrollLeft', {
      configurable: true, get: () => 0, set(v) { scrolled.push([this, v]) },
    })
    try {
      render(<StudentProgressTab classId="c1" className="Art" />)
      await screen.findByRole('button', { name: 'Ada Byron' })
      await waitFor(() => expect(scrolled.length).toBeGreaterThan(0))
      const [el, left] = scrolled.at(-1)
      expect(left).toBe(1234)
      expect(el).toContainElement(screen.getByRole('table'))
    } finally {
      delete proto.scrollWidth
      delete proto.scrollLeft
    }
  })
})
