import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ClassQuestsManager from './ClassQuestsManager'
import { withConfirm } from '../../tests/confirmTestUtils'

/**
 * Ticket 9f1afd73: "Adding curriculum pushes active quests down the page, so
 * we've stopped adding it there. Keeping active quests at the top, or letting
 * us collapse the curriculum section, would fix that."
 *
 * What holds: the assigned quests come before the curriculum section; the
 * section's "Curriculum (N)" header folds and unfolds it and the choice is
 * remembered per class on this browser; a class with 3 or more curricula
 * starts folded, fewer starts open.
 */

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))
const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('../../hooks/api/useQuestEditor', () => ({
  useRefreshAfterQuestEdit: () => () => {},
  questEditorApi: {},
}))
vi.mock('./questEditor/QuestDraftsList', () => ({ default: () => null }))
vi.mock('./QuestEditor', () => ({ default: () => null }))

const KEY = 'sis_class_curriculum_open'
const curriculum = (id, title) => ({
  curriculum_id: id, title, missing_count: 0, quests: [{ quest_id: `${id}-q`, title: `${title} quest` }],
})
const ASSIGNED = [{
  quest_id: 'free', title: 'Free reading', template_task_count: 1, editable_tasks: true,
  due_date: null, xp_threshold: 0, can_edit: false, student_ids: null, curriculum_id: null,
  curriculum_title: null, replaces_quest_id: null,
}]

const mount = (curricula, classId = 'c1') => {
  api.get.mockImplementation((url) => {
    if (url.includes('curriculum-quests')) return Promise.resolve({ data: { curricula } })
    if (url.endsWith('/quests')) return Promise.resolve({ data: { quests: ASSIGNED, students: [] } })
    return Promise.resolve({ data: { quests: [] } })
  })
  return render(withConfirm(<ClassQuestsManager classId={classId} orgId="org-1" />))
}

const TWO = [curriculum('a', 'Applied Physics'), curriculum('b', 'U.S. History 1')]
const THREE = [...TWO, curriculum('c', 'Algebra')]

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('the curriculum section (9f1afd73)', () => {
  it('puts the assigned quests before the curriculum section', async () => {
    mount(TWO)
    const header = await screen.findByRole('button', { name: 'Curriculum (2)' })
    const questRow = await screen.findByText('Free reading')
    // DOCUMENT_POSITION_FOLLOWING: the header comes after the quest row.
    expect(questRow.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('Applied Physics', { selector: 'p' })).toBeInTheDocument()
  })

  it('folds and unfolds, and remembers the choice for this class', async () => {
    const { unmount } = mount(TWO)
    const header = await screen.findByRole('button', { name: 'Curriculum (2)' })
    expect(header).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Applied Physics', { selector: 'p' })).toBeNull()
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual({ c1: false })

    // Remounted, the class stays folded; another class keeps its default.
    unmount()
    const again = mount(TWO)
    expect(await screen.findByRole('button', { name: 'Curriculum (2)' }))
      .toHaveAttribute('aria-expanded', 'false')
    again.unmount()
    mount(TWO, 'c2')
    expect(await screen.findByRole('button', { name: 'Curriculum (2)' }))
      .toHaveAttribute('aria-expanded', 'true')
  })

  it('starts folded at 3 or more curricula, and opens on a click', async () => {
    mount(THREE)
    const header = await screen.findByRole('button', { name: 'Curriculum (3)' })
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Algebra', { selector: 'p' })).toBeNull()

    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Algebra', { selector: 'p' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual({ c1: true })
  })

  it('shows no section when no curriculum is attached', async () => {
    mount([])
    await screen.findByText('Free reading')
    expect(screen.queryByRole('button', { name: /^Curriculum \(/ })).toBeNull()
  })
})
