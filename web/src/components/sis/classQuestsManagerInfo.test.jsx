import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * A teacher opens a quest from the class page in the one quest editor.
 *
 * iCreate, 93af5014, 2026-09-22: "Teachers can't seem to edit the quests. Once
 * they can edit, they should be able to select whether or not students can add
 * tasks. I don't think we want the 'Save this class's quests to the curriculum.'"
 *
 * Since P6 (owner decision 2026-09-23) editing is QuestEditor, and a teacher
 * edits only the quests they wrote: the row says Edit quest when the server
 * says can_edit, and Open quest (read-only, class settings still theirs)
 * otherwise. "Create new" starts a draft on the class.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('../../hooks/api/useQuestEditor', () => ({
  useRefreshAfterQuestEdit: () => () => {},
  useQuestDrafts: () => ({ data: [] }),
  useDiscardQuestDraft: () => ({ mutateAsync: vi.fn() }),
  questEditorApi: {},
}))
vi.mock('./questEditor/QuestDraftsList', () => ({
  default: ({ onResume }) => (
    <button type="button" onClick={() => onResume({ id: 'draft-1' })}>Resume draft-1</button>
  ),
}))
const { editorProps } = vi.hoisted(() => ({ editorProps: [] }))
vi.mock('./QuestEditor', () => ({
  default: (props) => { editorProps.push(props); return <div>quest editor open</div> },
}))

import ClassQuestsManager from './ClassQuestsManager'
import { withConfirm } from '../../tests/confirmTestUtils'

const quest = (extra = {}) => ({
  quest_id: 'q1', title: 'Week 4 THINK', description: 'Math.', template_task_count: 1,
  editable_tasks: true, allow_custom_tasks: true, due_date: null, xp_threshold: 0, ...extra,
})

const mock = (quests) => api.get.mockImplementation((url) => {
  if (url.includes('curriculum-quests')) {
    return Promise.resolve({ data: { curricula: [
      { curriculum_id: 'cur1', title: 'ALD Elem', quests: [{ quest_id: 'q1' }], missing_count: 0 },
    ] } })
  }
  if (url.includes('/quests') && !url.includes('assignable')) return Promise.resolve({ data: { quests } })
  return Promise.resolve({ data: { quests: [] } })
})

beforeEach(() => {
  vi.clearAllMocks()
  api.patch.mockResolvedValue({ data: { success: true, quest: {
    id: 'q1', title: 'Week 4 THINK (Math)', description: 'Math.', allow_custom_tasks: false,
  } } })
})

describe('ClassQuestsManager quest details', () => {
  it('opens the quest editor on a quest the teacher may change, with this class\'s settings', async () => {
    editorProps.length = 0
    mock([quest({ can_edit: true, due_date: '2026-10-01T23:59:59Z' })])
    render(withConfirm(<ClassQuestsManager classId="c1" orgId="org-1" scheduledEnabled />))
    fireEvent.click(await screen.findByLabelText('Toggle tasks'))
    fireEvent.click(screen.getByRole('button', { name: 'Edit quest' }))
    expect(await screen.findByText('quest editor open')).toBeInTheDocument()
    const props = editorProps.at(-1)
    expect(props.context).toBe('class')
    expect(props.questId).toBe('q1')
    expect(props.classId).toBe('c1')
    expect(props.classLink.due_date).toBe('2026-10-01T23:59:59Z')
    expect(props.scheduledEnabled).toBe(true)
  })

  it('opens somebody else\'s quest read-only, as Open quest', async () => {
    mock([quest({ can_edit: false })])
    render(withConfirm(<ClassQuestsManager classId="c1" />))
    fireEvent.click(await screen.findByLabelText('Toggle tasks'))
    expect(screen.queryByRole('button', { name: 'Edit quest' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Open quest' })).toBeInTheDocument()
    // Deleting is the furthest an edit goes: not theirs either.
    expect(screen.queryByRole('button', { name: /Delete Week 4 THINK/ })).toBeNull()
  })

  it('Create new starts a draft on the class in the quest editor', async () => {
    editorProps.length = 0
    mock([])
    render(withConfirm(<ClassQuestsManager classId="c1" orgId="org-1" />))
    fireEvent.click(await screen.findByRole('button', { name: /Create new/ }))
    expect(await screen.findByText('quest editor open')).toBeInTheDocument()
    const props = editorProps.at(-1)
    expect(props.context).toBe('class')
    expect(props.questId).toBeNull()
    expect(props.classId).toBe('c1')
  })

  it('a draft on the class is resumed in the same editor', async () => {
    editorProps.length = 0
    mock([])
    render(withConfirm(<ClassQuestsManager classId="c1" />))
    fireEvent.click(await screen.findByRole('button', { name: 'Resume draft-1' }))
    expect(await screen.findByText('quest editor open')).toBeInTheDocument()
    expect(editorProps.at(-1).questId).toBe('draft-1')
  })

  it('does not offer a teacher the save-to-curriculum button', async () => {
    mock([quest()])
    render(withConfirm(<ClassQuestsManager classId="c1" />))
    expect(await screen.findByText('ALD Elem')).toBeInTheDocument()
    expect(screen.queryByText(/Save this class.s quests to the curriculum/)).toBeNull()
  })

  it('still offers it to the office', async () => {
    mock([quest()])
    render(withConfirm(<ClassQuestsManager classId="c1" canSaveToCurriculum />))
    expect(await screen.findByText(/Save this class.s quests to the curriculum/)).toBeInTheDocument()
  })
})
