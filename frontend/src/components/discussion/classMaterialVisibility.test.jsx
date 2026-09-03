/**
 * Hiding and showing a class material.
 *
 * iCreate/Horizon, 2026-09-02: "teachers/admin need to be able to hide/show
 * materials as well." Adding still hands it straight to students -- that has
 * always been what class materials are -- so the switch starts on and exists to
 * let a teacher hold one back while they get it ready.
 *
 * A material inherited from the school's curriculum gets no switch here: it is
 * the library's, and flipping it on this class would have to mean flipping it
 * for every class teaching that curriculum.
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

import ClassCurriculum from './ClassCurriculum'

const SLIDES = {
  id: 'm1', kind: 'file', title: 'Week 1 slides.pdf',
  url: 'https://x/s.pdf', visible_to_students: true, can_delete: true,
}
const DRAFT = {
  id: 'm2', kind: 'link', title: 'Week 2 (not ready)',
  url: 'https://x/2', visible_to_students: false, can_delete: true,
}
const INHERITED = {
  id: 'm3', kind: 'link', title: 'Intro to Human Anatomy',
  url: 'https://youtu.be/x', source: 'curriculum', curriculum_title: 'Science',
  can_delete: false,
}

const mount = async (materials, canManage = true) => {
  api.get.mockResolvedValue({ data: { success: true, can_manage: canManage, materials } })
  render(<ClassCurriculum classId="c1" />)
  if (materials.length) await screen.findByText(materials[0].title)
}

describe('hiding and showing class materials', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows a teacher which materials students can see', async () => {
    await mount([SLIDES, DRAFT])
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes[0]).toBeChecked()
    expect(boxes[1]).not.toBeChecked()
  })

  it('hides one with a single click, no save step', async () => {
    await mount([SLIDES])
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/classes/c1/materials/m1', { visible_to_students: false }))
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('puts the switch back when the change fails', async () => {
    await mount([SLIDES])
    api.patch.mockRejectedValueOnce(new Error('nope'))
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked())
  })

  it('gives a student no switch at all', async () => {
    // The backend never sends them a hidden row either — this is the second lock.
    await mount([SLIDES], false)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('offers no switch for a resource the curriculum owns, and says where it came from', async () => {
    await mount([INHERITED])
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByText('From Science')).toBeInTheDocument()
  })
})
