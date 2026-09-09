/**
 * Student mode on the kiosk: the two things a young student at a shared iPad
 * cannot do any other way.
 *
 * Assigning a quest to a class creates no enrollment, and these students
 * never log in, so the kiosk lists class assignments and starts one on a tap.
 * And the quest may list nothing matching what the child actually did, so
 * "I did something else" adds a task from one answer and goes to the camera.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

import KioskStudentSession from './KioskStudentSession'

const dashboard = ({ active = [], assigned = [] } = {}) => ({
  data: { active_quests: active, assigned_class_quests: assigned },
})

const enrollment = (questId, title, tasks) => ({
  id: `uq-${questId}`,
  quest_id: questId,
  quests: { id: questId, title, quest_tasks: tasks },
})

const assignment = (questId, title, className) => ({
  class_id: 'c1', class_name: className, due_date: null,
  quest: { id: questId, title, is_active: true },
})

beforeEach(() => { vi.clearAllMocks() })

describe('KioskStudentSession', () => {
  it('lists class assignments and a tap starts the quest, then shows the copied tasks', async () => {
    const teacherTasks = [{ id: 't1', title: 'Draw your habitat', xp_value: 50, is_completed: false }]
    api.get
      .mockResolvedValueOnce(dashboard({ assigned: [assignment('q1', 'Marine Biology', 'Explorers')] }))
      .mockResolvedValueOnce(dashboard({ active: [enrollment('q1', 'Marine Biology', teacherTasks)] }))
    api.post.mockResolvedValue({ data: { success: true } })

    render(<KioskStudentSession studentName="Ada" onFinished={vi.fn()} />)
    expect(await screen.findByText('Assigned to you')).toBeInTheDocument()
    expect(screen.getByText(/From Explorers/)).toBeInTheDocument()
    expect(screen.queryByText(/don't have any quests/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Marine Biology'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/quests/q1/enroll', {}))
    expect(await screen.findByText('Which task did you work on?')).toBeInTheDocument()
    expect(screen.getByText('Draw your habitat')).toBeInTheDocument()
  })

  it('an assignment already started is not listed twice', async () => {
    api.get.mockResolvedValueOnce(dashboard({
      active: [enrollment('q1', 'Marine Biology', [])],
      assigned: [assignment('q1', 'Marine Biology', 'Explorers')],
    }))
    render(<KioskStudentSession studentName="Ada" onFinished={vi.fn()} />)
    expect(await screen.findByText('Marine Biology')).toBeInTheDocument()
    expect(screen.queryByText('Assigned to you')).not.toBeInTheDocument()
  })

  it('a failed start stays on the quest screen with a retryable message', async () => {
    api.get.mockResolvedValueOnce(dashboard({ assigned: [assignment('q1', 'Marine Biology', 'Explorers')] }))
    api.post.mockRejectedValueOnce({ response: { data: { error: 'Quest not found' } } })
    render(<KioskStudentSession studentName="Ada" onFinished={vi.fn()} />)
    fireEvent.click(await screen.findByText('Marine Biology'))
    expect(await screen.findByText('Quest not found')).toBeInTheDocument()
    expect(screen.getByText('Assigned to you')).toBeInTheDocument()
  })

  it('"I did something else" adds a task from one answer and goes to the camera', async () => {
    api.get.mockResolvedValueOnce(dashboard({ active: [enrollment('q1', 'Outdoor Survival', [])] }))
    api.post.mockResolvedValueOnce({ data: { success: true, tasks: [{ id: 'new1', title: 'I built a shelter', xp_value: 50 }] } })

    render(<KioskStudentSession studentName="Ada" onFinished={vi.fn()} />)
    // A quest with no tasks is still offered: the child can add one.
    fireEvent.click(await screen.findByText('Outdoor Survival'))
    fireEvent.click(await screen.findByText('I did something else'))
    const input = await screen.findByLabelText('What did you do?')
    expect(screen.getByText('Next: take a photo')).toBeDisabled()
    fireEvent.change(input, { target: { value: '  I built a shelter ' } })
    fireEvent.click(screen.getByText('Next: take a photo'))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/quests/q1/add-manual-tasks',
      { tasks: [{ title: 'I built a shelter' }] }))
    expect(await screen.findByText('Take a photo of your work')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'I built a shelter' })).toBeInTheDocument()

    // Back from the camera: the new task is now on the list.
    fireEvent.click(screen.getByLabelText('Back'))
    expect(await screen.findByText('Which task did you work on?')).toBeInTheDocument()
    expect(screen.getByText('I built a shelter')).toBeInTheDocument()
  })

  it('a refused task (custom tasks turned off for the quest) is explained, not swallowed', async () => {
    api.get.mockResolvedValueOnce(dashboard({ active: [enrollment('q1', 'Outdoor Survival', [])] }))
    api.post.mockRejectedValueOnce({ response: { data: { error: 'This quest does not allow custom tasks' } } })
    render(<KioskStudentSession studentName="Ada" onFinished={vi.fn()} />)
    fireEvent.click(await screen.findByText('Outdoor Survival'))
    fireEvent.click(await screen.findByText('I did something else'))
    fireEvent.change(await screen.findByLabelText('What did you do?'), { target: { value: 'Made a map' } })
    fireEvent.click(screen.getByText('Next: take a photo'))
    expect(await screen.findByText('This quest does not allow custom tasks')).toBeInTheDocument()
    expect(screen.getByLabelText('What did you do?')).toHaveValue('Made a map')
  })

  it('with nothing started and nothing assigned, points at the teacher', async () => {
    api.get.mockResolvedValueOnce(dashboard())
    render(<KioskStudentSession studentName="Ada" onFinished={vi.fn()} />)
    expect(await screen.findByText("You don't have any quests yet.")).toBeInTheDocument()
    expect(screen.getByText(/assign one to your class/)).toBeInTheDocument()
  })
})
