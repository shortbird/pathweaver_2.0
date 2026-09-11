import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

/**
 * Who a class quest is for, and when students first see it.
 *
 * Gryffin, 2026-09-10 (Katie Bird), two emails an hour apart:
 *   "Is there a way to go into a specific student's assignments and remove
 *    them for a specific student? ... is there a way to only assign certain
 *    homework assignments to specific kids in each class?"
 *   "Is it possible to put all of the assignments in and then schedule a
 *    release date in addition to a due date?"
 *
 * The release date has to be captured AT assign time, because assigning
 * enrolls the class on the spot. That is the one thing this file most needs to
 * keep true.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import ClassQuestsManager from './ClassQuestsManager'
import { withConfirm } from '../../tests/confirmTestUtils'

const STUDENTS = [
  { student_id: 's1', name: 'Ada Lovelace' },
  { student_id: 's2', name: 'Ben Okri' },
]
const quest = (extra = {}) => ({
  quest_id: 'q1', title: 'Rock Cycle', template_task_count: 1, editable_tasks: true,
  due_date: null, publish_at: null, student_ids: null, ...extra,
})

const mockServer = ({ quests, assignable = [] }) => api.get.mockImplementation((url) => {
  if (url.includes('assignable')) return Promise.resolve({ data: { quests: assignable } })
  if (url.includes('curriculum-quests')) return Promise.resolve({ data: { curricula: [] } })
  return Promise.resolve({ data: { quests, students: STUDENTS } })
})

const localDay = (iso) => {
  const d = new Date(iso)
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()]
}

beforeEach(() => {
  vi.clearAllMocks()
  api.post.mockResolvedValue({ data: { success: true } })
  api.patch.mockResolvedValue({ data: { success: true } })
})

describe('who a class quest is for', () => {
  it('reads as everyone until the teacher narrows it', async () => {
    mockServer({ quests: [quest()] })
    render(withConfirm(<ClassQuestsManager classId="c1" />))
    expect(await screen.findByRole('button', { name: /Everyone \(2\)/ })).toBeInTheDocument()
  })

  it('unchecking a student saves the rest as the list', async () => {
    mockServer({ quests: [quest()] })
    api.put.mockResolvedValue({ data: { success: true, student_ids: ['s1'], summary: 'Removed for 1 student.' } })
    render(withConfirm(<ClassQuestsManager classId="c1" />))

    fireEvent.click(await screen.findByRole('button', { name: /Everyone \(2\)/ }))
    const picker = screen.getByRole('group', { name: 'Who gets Rock Cycle' })
    fireEvent.click(within(picker).getByLabelText('Ben Okri'))
    fireEvent.click(within(picker).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/classes/c1/quests/q1/students', { student_ids: ['s1'] }))
    // The chip now says so, from the server's answer.
    expect(await screen.findByRole('button', { name: /1 of 2 students/ })).toBeInTheDocument()
  })

  it('checking everyone back sends null, so newcomers keep picking it up', async () => {
    mockServer({ quests: [quest({ student_ids: ['s1'] })] })
    api.put.mockResolvedValue({ data: { success: true, student_ids: null, summary: 'Added for 1 student.' } })
    render(withConfirm(<ClassQuestsManager classId="c1" />))

    fireEvent.click(await screen.findByRole('button', { name: /1 of 2 students/ }))
    const picker = screen.getByRole('group', { name: 'Who gets Rock Cycle' })
    expect(within(picker).getByLabelText('Ada Lovelace')).toBeChecked()
    expect(within(picker).getByLabelText('Ben Okri')).not.toBeChecked()
    fireEvent.click(within(picker).getByRole('button', { name: 'Everyone' }))
    fireEvent.click(within(picker).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/classes/c1/quests/q1/students', { student_ids: null }))
  })

  it('will not save a quest for nobody', async () => {
    mockServer({ quests: [quest()] })
    render(withConfirm(<ClassQuestsManager classId="c1" />))
    fireEvent.click(await screen.findByRole('button', { name: /Everyone \(2\)/ }))
    const picker = screen.getByRole('group', { name: 'Who gets Rock Cycle' })
    fireEvent.click(within(picker).getByRole('button', { name: 'Nobody' }))
    expect(within(picker).getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})

describe('release dates', () => {
  it('are captured at assign time and sent with the assignment', async () => {
    mockServer({ quests: [], assignable: [
      { quest_id: 'q9', title: 'Volcanoes', source: 'organization', template_task_count: 0, scope: 'mine' },
    ] })
    render(withConfirm(<ClassQuestsManager classId="c1" scheduledEnabled />))

    fireEvent.click(await screen.findByRole('button', { name: /Assign a quest/ }))
    fireEvent.change(screen.getByLabelText('Release date for the quest you assign'),
      { target: { value: '2026-09-21' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Assign' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/api/sis/classes/c1/quests')
    expect(body.quest_id).toBe('q9')
    // The morning of the day typed, in the teacher's own timezone.
    expect(localDay(body.publish_at)).toEqual([2026, 9, 21])
    expect(new Date(body.publish_at).getHours()).toBe(0)
  })

  it('leave the assignment alone when no date was typed', async () => {
    mockServer({ quests: [], assignable: [
      { quest_id: 'q9', title: 'Volcanoes', source: 'organization', template_task_count: 0, scope: 'mine' },
    ] })
    render(withConfirm(<ClassQuestsManager classId="c1" scheduledEnabled />))
    fireEvent.click(await screen.findByRole('button', { name: /Assign a quest/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Assign' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/classes/c1/quests', { quest_id: 'q9' }))
  })

  it('can be set on a quest already on the class', async () => {
    mockServer({ quests: [quest()] })
    render(withConfirm(<ClassQuestsManager classId="c1" scheduledEnabled />))

    fireEvent.click(await screen.findByRole('button', { name: /Set release date/ }))
    fireEvent.change(screen.getByLabelText('Release date for Rock Cycle'), { target: { value: '2026-10-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
    const [url, body] = api.patch.mock.calls[0]
    expect(url).toBe('/api/sis/classes/c1/quests/q1')
    expect(localDay(body.publish_at)).toEqual([2026, 10, 1])
    expect(await screen.findByText(/^Releases /)).toBeInTheDocument()
  })

  it('a scheduled quest says so, and "Release now" clears the date', async () => {
    const future = new Date(Date.now() + 7 * 86400000).toISOString()
    mockServer({ quests: [quest({ publish_at: future })] })
    render(withConfirm(<ClassQuestsManager classId="c1" scheduledEnabled />))

    expect(await screen.findByText(/^Releases /)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Change release date/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Release now' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/classes/c1/quests/q1', { publish_at: null }))
  })

  it('stay out of the way for a school without the feature', async () => {
    mockServer({ quests: [quest()] })
    render(withConfirm(<ClassQuestsManager classId="c1" />))
    await screen.findByText('Rock Cycle')
    expect(screen.queryByRole('button', { name: /release date/i })).not.toBeInTheDocument()
  })
})
