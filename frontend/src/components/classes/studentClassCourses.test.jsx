/**
 * The courses a student sees on their class.
 *
 * The SIS curriculum library is the container for a class's teaching material:
 * quests, which are copied onto the class, and courses, which are a live link
 * through the curriculum. Until 2026-09-02 the courses half had no student
 * surface at all — sis_curriculum_courses was read only by the staff curriculum
 * screens, so a course an admin attached was reachable by everyone except the
 * students it was attached for.
 *
 * The section hides itself when there is nothing in it: most classes carry no
 * courses, and an empty "Class Courses" heading on every one of them is worse
 * than no heading.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const { classService, api, state } = vi.hoisted(() => {
  const state = {
    classes: [{
      id: 'c1',
      name: 'Reading Workshop',
      organization_id: 'org-1',
      progress: { earned_xp: 0, xp_threshold: 100, percentage: 0, is_complete: false },
    }],
    courses: [],
  }
  return {
    state,
    classService: {
      getMyStudentClasses: vi.fn(() => Promise.resolve({ success: true, classes: state.classes })),
      getClassQuests: vi.fn(() => Promise.resolve({ success: true, quests: [] })),
      getClassAdvisors: vi.fn(() => Promise.resolve({ success: true, advisors: [] })),
      getClassCourses: vi.fn(() => Promise.resolve({ success: true, courses: state.courses })),
    },
    api: { get: vi.fn(() => Promise.resolve({ data: { quests: [] } })) },
  }
})
vi.mock('../../services/classService', () => ({ default: classService }))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', organization_id: 'org-1' } }),
}))
import StudentClassesView from './StudentClassesView'

// The student's real route table: /org-classes owns both the list and the
// detail, and /courses/:courseId is where a course link has to land.
const openTheClass = async () => {
  rtlRender(
    <MemoryRouter initialEntries={['/org-classes']}>
      <Routes>
        <Route path="/org-classes" element={<StudentClassesView />} />
        <Route path="/org-classes/:classId" element={<StudentClassesView />} />
        <Route path="/courses/:courseId" element={<div>COURSE PAGE</div>} />
        <Route path="*" element={<div>CATCH-ALL</div>} />
      </Routes>
    </MemoryRouter>
  )
  fireEvent.click(await screen.findByText('Reading Workshop'))
  await screen.findByRole('heading', { name: 'Reading Workshop' })
}

describe('the courses a class inherits from its curriculum', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.courses = []
  })

  it('shows a course the curriculum carries, and links to it', async () => {
    state.courses = [{ id: 'course-1', title: 'Poetry Unit', description: 'Read and write verse' }]
    await openTheClass()

    expect(await screen.findByText('Poetry Unit')).toBeInTheDocument()
    expect(screen.getByText('Read and write verse')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Poetry Unit'))
    expect(await screen.findByText('COURSE PAGE')).toBeInTheDocument()
  })

  it('asks for the courses of the class being viewed', async () => {
    await openTheClass()
    await waitFor(() => expect(classService.getClassCourses)
      .toHaveBeenCalledWith('org-1', 'c1'))
  })

  it('grows no empty heading on a class with no courses', async () => {
    await openTheClass()
    await screen.findByText('Class Quests')
    expect(screen.queryByText('Class Courses')).not.toBeInTheDocument()
  })

  it('still renders the class when the course read fails', async () => {
    // One endpoint being down must not blank the page: the quests, the progress
    // and the teachers are all independent of this call.
    classService.getClassCourses.mockRejectedValueOnce(new Error('boom'))
    await openTheClass()
    expect(await screen.findByText('Class Quests')).toBeInTheDocument()
    expect(screen.queryByText('Class Courses')).not.toBeInTheDocument()
  })
})
