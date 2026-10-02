import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
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
import { withConfirm, answerConfirm, confirmText } from '../../tests/confirmTestUtils'

const OWN_QUEST = {
  quest_id: 'q1', title: 'Bridge Building', template_task_count: 2, editable_tasks: true, can_edit: true,
}
const LIBRARY_QUEST = {
  quest_id: 'q2', title: 'Optio Poetry', template_task_count: 0, editable_tasks: false,
}

const mockQuests = (quests) => api.get.mockImplementation((url) => (
  url.includes('/quests') && !url.includes('assignable')
    ? Promise.resolve({ data: { quests } })
    : Promise.resolve({ data: { quests: [] } })
))

beforeEach(() => {
  vi.clearAllMocks()
})

// Since the 2026-10-02 row redesign Unassign and Delete live in the row's ⋯
// menu, so each test opens it first. The actions and their confirms are as
// they were.
const openMenu = async (title) => {
  fireEvent.click(await screen.findByRole('button', { name: `More for ${title}` }))
}

describe('ClassQuestsManager unassign vs delete', () => {
  it('unassign takes the quest off the class but keeps it in the library', async () => {
    mockQuests([OWN_QUEST])
    api.delete.mockResolvedValue({ data: { success: true } })
    render(withConfirm(<ClassQuestsManager classId="c1" />))

    await openMenu('Bridge Building')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unassign' }))
    // The confirm must say the quest survives, or the two actions read alike.
    expect(await confirmText()).toMatch(/stays in your school's library/)
    await answerConfirm()

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/sis/classes/c1/quests/q1'))
  })

  it('delete removes it from the library, on a separate endpoint', async () => {
    mockQuests([OWN_QUEST])
    api.delete.mockResolvedValue({ data: { success: true } })
    render(withConfirm(<ClassQuestsManager classId="c1" />))

    await openMenu('Bridge Building')
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete Bridge Building/i }))
    expect(await confirmText()).toMatch(/can't be undone/i)
    await answerConfirm()

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith('/api/sis/classes/c1/quests/q1/delete'))
  })

  it('offers no delete for Optio library quests — they are shared', async () => {
    mockQuests([LIBRARY_QUEST])
    render(<ClassQuestsManager classId="c1" />)

    await openMenu('Optio Poetry')
    expect(screen.getByRole('menuitem', { name: 'Unassign' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Delete Optio Poetry/i })).not.toBeInTheDocument()
  })

  it('cancelling the confirm leaves the quest alone', async () => {
    mockQuests([OWN_QUEST])
    render(withConfirm(<ClassQuestsManager classId="c1" />))

    await openMenu('Bridge Building')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unassign' }))
    await answerConfirm(false)

    expect(api.delete).not.toHaveBeenCalled()
  })

  it('surfaces the refusal when students have already started the quest', async () => {
    const { toast } = await import('react-hot-toast')
    mockQuests([OWN_QUEST])
    api.delete.mockRejectedValue({
      response: { status: 409, data: { error: '3 students have already started this quest' } },
    })
    render(withConfirm(<ClassQuestsManager classId="c1" />))

    await openMenu('Bridge Building')
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete Bridge Building/i }))
    await answerConfirm()

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('3 students have already started this quest'))
    // Still listed — a failed delete must not look like it worked.
    expect(screen.getByText('Bridge Building')).toBeInTheDocument()
  })

  // iCreate, 2026-07-30: a teacher wanted a quest she started last year gone.
  // Delete only existed on quests attached to a class, so an abandoned draft
  // that was never assigned had no way out.
  it('deletes an unassigned quest from the assign picker', async () => {
    api.get.mockImplementation((url) => (
      url.includes('assignable')
        ? Promise.resolve({ data: { quests: [{ ...OWN_QUEST, source: 'organization' }] } })
        : Promise.resolve({ data: { quests: [] } })
    ))
    api.delete.mockResolvedValue({ data: { success: true } })
    render(withConfirm(<ClassQuestsManager classId="c1" />))

    fireEvent.click(await screen.findByRole('button', { name: 'Assign a quest' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await answerConfirm()

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith('/api/sis/classes/c1/quests/q1/delete'))
    await waitFor(() => expect(screen.queryByText('Bridge Building')).not.toBeInTheDocument())
  })

  it('offers no delete for library quests in the picker', async () => {
    api.get.mockImplementation((url) => (
      url.includes('assignable')
        ? Promise.resolve({ data: { quests: [{ ...LIBRARY_QUEST, source: 'library' }] } })
        : Promise.resolve({ data: { quests: [] } })
    ))
    render(<ClassQuestsManager classId="c1" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Assign a quest' }))
    expect(await screen.findByRole('button', { name: 'Assign' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
})

/**
 * The row layout, owner-approved 2026-10-02 ("actions up, settings in panel").
 * The owner called the old row "poor UX": the header crammed both date chips
 * and their editors, Unassign, a trash can, the audience chip and the XP box,
 * while Open quest and Make my own copy hid behind the chevron.
 */
describe('ClassQuestsManager row layout', () => {
  const STUDENTS = [
    { student_id: 's1', name: 'Ada Lovelace' },
    { student_id: 's2', name: 'Ben Okri' },
    { student_id: 's3', name: 'Cy Twombly' },
  ]
  const mockWithStudents = (quests) => api.get.mockImplementation((url) => {
    if (url.includes('curriculum-quests')) return Promise.resolve({ data: { curricula: [] } })
    if (url.includes('/quests') && !url.includes('assignable')) {
      return Promise.resolve({ data: { quests, students: STUDENTS } })
    }
    return Promise.resolve({ data: { quests: [] } })
  })

  it('shows Open quest and Make my own copy on the collapsed row', async () => {
    mockWithStudents([{ ...LIBRARY_QUEST, can_edit: false }])
    render(withConfirm(<ClassQuestsManager classId="c1" />))
    expect(await screen.findByRole('button', { name: 'Open quest' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make my own copy' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Optio Poetry/ })).toHaveAttribute('aria-expanded', 'false')
    // The settings stay in the panel until the row is opened.
    expect(screen.queryByRole('group', { name: 'Due date' })).toBeNull()
  })

  it('keeps Unassign and, only on a quest the teacher may change, Delete in the ⋯ menu', async () => {
    mockWithStudents([OWN_QUEST, { ...LIBRARY_QUEST, can_edit: false }])
    render(withConfirm(<ClassQuestsManager classId="c1" />))
    // Neither is on the row itself.
    await screen.findByText('Bridge Building')
    expect(screen.queryByRole('button', { name: 'Unassign' })).toBeNull()
    expect(screen.queryByRole('menuitem')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'More for Bridge Building' }))
    let menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Unassign' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Delete Bridge Building' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }))

    fireEvent.click(screen.getByRole('button', { name: 'More for Optio Poetry' }))
    menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Unassign' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: /Delete/ })).toBeNull()
  })

  it('opens to the four labelled settings for this class', async () => {
    mockWithStudents([{ ...OWN_QUEST, description: 'Build a bridge from straws.' }])
    render(withConfirm(<ClassQuestsManager classId="c1" scheduledEnabled />))
    const toggle = await screen.findByRole('button', { name: /^Bridge Building/ })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('This class')).toBeInTheDocument()
    const who = screen.getByRole('group', { name: 'Who gets Bridge Building' })
    expect(within(who).getByText('Who gets it')).toBeInTheDocument()
    expect(within(who).getByLabelText('Ada Lovelace')).toBeChecked()
    expect(within(screen.getByRole('group', { name: 'Release date' }))
      .getByLabelText('Release date for Bridge Building')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Due date' }))
      .getByText('Marks it overdue — doesn’t lock it.')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'XP to finish' }))
      .getByLabelText('XP to finish Bridge Building')).toBeInTheDocument()
    expect(screen.getByText('Build a bridge from straws.')).toBeInTheDocument()
    expect(screen.getByText(/Title, picture, tasks, files and links/)).toBeInTheDocument()
  })

  it('leaves out the release date field for a school without the feature', async () => {
    mockWithStudents([OWN_QUEST])
    render(withConfirm(<ClassQuestsManager classId="c1" />))
    fireEvent.click(await screen.findByRole('button', { name: /^Bridge Building/ }))
    expect(screen.getByRole('group', { name: 'Due date' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Release date' })).toBeNull()
  })

  it('sums the quest up in one meta line: tasks, audience, due pill, XP', async () => {
    const due = new Date(2026, 9, 9, 23, 59, 59).toISOString()
    mockWithStudents([{ ...OWN_QUEST, student_ids: ['s1', 's2'], due_date: due, xp_threshold: 150 }])
    render(withConfirm(<ClassQuestsManager classId="c1" />))
    expect(await screen.findByText('2 preset tasks')).toBeInTheDocument()
    expect(screen.getByText(/2 of 3 students/)).toBeInTheDocument()
    const pill = screen.getByText(`Due ${new Date(due).toLocaleDateString()}`)
    expect(pill.className).toMatch(/bg-amber-100/)
    expect(screen.getByText('150 XP to finish')).toBeInTheDocument()
    // All of it inside the row's toggle, so it reads with the title.
    expect(screen.getByRole('button', { name: /^Bridge Building/ })).toContainElement(pill)
  })

  it('names the library and the default audience', async () => {
    mockWithStudents([LIBRARY_QUEST])
    render(withConfirm(<ClassQuestsManager classId="c1" />))
    expect(await screen.findByText('Optio library')).toBeInTheDocument()
    expect(screen.getByText(/Everyone \(3\)/)).toBeInTheDocument()
  })
})
