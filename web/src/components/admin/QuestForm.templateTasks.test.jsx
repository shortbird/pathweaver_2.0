import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * Saving an edited quest's tasks, whichever way the caller named the endpoint.
 *
 * Gryffin Learning Center, 2026-09-02: a teacher editing a quest from
 * Organization -> Classes hit "Failed to save quest" over and over
 * (TypeError: P is not a function). ClassQuestsTab passed
 * templateTasksEndpoint as a URL string; QuestForm called it as a builder.
 *
 * The damage was in the ordering: the quest PUT had already succeeded, so the
 * throw lost only the tasks while the toast blamed the whole save. Both prop
 * shapes have to reach the same URL, and the tasks PUT has to actually fire.
 */

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('../../contexts/ConfirmContext', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import QuestForm from './QuestForm'

const QUEST = { id: 'q1', title: 'Bridge Building', description: 'Build a bridge.' }

const TASKS = [
  { id: 't1', title: 'Sketch three designs', description: '', pillar: 'stem', xp_value: 50 },
]

const TEMPLATE_URL = '/api/admin/quests/q1/template-tasks'

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { tasks: TASKS } })
  api.put.mockResolvedValue({ data: { success: true } })
})

const renderForm = (props = {}) =>
  render(
    <QuestForm
      mode="edit"
      quest={QUEST}
      organizationId="org-1"
      onClose={vi.fn()}
      onSuccess={vi.fn()}
      {...props}
    />
  )

const save = async () => {
  const button = await screen.findByRole('button', { name: /update quest/i })
  fireEvent.click(button)
}

const templateTasksPut = () =>
  api.put.mock.calls.find(([url]) => url === TEMPLATE_URL)

describe('QuestForm templateTasksEndpoint', () => {
  it('saves tasks when the endpoint is passed as a URL string', async () => {
    renderForm({ templateTasksEndpoint: TEMPLATE_URL })
    await screen.findByDisplayValue('Bridge Building')

    await save()

    await waitFor(() => expect(templateTasksPut()).toBeTruthy())
    const [, payload] = templateTasksPut()
    expect(payload.tasks).toHaveLength(1)
    expect(payload.tasks[0].title).toBe('Sketch three designs')
  })

  it('saves tasks when the endpoint is passed as a builder function', async () => {
    const builder = vi.fn((id) => `/api/admin/quests/${id}/template-tasks`)
    renderForm({ templateTasksEndpoint: builder })
    await screen.findByDisplayValue('Bridge Building')

    await save()

    await waitFor(() => expect(templateTasksPut()).toBeTruthy())
    expect(builder).toHaveBeenCalledWith('q1')
  })

  it('falls back to the admin route when no endpoint is passed', async () => {
    renderForm()
    await screen.findByDisplayValue('Bridge Building')

    await save()

    await waitFor(() => expect(templateTasksPut()).toBeTruthy())
  })
})
