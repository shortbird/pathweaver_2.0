import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import StudentProgressTab from './StudentProgressTab'
import { withConfirm } from '../../tests/confirmTestUtils'

/**
 * The Student Progress tab in XP, with its states and an engagement line.
 * Three iCreate tickets from 2026-09-23:
 *
 *  d4e562c9 -- "I would like to see the top number be how many XP they have
 *    completed/how many XP they need to complete... Colby Barker ... says 2/8
 *    but in reality he has completed 50XP, and he needs 50XP. So it would be
 *    50XP/50XP."
 *  8b928af0 -- "When a parent completes a Quest and ends it, it would be nice
 *    to know/see that on this page. Like a check mark."
 *  7cf5d330 -- "We'd want to see 'opened' 'assigned' 'done' & engagement
 *    metric"
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))


const render = (ui) => rtlRender(<MemoryRouter>{withConfirm(ui)}</MemoryRouter>)

const ENDED = '2026-09-03T18:00:00+00:00'
const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

const QUESTS = [
  { quest_id: 'q1', title: 'Volcanoes', xp_threshold: 50 },
  { quest_id: 'q2', title: 'Rock Cycle', xp_threshold: 0 },
  { quest_id: 'q3', title: 'Fossils', xp_threshold: 100 },
  { quest_id: 'q4', title: 'Tides', xp_threshold: 0 },
]

const cell = (quest_id, over) => ({
  quest_id, assigned: true, started: true, completed: false, done: 0, total: 0,
  xp_earned: 0, xp_required: 0, state: 'assigned', completed_at: null, set_aside: false,
  first_opened_at: null, ...over,
})

const COLBY = {
  student_id: 'colby', name: 'Colby Barker', tasks_done: 3, tasks_total: 14,
  xp_earned: 75, xp_required: 200, quests_started: 4, quests_completed: 1,
  last_activity_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  xp_last_7_days: 50,
  cells: [
    cell('q1', { completed: true, done: 2, total: 8, xp_earned: 50, xp_required: 50,
      state: 'done', completed_at: ENDED }),
    cell('q2', { state: 'opened', first_opened_at: '2026-09-20T18:00:00+00:00', total: 2, xp_required: 50 }),
    cell('q3', { state: 'set_aside', set_aside: true, done: 1, total: 4, xp_earned: 25, xp_required: 100 }),
    cell('q4', { state: 'assigned' }),
  ],
}

const QUIET = {
  student_id: 'quiet', name: 'Quinn Quiet', tasks_done: 0, tasks_total: 0,
  xp_earned: 0, xp_required: 0, quests_started: 0, quests_completed: 0,
  last_activity_at: null, xp_last_7_days: 0,
  cells: QUESTS.map((q) => cell(q.quest_id, { state: 'assigned' })),
}

const WORK = [
  { quest_id: 'q1', title: 'Volcanoes', assigned: true, started: true, completed: true,
    xp_earned: 50, xp_required: 50, state: 'done', completed_at: ENDED, set_aside: false, tasks: [] },
  { quest_id: 'q3', title: 'Fossils', assigned: true, started: true, completed: false,
    xp_earned: 25, xp_required: 100, state: 'set_aside', completed_at: null, set_aside: true, tasks: [] },
  { quest_id: 'q2', title: 'Rock Cycle', assigned: true, started: true, completed: false,
    xp_earned: 0, xp_required: 50, state: 'opened', completed_at: null, set_aside: false, tasks: [] },
]

const mockServer = (students = [COLBY]) => api.get.mockImplementation((url) => (
  url.includes('/students/')
    ? Promise.resolve({ data: { quests: WORK, guardians: [] } })
    : Promise.resolve({ data: { quests: QUESTS, students } })
))

const cellFor = (title) => {
  const table = screen.getByRole('table')
  const headers = within(table).getAllByRole('columnheader')
  const col = headers.findIndex((h) => h.textContent.includes(title))
  const row = within(table).getAllByRole('row')[1]
  return within(row).getAllByRole('cell')[col]
}

beforeEach(() => { vi.clearAllMocks() })

describe('XP on the grid (d4e562c9)', () => {
  it('leads with XP earned over XP needed, and keeps the task count as secondary text', async () => {
    mockServer()
    render(<StudentProgressTab classId="c1" className="Earth Science" />)
    await screen.findByRole('button', { name: 'Colby Barker' })

    const volcanoes = cellFor('Volcanoes')
    expect(volcanoes).toHaveTextContent('50 / 50 XP')
    expect(volcanoes).toHaveTextContent('2/8 tasks')
    expect(volcanoes).not.toHaveTextContent(/^2\/8$/)
  })

  it('names the right-hand column XP and shows the student total in XP', async () => {
    mockServer()
    render(<StudentProgressTab classId="c1" className="Earth Science" />)
    await screen.findByRole('button', { name: 'Colby Barker' })

    expect(screen.getByRole('columnheader', { name: 'XP' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Tasks done' })).not.toBeInTheDocument()
    const total = within(screen.getAllByRole('row')[1]).getAllByRole('cell').at(-1)
    expect(total).toHaveTextContent('75 / 200 XP')
    expect(total).toHaveTextContent('3/14 tasks')
  })

  it('prints XP too', async () => {
    mockServer()
    const printed = { html: '' }
    const fakeWindow = { document: { write: (h) => { printed.html += h }, close: vi.fn() }, print: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(fakeWindow)
    try {
      render(<StudentProgressTab classId="c1" className="Earth Science" />)
      await screen.findByRole('button', { name: 'Colby Barker' })
      fireEvent.click(screen.getByRole('button', { name: /Print/ }))
      expect(printed.html).toContain('<th>XP</th>')
      expect(printed.html).toContain('50 / 50 XP')
      expect(printed.html).toContain('75 / 200 XP')
      expect(printed.html).toContain('Set aside')
    } finally {
      open.mockRestore()
    }
  })

  it('shows the student total in XP at the top of the student panel', async () => {
    mockServer()
    render(<StudentProgressTab classId="c1" className="Earth Science" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Colby Barker' }))
    expect(await screen.findByText('75 / 200 XP', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText(/3\/14 tasks done/)).toBeInTheDocument()
  })
})

describe('ended and set aside (8b928af0)', () => {
  it('puts a check and the end date on a quest the family ended', async () => {
    mockServer()
    render(<StudentProgressTab classId="c1" className="Earth Science" />)
    await screen.findByRole('button', { name: 'Colby Barker' })

    const volcanoes = cellFor('Volcanoes')
    expect(volcanoes).toHaveTextContent('✓ 50 / 50 XP')
    expect(volcanoes).toHaveTextContent(`Ended ${shortDate(ENDED)}`)
  })

  it('says Set aside, not Done, for a quest ended below its target', async () => {
    mockServer()
    render(<StudentProgressTab classId="c1" className="Earth Science" />)
    await screen.findByRole('button', { name: 'Colby Barker' })

    const fossils = cellFor('Fossils')
    expect(fossils).toHaveTextContent('Set aside')
    expect(fossils).toHaveTextContent('25 / 100 XP')
    expect(fossils).not.toHaveTextContent('✓')
  })

  it('carries the same marks next to the quest titles in the student panel', async () => {
    mockServer()
    render(<StudentProgressTab classId="c1" className="Earth Science" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Colby Barker' }))

    expect(await screen.findByText(`✓ Ended ${shortDate(ENDED)}`)).toBeInTheDocument()
    const fossils = screen.getByText('Fossils', { selector: 'p' })
    expect(within(fossils).getByText('Set aside')).toBeInTheDocument()
    const rock = screen.getByText('Rock Cycle', { selector: 'p' })
    expect(rock).not.toHaveTextContent('Ended')
    expect(rock).not.toHaveTextContent('Set aside')
  })

  it('a done quest nobody ended says Done without a check', async () => {
    const reached = { ...COLBY, cells: [cell('q1', { completed: true, done: 2, total: 8,
      xp_earned: 50, xp_required: 50, state: 'done', completed_at: null }), ...COLBY.cells.slice(1)] }
    mockServer([reached])
    render(<StudentProgressTab classId="c1" className="Earth Science" />)
    await screen.findByRole('button', { name: 'Colby Barker' })

    const volcanoes = cellFor('Volcanoes')
    expect(volcanoes).toHaveTextContent('50 / 50 XP')
    expect(volcanoes).toHaveTextContent('Done')
    expect(volcanoes).not.toHaveTextContent('✓')
    expect(volcanoes).not.toHaveTextContent('Ended')
  })
})

describe('assigned, opened, and engagement (7cf5d330)', () => {
  it('tells Opened from Assigned', async () => {
    mockServer()
    render(<StudentProgressTab classId="c1" className="Earth Science" />)
    await screen.findByRole('button', { name: 'Colby Barker' })

    expect(cellFor('Rock Cycle')).toHaveTextContent('Opened')
    expect(cellFor('Tides')).toHaveTextContent('Assigned')
    expect(cellFor('Tides')).not.toHaveTextContent('Opened')
  })

  it('says when each student last turned something in and their XP this week', async () => {
    mockServer([COLBY, QUIET])
    render(<StudentProgressTab classId="c1" className="Earth Science" />)
    await screen.findByRole('button', { name: 'Colby Barker' })

    expect(screen.getByText('Last work 2 days ago · +50 XP this week')).toBeInTheDocument()
    expect(screen.getByText('No work turned in yet')).toBeInTheDocument()
  })

  it('shows no engagement line for a payload from before the field existed', async () => {
    const { last_activity_at: _a, xp_last_7_days: _b, ...older } = COLBY
    mockServer([older])
    render(<StudentProgressTab classId="c1" className="Earth Science" />)
    await screen.findByRole('button', { name: 'Colby Barker' })
    expect(screen.queryByText(/Last work|No work turned in/)).not.toBeInTheDocument()
  })
})
