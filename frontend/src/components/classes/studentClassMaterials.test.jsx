/**
 * A student finding a handout from their class page.
 *
 * Until 2026-09-02 class materials were reachable only from inside a quest page
 * (QuestDetail mounts ClassCurriculum with a questId). A document a teacher
 * shared with the class was therefore invisible from the class itself — the one
 * place a student would look — and invisible entirely to a student with no
 * quest open. This section is that missing surface, and it carries both the
 * class's own materials and whatever its curriculum shares.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const { classService, api, state } = vi.hoisted(() => {
  const state = {
    classes: [{
      id: 'c1', name: 'Science', organization_id: 'org-1',
      progress: { earned_xp: 0, xp_threshold: 100, percentage: 0, is_complete: false },
    }],
    materials: [],
  }
  return {
    state,
    classService: {
      getMyStudentClasses: vi.fn(() => Promise.resolve({ success: true, classes: state.classes })),
      getClassQuests: vi.fn(() => Promise.resolve({ success: true, quests: [] })),
      getClassAdvisors: vi.fn(() => Promise.resolve({ success: true, advisors: [] })),
      getClassCourses: vi.fn(() => Promise.resolve({ success: true, courses: [] })),
    },
    api: {
      get: vi.fn((url) => {
        if (url.includes('/materials')) {
          return Promise.resolve({ data: { success: true, materials: state.materials } })
        }
        return Promise.resolve({ data: { quests: [] } })
      }),
    },
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

const openTheClass = async () => {
  rtlRender(
    <MemoryRouter initialEntries={['/org-classes']}>
      <Routes>
        <Route path="/org-classes" element={<StudentClassesView />} />
        <Route path="/org-classes/:classId" element={<StudentClassesView />} />
      </Routes>
    </MemoryRouter>
  )
  fireEvent.click(await screen.findByText('Science'))
  await screen.findByRole('heading', { name: 'Science' })
}

describe('class materials on the student class page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.materials = []
  })

  it('shows a document shared with the class, linked straight to it', async () => {
    state.materials = [{
      id: 'm1', kind: 'file', title: 'Anatomy Flash Cards.pdf',
      url: 'https://files.example/flashcards.pdf',
    }]
    await openTheClass()

    const link = await screen.findByRole('link', { name: /Anatomy Flash Cards\.pdf/ })
    expect(link).toHaveAttribute('href', 'https://files.example/flashcards.pdf')
    // Opening a handout must not navigate away from the class.
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('names the curriculum an inherited resource came from', async () => {
    state.materials = [{
      id: 'm2', kind: 'link', title: 'Intro to Human Anatomy',
      url: 'https://youtu.be/x', source: 'curriculum', curriculum_title: 'Science',
    }]
    await openTheClass()
    expect(await screen.findByText('Intro to Human Anatomy')).toBeInTheDocument()
  })

  it('asks the class materials endpoint for the class being viewed', async () => {
    await openTheClass()
    await waitFor(() => expect(api.get)
      .toHaveBeenCalledWith('/api/sis/classes/c1/materials'))
  })

  it('grows no empty heading on a class with no materials', async () => {
    await openTheClass()
    await screen.findByText('Class Quests')
    expect(screen.queryByText('Class Materials')).not.toBeInTheDocument()
  })

  it('still renders the class when the materials read fails', async () => {
    api.get.mockImplementation((url) => (url.includes('/materials')
      ? Promise.reject(new Error('boom'))
      : Promise.resolve({ data: { quests: [] } })))
    await openTheClass()
    expect(await screen.findByText('Class Quests')).toBeInTheDocument()
    expect(screen.queryByText('Class Materials')).not.toBeInTheDocument()
  })
})
