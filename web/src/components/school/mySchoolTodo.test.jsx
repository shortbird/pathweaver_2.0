import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * A student's To do, on /school (iCreate meeting 2026-09-23): the office
 * assigns tasks to students now -- "bring your field trip form back signed",
 * "M/W/F: clean the art table" -- and a student has no SIS console and no
 * family To do, so this card is where theirs lands. The notification links to
 * /school?task=<id>, so the card that id names is the one brought forward.
 */

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import MySchoolTodo from './MySchoolTodo'

const render = (route = '/school') => rtlRender(
  <MemoryRouter initialEntries={[route]}><MySchoolTodo /></MemoryRouter>,
)

const TASK = {
  id: 't1', title: 'Clean the art table', status: 'todo', done_count: 0, total_count: 2,
  items: [
    { key: 'wipe', title: 'Wipe the table', required: true, status: 'pending' },
    { key: 'brushes', title: 'Wash the brushes', required: true, status: 'pending' },
  ],
}
const OTHER = {
  id: 't2', title: 'Field trip form', status: 'todo', done_count: 0, total_count: 1,
  items: [{ key: 'form', title: 'Field trip form', required: true, status: 'pending' }],
}

const answer = (tasks) => api.get.mockResolvedValue({
  data: { success: true, tasks, counts: { open: tasks.length } },
})

beforeEach(() => {
  vi.clearAllMocks()
  api.patch.mockResolvedValue({ data: { success: true } })
})

describe("a student's To do", () => {
  it('reads the self-scoped student list and renders each task', async () => {
    answer([TASK])
    render()
    expect(await screen.findByText('Clean the art table')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/sis/tasks/mine?audience=student')
    expect(screen.getByRole('heading', { name: 'To do' })).toBeInTheDocument()
    expect(screen.getByText('Wipe the table')).toBeInTheDocument()
    expect(screen.getByText('Wash the brushes')).toBeInTheDocument()
  })

  it('renders nothing when the list is empty (anybody who is not a student)', async () => {
    answer([])
    const { container } = render()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the tasks module is off (404)', async () => {
    api.get.mockRejectedValue({ response: { status: 404 } })
    const { container } = render()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('ticks a step through the task’s own route, then re-reads the list', async () => {
    answer([TASK])
    render()
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Done: Wipe the table' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/tasks/t1/items/wipe', { status: 'complete' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
  })

  it('highlights the task a notification opened (?task=)', async () => {
    answer([TASK, OTHER])
    render('/school?task=t2')
    await screen.findByText('Clean the art table')
    expect(document.getElementById('task-t2').className).toMatch(/ring-2/)
    expect(document.getElementById('task-t1').className).not.toMatch(/ring-2/)
  })
})
