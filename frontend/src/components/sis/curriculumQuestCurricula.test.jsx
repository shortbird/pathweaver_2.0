/**
 * "Also used by": one quest carried by more than one curriculum.
 *
 * iCreate, 2026-09-05 (3eda88ac): "I assigned the quest to Teen Maker Lab, but
 * it doesn't show as having 1 quest on the master list page. This is why I'm
 * concerned that the quest might disappear."
 *
 * The link was written; only the library behind the panel was stale. The panel
 * reloaded its own chips and told nobody else, so the row for the OTHER
 * curriculum kept its old count until the page was reloaded — which reads as
 * "the save did not take", the worst possible way for a save to look.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../pages/sis/useSisOrg', () => ({
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
const { confirmSpy } = vi.hoisted(() => ({ confirmSpy: vi.fn(async () => true) }))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => confirmSpy }))

import CurriculumResources from './CurriculumResources'

const QUEST = { id: 'q1', title: 'Mastering the Cricut Maker Machine', can_manage: true }

// One GET handler for every read the panel makes on open, keyed by path.
const routeGet = (url) => {
  if (url.includes('/resources')) return { data: { success: true, quests: [QUEST] } }
  if (url.includes('/assignable-quests')) return { data: { success: true, quests: [] } }
  if (url.includes(`/quests/${QUEST.id}/curricula`)) {
    return {
      data: {
        on: [
          { id: 'cur-academic', title: 'Academic Learning Day' },
          { id: 'cur-elementary', title: 'Elementary Microschool' },
        ],
        available: [{ id: 'cur-teen', title: 'Teen Maker Lab' }],
      },
    }
  }
  if (url.includes(`/quests/${QUEST.id}`)) {
    return { data: { success: true, quest: { ...QUEST, description: '', editable: true }, tasks: [] } }
  }
  return { data: { success: true } }
}

const mount = async (onChanged) => {
  api.get.mockImplementation(async (url) => routeGet(url))
  render(
    <CurriculumResources orgId="org1" curriculumId="cur-academic" canManage
      onChanged={onChanged} />)
  await screen.findByText(QUEST.title)
  fireEvent.click(screen.getByText(QUEST.title))
  return screen.findByLabelText('Add this quest to another curriculum')
}

// The curriculum's own quest set, which a move and a Remove both rewrite.
const questSetPut = () => api.put.mock.calls.find(
  ([url]) => url.includes('/curriculum/cur-academic/quests'))

describe('adding a quest to another curriculum', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refreshes the library so the other curriculum\'s count moves', async () => {
    const onChanged = vi.fn()
    const picker = await mount(onChanged)
    api.post.mockResolvedValue({ data: { success: true, pushed_to_classes: 0 } })

    fireEvent.change(picker, { target: { value: 'cur-teen' } })

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      expect.stringContaining(`/quests/${QUEST.id}/curricula`),
      { target_curriculum_id: 'cur-teen' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('refreshes it again when the quest is taken back off', async () => {
    const onChanged = vi.fn()
    await mount(onChanged)
    api.delete.mockResolvedValue({ data: { success: true } })

    fireEvent.click(await screen.findByTitle('Take it off Elementary Microschool'))

    await waitFor(() => expect(api.delete).toHaveBeenCalled())
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  // iCreate, 2026-09-05 (291955e0): "I created the quest but I accidentally put
  // it in the wrong curriculum. How can I move this to a different curriculum?"
  it('moves a quest: onto the target, then off this curriculum', async () => {
    await mount(vi.fn())
    api.post.mockResolvedValue({ data: { success: true, pushed_to_classes: 2 } })
    api.put.mockResolvedValue({ data: { success: true, pushed_to_classes: 0 } })

    fireEvent.change(await screen.findByLabelText('Move this quest to another curriculum'),
      { target: { value: 'cur-teen' } })

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      expect.stringContaining(`/quests/${QUEST.id}/curricula`),
      { target_curriculum_id: 'cur-teen' }))
    // ...and only then is it taken off the one being viewed.
    await waitFor(() => expect(questSetPut()).toBeTruthy())
    expect(questSetPut()[1].quest_ids).toEqual([])
  })

  it('leaves the quest where it is when the move fails', async () => {
    // The one failure a move must not have: off both curricula.
    await mount(vi.fn())
    api.post.mockRejectedValue({ response: { data: { error: 'nope' } } })

    fireEvent.change(await screen.findByLabelText('Move this quest to another curriculum'),
      { target: { value: 'cur-teen' } })

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(questSetPut()).toBeUndefined()
  })
})

/**
 * iCreate, 2026-09-05 (c1ca4929): "I'm still not sure what remove will do,
 * didn't dare try it."
 */
describe('removing a quest from the curriculum', () => {
  beforeEach(() => { vi.clearAllMocks(); confirmSpy.mockResolvedValue(true) })

  it('says what it takes the quest off before doing it', async () => {
    await mount(vi.fn())
    api.put.mockResolvedValue({ data: { success: true, pushed_to_classes: 0 } })

    fireEvent.click(screen.getByLabelText(`Remove ${QUEST.title}`))

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled())
    const opts = confirmSpy.mock.calls[0][0]
    expect(opts.title).toMatch(/off this curriculum/i)
    expect(opts.body).toMatch(/library/i)
    await waitFor(() => expect(questSetPut()).toBeTruthy())
  })

  it('does nothing at all when the dialog is dismissed', async () => {
    confirmSpy.mockResolvedValue(false)
    await mount(vi.fn())

    fireEvent.click(screen.getByLabelText(`Remove ${QUEST.title}`))

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled())
    expect(questSetPut()).toBeUndefined()
  })
})
