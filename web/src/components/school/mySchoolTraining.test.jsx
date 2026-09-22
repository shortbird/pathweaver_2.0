import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * The student's own list of training links, on /school (iCreate, Molly,
 * 2026-09-22, ae16c5da): "I would like to link to a video or document option in
 * the 'for families' (and students if it's not there too)". Open it, press done.
 */

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import MySchoolTraining from './MySchoolTraining'

const LINK = {
  id: 'l1', kind: 'link', title: 'Last Friday training', url: 'https://loom.com/x',
  description: 'The recording', is_required: true, my_done: null,
}

beforeEach(() => vi.clearAllMocks())

describe('the student training card', () => {
  it('lists the links from the self-scoped endpoint', async () => {
    api.get.mockResolvedValue({ data: { success: true, training: [LINK] } })
    render(<MySchoolTraining />)
    const link = await screen.findByRole('link', { name: 'Last Friday training' })
    expect(link).toHaveAttribute('href', 'https://loom.com/x')
    expect(api.get).toHaveBeenCalledWith('/api/sis/student/training')
    expect(screen.getByText('Required')).toBeInTheDocument()
  })

  it('renders nothing when the list is empty (anybody who is not a student)', async () => {
    api.get.mockResolvedValue({ data: { success: true, training: [] } })
    const { container } = render(<MySchoolTraining />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the training module is off (404)', async () => {
    api.get.mockRejectedValue({ response: { status: 404 } })
    const { container } = render(<MySchoolTraining />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('marks one done, with a body so CSRF lets it through', async () => {
    api.get.mockResolvedValue({ data: { success: true, training: [LINK] } })
    api.post.mockResolvedValue({ data: { success: true,
      training: { ...LINK, my_done: { done_at: 'now' } } } })
    render(<MySchoolTraining />)
    fireEvent.click(await screen.findByRole('button', { name: 'Mark done' }))
    expect(await screen.findByRole('button', { name: /Done — undo/ })).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/api/sis/student/training/l1/done', {})
  })

  it('takes a done mark back', async () => {
    api.get.mockResolvedValue({ data: { success: true,
      training: [{ ...LINK, my_done: { done_at: 'now' } }] } })
    api.delete.mockResolvedValue({ data: { success: true, training: LINK } })
    render(<MySchoolTraining />)
    fireEvent.click(await screen.findByRole('button', { name: /Done — undo/ }))
    expect(await screen.findByRole('button', { name: 'Mark done' })).toBeInTheDocument()
    expect(api.delete).toHaveBeenCalledWith('/api/sis/student/training/l1/done')
  })
})
