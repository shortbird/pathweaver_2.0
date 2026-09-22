import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TeacherClassPage from './TeacherClassPage'

/**
 * A parent's absence report on the teacher's own roll call.
 *
 * iCreate, 831acc63, 2026-09-22: "When a parent marks their student absent on
 * their end, is that then reflected in every class for the day so the teachers
 * don't have to figure it out?" The attendance read carried planned_absence all
 * along, but this page never looked at it: no label, and untouched roll saved
 * the child present. Now the child starts excused and the report is named.
 */

const render = (ui, path = '/my-classes/c1') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/my-classes/:classId" element={ui} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))
const { org } = vi.hoisted(() => ({ org: { isAdmin: false } }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', isAdmin: org.isAdmin }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('../../components/sis/StudentProgressTab', () => ({ default: () => <div /> }))
vi.mock('../../components/discussion/ClassCurriculum', () => ({ default: () => <div /> }))
vi.mock('../../components/sis/ClassCurriculumLibrary', () => ({ default: () => <div /> }))
vi.mock('../../components/sis/ClassQuestsManager', () => ({
  default: ({ canSaveToCurriculum }) => <div>{canSaveToCurriculum ? 'office view' : 'teacher view'}</div>,
}))
vi.mock('./teacherPreview', () => ({ getPreviewTeacher: () => null, withPreview: (path) => path }))
vi.mock('../../services/masqueradeService', () => ({ isMasquerading: () => false }))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

const attendance = (roster) => api.get.mockImplementation((url) => {
  if (url.includes('/roster')) {
    return Promise.resolve({ data: { class: { id: 'c1', name: 'ALD Elem' }, students: [
      { student_id: 's1', name: 'Ada' }, { student_id: 's2', name: 'Ben' },
    ] } })
  }
  if (url.includes('/attendance')) return Promise.resolve({ data: { roster } })
  return Promise.resolve({ data: {} })
})

const savedStatuses = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Save attendance' }))
  await waitFor(() => expect(api.post).toHaveBeenCalled())
  const body = api.post.mock.calls.at(-1)[1]
  return Object.fromEntries(body.entries.map((e) => [e.student_user_id, e.status]))
}

beforeEach(() => {
  vi.clearAllMocks()
  org.isAdmin = false
  api.post.mockResolvedValue({ data: { success: true } })
  api.get.mockImplementation((url) => {
    if (url.includes('/roster')) {
      return Promise.resolve({ data: { class: { id: 'c1', name: 'ALD Elem' }, students: [
        { student_id: 's1', name: 'Ada' }, { student_id: 's2', name: 'Ben' },
      ] } })
    }
    if (url.includes('/attendance')) {
      return Promise.resolve({ data: { roster: [
        { student_user_id: 's1', status: null, planned_absence: { scope: 'day', reason: 'Dentist' } },
        { student_user_id: 's2', status: null },
      ] } })
    }
    return Promise.resolve({ data: {} })
  })
})

describe('Teacher roll call and a parent-reported absence', () => {
  it('names the report and saves the child excused without a tap', async () => {
    render(<TeacherClassPage />)
    expect(await screen.findByText('Parent reported out (all day)')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save attendance' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/classes/c1/attendance',
      expect.objectContaining({ entries: [
        { student_user_id: 's1', status: 'excused' },
        { student_user_id: 's2', status: 'present' },
      ] })))
  })

  it('keeps a status someone already recorded over the report', async () => {
    attendance([
      { student_user_id: 's1', status: 'late', planned_absence: { scope: 'day' } },
      { student_user_id: 's2', status: null },
    ])
    render(<TeacherClassPage />)
    await screen.findByText('Parent reported out (all day)')
    expect(await savedStatuses()).toEqual({ s1: 'late', s2: 'present' })
  })

  it('names a report for this class only without "all day"', async () => {
    attendance([
      { student_user_id: 's1', status: null, planned_absence: { scope: 'class' } },
      { student_user_id: 's2', status: null },
    ])
    render(<TeacherClassPage />)
    expect(await screen.findByText('Parent reported out')).toBeInTheDocument()
  })

  it('Reset puts a reported child back to excused, not present', async () => {
    render(<TeacherClassPage />)
    await screen.findByText('Parent reported out (all day)')
    // Ada's row is first; tap her Present, then Reset.
    fireEvent.click(screen.getAllByRole('button', { name: 'present' })[0])
    expect(await savedStatuses()).toEqual({ s1: 'present', s2: 'present' })
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(await savedStatuses()).toEqual({ s1: 'excused', s2: 'present' })
  })
})

describe('Save-to-curriculum reaches the Quests tab only for the office', () => {
  const openQuests = () => render(<TeacherClassPage />, '/my-classes/c1?tab=quests')

  it('is off for a teacher', async () => {
    openQuests()
    expect(await screen.findByText('teacher view')).toBeInTheDocument()
  })

  it('is on for an admin', async () => {
    org.isAdmin = true
    openQuests()
    expect(await screen.findByText('office view')).toBeInTheDocument()
  })
})
