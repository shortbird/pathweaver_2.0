/**
 * Ticket 987218e0: a teacher's copy of a class quest can replace the original
 * on the class when it is published from the quest editor.
 *
 * The copy's draft names its original (draft.copied_from). When that original
 * is still on the class, "Publish to class" offers "Replace the original on
 * this class", says exactly what happens -- "Students who already started the
 * original keep it." -- and sends replace_original only when ticked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import QuestEditor from './QuestEditor'

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))
const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))
vi.mock('../../pages/sis/useSisOrg', () => ({
  withOrg: (url, orgId) => (orgId ? `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}` : url),
}))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn(async () => true) }))
vi.mock('../../hooks/api/useSisStaff', () => ({ useSisStaff: () => ({ data: [] }) }))


const COPY = {
  id: 'q-copy', title: 'Vocab (copy)', description: '', header_image_url: '', is_active: false,
  is_draft: true, is_library: false, xp_threshold: 0, teachers_may_change_xp: true,
  allow_custom_tasks: true, editable: true, can_lock_xp: false,
  draft: { context: 'class', target_id: 'c1', class_settings: null, copied_from: 'q-orig' },
  tasks: [{ id: 't1', title: 'Words', description: '', pillar: 'communication', xp_value: 50,
    is_required: true, diploma_subjects: ['language_arts'], subject_xp_distribution: { language_arts: 50 } }],
}
let current = COPY
beforeEach(() => {
  vi.clearAllMocks()
  current = COPY
  api.get.mockImplementation(async (url) => {
    if (url.includes('/resources')) return { data: { quest: [], by_task: {} } }
    return { data: { quest: current } }
  })
  api.put.mockImplementation(async (_url, body) => ({ data: { quest: { ...current, ...body } } }))
  api.post.mockResolvedValue({ data: { success: true, students_enrolled: 2,
    summary: 'Replaced the original on this class. Removed it for 1 student. 1 student already started it and keeps it.' } })
})

const open = async (classQuests) => {
  render(<QuestEditor context="class" classId="c1" questId="q-copy" classQuests={classQuests}
    onClose={vi.fn()} onDone={vi.fn()} />)
  await screen.findByRole('dialog')
  // "Replace the original" sits behind the class's More options (MICROSCHOOL_FIRST_PLAN part 4).
  fireEvent.click(await screen.findByRole('button', { name: 'More options for this class' }))
}
const ON_CLASS = [{ quest_id: 'q-orig', title: 'Vocab Week 1' }]

describe('replace the original when the copy is published (987218e0)', () => {
  it('offers it, with the copy that says who keeps the original', async () => {
    await open(ON_CLASS)
    const box = await screen.findByRole('checkbox', { name: /Replace the original on this class/ })
    expect(box).not.toBeChecked()
    expect(screen.getByText(/“Vocab Week 1”/)).toBeInTheDocument()
    expect(screen.getByText(/Students who already started the original keep it\./)).toBeInTheDocument()
    expect(screen.getByText(/The original comes off this class only\. Other classes keep it\./)).toBeInTheDocument()
  })

  it('sends replace_original when ticked, and shows what happened', async () => {
    await open(ON_CLASS)
    fireEvent.click(await screen.findByRole('checkbox', { name: /Replace the original on this class/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Publish to class' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/classes/c1/quests/q-copy/publish', { replace_original: true }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/already started it and keeps it/)))
  })

  it('leaves the original alone when not ticked', async () => {
    await open(ON_CLASS)
    await screen.findByRole('checkbox', { name: /Replace the original on this class/ })
    fireEvent.click(screen.getByRole('button', { name: 'Publish to class' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/classes/c1/quests/q-copy/publish', {}))
  })

  it('is not offered when the original is no longer on the class', async () => {
    await open([])
    await screen.findByLabelText('Quest title')
    expect(screen.queryByRole('checkbox', { name: /Replace the original/ })).toBeNull()
  })
})
