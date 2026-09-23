/**
 * Required or optional, changed in the task editor.
 *
 * iCreate, ea9756e3, 2026-09-23: "In editing, I can't edit if something is
 * required or optional". The add row had a Required checkbox; the edit form
 * had none, never copied is_required into its draft and never sent it, so a
 * task stayed whatever it was made as. Every task-edit route (library,
 * curriculum, class) already accepts is_required; the gap was here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PresetTaskManager from './PresetTaskManager'

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./QuestResourcesPanel', () => ({ default: () => null }))


const BASE = '/api/sis/quests/q1/tasks'
const task = (isRequired) => ({
  id: 't1', title: 'Sketch your design', description: '', pillar: 'art',
  xp_value: 75, is_required: isRequired, order_index: 0,
  diploma_subjects: ['fine_arts'], subject_xp_distribution: { fine_arts: 75 },
})

const openEditor = async (isRequired) => {
  api.get.mockResolvedValue({ data: { success: true, editable: true, tasks: [task(isRequired)] } })
  api.patch.mockImplementation(async (_url, body) => ({ data: { task: { ...task(isRequired), ...body } } }))
  render(<PresetTaskManager base={BASE} orgId="org-1" />)
  fireEvent.click(await screen.findByLabelText('Edit Sketch your design'))
  // Two Required boxes are on screen: the add row's and the editor's. The
  // editor's is the first, since the task list sits above the add row.
  return screen.getAllByRole('checkbox', { name: 'Required' })[0]
}

describe('changing Required on an existing task (ea9756e3)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens on the saved value', async () => {
    const box = await openEditor(true)
    expect(box).toBeChecked()
  })

  it('makes a required task optional', async () => {
    const box = await openEditor(true)
    fireEvent.click(box)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      `${BASE}/t1?organization_id=org-1`, expect.objectContaining({ is_required: false })))
  })

  it('makes an optional task required', async () => {
    const box = await openEditor(false)
    expect(box).not.toBeChecked()
    fireEvent.click(box)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      `${BASE}/t1?organization_id=org-1`, expect.objectContaining({ is_required: true })))
  })

  it('leaves Required as it was when only the title changes', async () => {
    await openEditor(true)
    fireEvent.change(screen.getByDisplayValue('Sketch your design'), { target: { value: 'Sketch it' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      `${BASE}/t1?organization_id=org-1`,
      expect.objectContaining({ title: 'Sketch it', is_required: true })))
  })
})
