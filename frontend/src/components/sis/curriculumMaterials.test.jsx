/**
 * Curriculum resources: saved once, shown to students on request.
 *
 * iCreate/Horizon, 2026-09-02: "youtube links, documents, all the same. it's
 * things that are saved in curriculum that teachers have the option to have
 * appear in the student class view so they can access some kind of resource."
 *
 * The switch is the feature, so the assertions are about the switch: adding
 * turns it on (handing something over is the normal case, and the silent
 * version of this is the bug the whole area just came out of), and flipping it
 * is one click with no save step.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../pages/sis/useSisOrg', () => ({
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))

import CurriculumMaterials from './CurriculumMaterials'

const VIDEO = {
  id: 'm1', kind: 'link', title: 'Intro to Human Anatomy',
  url: 'https://youtu.be/x', visible_to_students: true, can_delete: true,
}
const KEY = {
  id: 'm2', kind: 'file', title: 'Answer key.pdf',
  url: 'https://x/k.pdf', visible_to_students: false, can_delete: true,
}

const mount = async (materials = [VIDEO, KEY]) => {
  api.get.mockResolvedValue({ data: { success: true, materials } })
  render(<CurriculumMaterials orgId="org-1" curriculumId="cur1" />)
  if (materials.length) await screen.findByText(materials[0].title)
}

describe('curriculum resources', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists links and documents together', async () => {
    await mount()
    expect(screen.getByText('Intro to Human Anatomy')).toBeInTheDocument()
    expect(screen.getByText('Answer key.pdf')).toBeInTheDocument()
  })

  it('shows which ones students can see', async () => {
    await mount()
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes[0]).toBeChecked()      // the video
    expect(boxes[1]).not.toBeChecked()  // the answer key
  })

  it('turns one on with a single click, no save step', async () => {
    await mount()
    fireEvent.click(screen.getAllByRole('checkbox')[1])
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/curriculum/cur1/materials/m2?organization_id=org-1',
      { visible_to_students: true },
    ))
    expect(screen.getAllByRole('checkbox')[1]).toBeChecked()
  })

  it('puts the switch back when the change fails', async () => {
    await mount()
    api.patch.mockRejectedValueOnce(new Error('nope'))
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    await waitFor(() => expect(screen.getAllByRole('checkbox')[0]).toBeChecked())
  })

  it('adds a link already switched on for students', async () => {
    await mount([])
    api.post.mockResolvedValue({ data: { success: true } })
    fireEvent.click(screen.getByRole('button', { name: /Add a link/i }))
    fireEvent.change(screen.getByLabelText('Resource title'),
      { target: { value: 'Cell Unit video' } })
    fireEvent.change(screen.getByLabelText('Resource link'),
      { target: { value: 'https://youtu.be/abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/curriculum/cur1/materials?organization_id=org-1',
      { title: 'Cell Unit video', url: 'https://youtu.be/abc', visible_to_students: true },
    ))
  })

  it('accepts a pasted link with no scheme', async () => {
    // Teachers paste "youtube.com/watch?v=..." constantly; the backend refuses
    // anything that isn't http(s), so bouncing them here would be a dead end.
    await mount([])
    api.post.mockResolvedValue({ data: { success: true } })
    fireEvent.click(screen.getByRole('button', { name: /Add a link/i }))
    fireEvent.change(screen.getByLabelText('Resource title'), { target: { value: 'Video' } })
    fireEvent.change(screen.getByLabelText('Resource link'),
      { target: { value: 'youtube.com/watch?v=abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(api.post.mock.calls[0][1].url)
      .toBe('https://youtube.com/watch?v=abc'))
  })

  it('removes one', async () => {
    await mount()
    api.delete.mockResolvedValue({ data: { success: true } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove Answer key.pdf' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(
      '/api/sis/curriculum/cur1/materials/m2?organization_id=org-1'))
    await waitFor(() => expect(screen.queryByText('Answer key.pdf')).not.toBeInTheDocument())
  })

  it('offers no remove control for a resource the caller does not own', async () => {
    await mount([{ ...VIDEO, can_delete: false }])
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument()
  })

  it('says so when there is nothing saved', async () => {
    await mount([])
    expect(await screen.findByText('Nothing saved yet.')).toBeInTheDocument()
  })
})
