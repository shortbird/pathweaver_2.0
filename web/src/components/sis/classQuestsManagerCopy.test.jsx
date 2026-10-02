import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ClassQuestsManager from './ClassQuestsManager'
import { withConfirm, confirmText, answerConfirm } from '../../tests/confirmTestUtils'

/**
 * A teacher's own copy of a quest on their class.
 *
 * iCreate, 2026-10-01. Marika (167ba6df): "Teachers can't attach videos or
 * links any more. And can't edit the quests. ... we talked about allowing them
 * to edit it and save it as their own Teacher created ones?" Karin (60ffe195):
 * "How can I copy a current quest, so I can repeat the assignment for the next
 * week/weeks?"
 *
 * Since P6 a teacher edits only the quests they wrote, and there was no way
 * to make one of somebody else's theirs. "Make my own copy" copies it (POST
 * .../quests/:id/duplicate) and opens the copy in the editor.
 *
 * Changed 2026-10-02 (owner): the copy starts as a DRAFT for the class, and no
 * student gets it until the teacher publishes it. These pinned the copy going
 * "on this class for the same students right away"; they now pin the draft.
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
vi.mock('./questEditor/QuestDraftsList', () => ({ default: () => null }))
const { editorProps } = vi.hoisted(() => ({ editorProps: [] }))
vi.mock('./QuestEditor', () => ({
  default: (props) => {
    editorProps.push(props)
    return (
      <div>
        quest editor open on {props.questId}
        {props.onMakeCopy && (
          <button type="button" onClick={props.onMakeCopy} aria-label="Editor: make my own copy">
            Make my own copy
          </button>
        )}
      </div>
    )
  },
}))


const quest = (extra = {}) => ({
  quest_id: 'q1', title: 'Vocab Week 1', description: 'Ten words.', template_task_count: 1,
  editable_tasks: true, allow_custom_tasks: true, due_date: null, xp_threshold: 0,
  can_edit: false, ...extra,
})

let onClass
beforeEach(() => {
  vi.clearAllMocks()
  editorProps.length = 0
  onClass = [quest()]
  api.get.mockImplementation((url) => {
    if (url.includes('curriculum-quests')) return Promise.resolve({ data: { curricula: [] } })
    if (url.endsWith('/quests')) return Promise.resolve({ data: { quests: onClass, students: [] } })
    return Promise.resolve({ data: { quests: [] } })
  })
  api.post.mockImplementation((url) => {
    if (url.endsWith('/duplicate')) {
      // A draft: the copy is not added to the class's quests.
      return Promise.resolve({ data: { success: true, quest_id: 'q-copy', title: 'Vocab Week 1 (copy)', is_draft: true } })
    }
    return Promise.resolve({ data: {} })
  })
})

// Changed 2026-10-02 (row redesign, owner: "actions up, settings in panel"):
// Open quest and the copy button sit on the collapsed row now. This used to
// click the chevron first; it only waits for the row.
const openRow = async () => {
  await screen.findByText('Vocab Week 1')
}

describe('Make my own copy', () => {
  it('sits next to Open quest on a quest the teacher cannot change', async () => {
    render(withConfirm(<ClassQuestsManager classId="c1" orgId="org-1" />))
    await openRow()
    expect(screen.getByRole('button', { name: 'Open quest' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make my own copy' })).toBeInTheDocument()
  })

  it('copies as a draft after a confirm, then opens the copy in the editor', async () => {
    render(withConfirm(<ClassQuestsManager classId="c1" orgId="org-1" />))
    await openRow()
    fireEvent.click(screen.getByRole('button', { name: 'Make my own copy' }))
    // Changed 2026-10-02: this said the copy "goes on this class for the same
    // students right away". It is a draft now.
    expect(await confirmText()).toMatch(/It starts as a draft: students get it only when you publish it/)
    await answerConfirm()
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/classes/c1/quests/q1/duplicate', {}))
    expect(await screen.findByText('quest editor open on q-copy')).toBeInTheDocument()
    const props = editorProps.at(-1)
    expect(props.questId).toBe('q-copy')
    // A draft is not on the class yet: no class link, so the editor treats it
    // as a class draft and offers Publish to class.
    expect(props.classLink).toBeNull()
    expect(props.context).toBe('class')
    // The copy is the teacher's, so the editor is not offered a copy button.
    expect(props.onMakeCopy).toBeNull()
    // The class's quest list was not re-read for it: the copy is not on it.
    expect(api.get.mock.calls.filter(([url]) => url.endsWith('/quests'))).toHaveLength(1)
  })

  it('cancelling the confirm copies nothing', async () => {
    render(withConfirm(<ClassQuestsManager classId="c1" orgId="org-1" />))
    await openRow()
    fireEvent.click(screen.getByRole('button', { name: 'Make my own copy' }))
    await answerConfirm(false)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.post).not.toHaveBeenCalled()
  })

  it('is offered from the read-only editor too', async () => {
    render(withConfirm(<ClassQuestsManager classId="c1" orgId="org-1" />))
    await openRow()
    fireEvent.click(screen.getByRole('button', { name: 'Open quest' }))
    expect(await screen.findByText('quest editor open on q1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Editor: make my own copy' }))
    await answerConfirm()
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/classes/c1/quests/q1/duplicate', {}))
    expect(await screen.findByText('quest editor open on q-copy')).toBeInTheDocument()
  })

  it('a quest the teacher wrote offers "Make a copy" to repeat it (60ffe195)', async () => {
    onClass = [quest({ can_edit: true })]
    render(withConfirm(<ClassQuestsManager classId="c1" orgId="org-1" />))
    await openRow()
    expect(screen.getByRole('button', { name: 'Make a copy' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit quest' }))
    expect(await screen.findByText('quest editor open on q1')).toBeInTheDocument()
    expect(editorProps.at(-1).onMakeCopy).toBeNull()
  })

  it('a student\'s own quest offers no copy', async () => {
    onClass = [quest({ made_by: 's1', made_by_name: 'Ava Lee' })]
    render(withConfirm(<ClassQuestsManager classId="c1" orgId="org-1" />))
    await openRow()
    expect(screen.queryByRole('button', { name: /copy/i })).toBeNull()
  })
})
