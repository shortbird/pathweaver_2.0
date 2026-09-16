import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TeacherClassPage from './TeacherClassPage'

/**
 * The call-for-help button, after an afternoon of it at iCreate (2026-09-15).
 *
 * - "I accidentally hit call for help when previewing as Nicole Connole. It
 *    said it went to 10 people in the front office. I actually have NO idea
 *    where that call even went!" (851764d3) -- so the button is gone while an
 *    admin is previewing a teacher, and the toast names who was called.
 * - "It'd be nice to retract a call for help if you accidentally push it!"
 *    (b25bfa75) -- so the button becomes Cancel until it is.
 */

const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/my-classes/c1']}>
        <Routes><Route path="/my-classes/:classId" element={ui} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1' }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('../../components/sis/StudentProgressTab', () => ({ default: () => <div /> }))
vi.mock('../../components/discussion/ClassCurriculum', () => ({ default: () => <div /> }))
vi.mock('../../components/sis/ClassCurriculumLibrary', () => ({ default: () => <div /> }))
vi.mock('../../components/sis/ClassQuestsManager', () => ({ default: () => <div /> }))

const { preview, masquerade } = vi.hoisted(() => ({
  preview: { teacher: null },
  masquerade: { on: false },
}))
vi.mock('./teacherPreview', () => ({
  getPreviewTeacher: () => preview.teacher,
  withPreview: (path) => path,
}))
vi.mock('../../services/masqueradeService', () => ({ isMasquerading: () => masquerade.on }))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

beforeEach(() => {
  vi.clearAllMocks()
  preview.teacher = null
  masquerade.on = false
  api.get.mockImplementation((url) => {
    if (url.includes('/roster')) {
      return Promise.resolve({ data: { class: { id: 'c1', name: 'Lego Robotics' }, students: [] } })
    }
    return Promise.resolve({ data: { roster: [] } })
  })
})

describe('Call for help', () => {
  it('names who was called, then offers to cancel, and tells the office when it does', async () => {
    api.post.mockResolvedValueOnce({ data: {
      success: true, notified: 5, call_id: 'call-1',
      names: ['Molly', 'Katrine', 'Tami', 'Nicole', 'Sara'],
    } })
    render(<TeacherClassPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Call for help' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(
      'Called Molly, Katrine, Tami and 2 others in the front office'))
    expect(api.post).toHaveBeenCalledWith('/api/sis/classes/c1/call-for-help', {})

    api.post.mockResolvedValueOnce({ data: { success: true, notified: 5 } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel call for help' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/classes/c1/call-for-help/call-1/cancel', {}))
    expect(toast.success).toHaveBeenLastCalledWith('Cancelled. The front office has been told.')
    expect(await screen.findByRole('button', { name: 'Call for help' })).toBeInTheDocument()
  })

  it('reads two names as a pair and one as itself', async () => {
    api.post.mockResolvedValueOnce({ data: { success: true, notified: 2, call_id: 'c', names: ['Molly', 'Katrine'] } })
    render(<TeacherClassPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Call for help' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Called Molly and Katrine in the front office'))
  })

  it('has no button while an admin is previewing a teacher', async () => {
    preview.teacher = { id: 't1', name: 'Nicole Connole' }
    render(<TeacherClassPage />)
    await screen.findByText('Lego Robotics')
    expect(screen.queryByRole('button', { name: 'Call for help' })).not.toBeInTheDocument()
  })

  it('has no button under a masquerade either', async () => {
    masquerade.on = true
    render(<TeacherClassPage />)
    await screen.findByText('Lego Robotics')
    expect(screen.queryByRole('button', { name: 'Call for help' })).not.toBeInTheDocument()
  })
})
