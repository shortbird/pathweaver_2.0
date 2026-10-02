import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))
// The quest editor and its Drafts list read through react-query; these tests
// are about the class tab's own rows, so both are stood in for.
vi.mock('../../hooks/api/useQuestEditor', () => ({
  useRefreshAfterQuestEdit: () => () => {},
  useQuestDrafts: () => ({ data: [] }),
  useDiscardQuestDraft: () => ({ mutateAsync: vi.fn() }),
  questEditorApi: {},
}))
vi.mock('./questEditor/QuestDraftsList', () => ({ default: () => null }))

import ClassQuestsManager from './ClassQuestsManager'
import { withConfirm } from '../../tests/confirmTestUtils'

const quest = (extra = {}) => ({
  quest_id: 'q1', title: 'Reading Appreciation', template_task_count: 1, editable_tasks: true,
  due_date: null, ...extra,
})

const mockQuests = (quests) => api.get.mockImplementation((url) => (
  url.includes('/quests') && !url.includes('assignable')
    ? Promise.resolve({ data: { quests } })
    : Promise.resolve({ data: { quests: [] } })
))

// The calendar day a stored instant lands on in THIS process's timezone --
// which is what every badge, agenda and progress column renders.
const localDay = (iso) => {
  const d = new Date(iso)
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()]
}

beforeEach(() => {
  vi.clearAllMocks()
  api.patch.mockResolvedValue({ data: { success: true } })
})

// Since the 2026-10-02 row redesign the due date is a field in the row's
// settings panel, always drawn there, so there is no "Set/Change due date"
// button to press first: the tests open the row instead.
const openRow = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /^Reading Appreciation/, expanded: false }))
  return screen.getByRole('group', { name: 'Due date' })
}

// Gryffin, 2026-08-29, two teachers independently: "When I add a due date, it
// lets me type in the date that I want but it saves it as a different date."
// new Date('2026-09-05') is UTC midnight, which is Sep 4 in Utah.
describe('ClassQuestsManager due dates keep the day the teacher typed', () => {
  it('saves the typed day as an instant that still reads as that day locally', async () => {
    mockQuests([quest()])
    render(withConfirm(<ClassQuestsManager classId="c1" />))

    const field = await openRow()
    const input = within(field).getByLabelText('Due date for Reading Appreciation')
    fireEvent.change(input, { target: { value: '2026-09-05' } })
    fireEvent.click(within(field).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
    const [url, body] = api.patch.mock.calls[0]
    expect(url).toBe('/api/sis/classes/c1/quests/q1')
    expect(localDay(body.due_date)).toEqual([2026, 9, 5])

    // And the badge the teacher sees straight after saving says the same day.
    // By its full text: the panel's "Due date" label also starts with "Due ".
    const badge = await screen.findByText(`Due ${new Date(body.due_date).toLocaleDateString()}`)
    expect(badge.textContent).toBe(`Due ${new Date(body.due_date).toLocaleDateString()}`)
    expect(localDay(body.due_date)).toEqual([2026, 9, 5])
  })

  it('prefills the editor with the stored day, not the UTC day', async () => {
    // End of Sep 5 local time, the shape the save above now writes.
    const stored = new Date(2026, 8, 5, 23, 59, 59).toISOString()
    mockQuests([quest({ due_date: stored })])
    render(withConfirm(<ClassQuestsManager classId="c1" />))

    const field = await openRow()
    expect(within(field).getByLabelText('Due date for Reading Appreciation').value).toBe('2026-09-05')
  })

  it('clearing sends null', async () => {
    const stored = new Date(2026, 8, 5, 23, 59, 59).toISOString()
    mockQuests([quest({ due_date: stored })])
    render(withConfirm(<ClassQuestsManager classId="c1" />))

    const field = await openRow()
    fireEvent.click(within(field).getByRole('button', { name: 'Clear' }))

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/classes/c1/quests/q1', { due_date: null }))
  })
})
