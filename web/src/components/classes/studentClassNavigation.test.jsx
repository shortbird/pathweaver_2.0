/**
 * A student's class card must open THIS view's class detail.
 *
 * Gryffin, 2026-08-31: "When a student uses the side navigation to go to
 * classes, and clicks on reading, it doesn't go to a page of information or
 * quests specific to reading class. It goes to a general page full of
 * information on all classes and all quests."
 *
 * The detail view existed and was correct. The card navigated to
 * `/classes/:id` whenever no basePath was given — the PUBLIC marketing page's
 * URL, which has no :classId route — so the router's catch-all bounced the
 * student to their dashboard. The sidebar's "Classes" mounts this view at
 * /org-classes with no basePath, so that was every student arriving the normal
 * way; only the branded /gryffin mount (which passes basePath) worked.
 *
 * These pin the destination, not the markup: the defect was one fallback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'stu-1', organization_id: 'org-1' } }),
}))

const { classService, api, state } = vi.hoisted(() => {
  const state = {
    classes: [{
      id: 'c1',
      name: 'Reading',
      organization_id: 'org-1',
      progress: { earned_xp: 50, xp_threshold: 100, percentage: 50, is_complete: false },
    }],
  }
  return {
    state,
    classService: {
      getMyStudentClasses: vi.fn(() => Promise.resolve({ success: true, classes: state.classes })),
      getClassQuests: vi.fn(() => Promise.resolve({ success: true, quests: [] })),
      getClassAdvisors: vi.fn(() => Promise.resolve({ success: true, advisors: [] })),
      getClassCourses: vi.fn(() => Promise.resolve({ success: true, courses: [] })),
    },
    api: { get: vi.fn(() => Promise.resolve({ data: { quests: [] } })) },
  }
})
vi.mock('../../services/classService', () => ({ default: classService }))
vi.mock('../../services/api', () => ({ default: api }))

import StudentClassesView from './StudentClassesView'

/**
 * Mounts the real route table the student actually has: /org-classes owns the
 * list and the detail, /classes is the marketing page, and anything unmatched
 * lands on the catch-all — which is where the bug used to send them.
 */
const renderApp = (entry, element) => rtlRender(
  <MemoryRouter initialEntries={[entry]}>
    <Routes>
      <Route path="/org-classes" element={element} />
      <Route path="/org-classes/:classId" element={element} />
      <Route path="/gryffin" element={element} />
      <Route path="/gryffin/:classId" element={element} />
      <Route path="/classes" element={<div>MARKETING CLASSES PAGE</div>} />
      <Route path="/quests/:questId" element={<div>QUEST PAGE</div>} />
      <Route path="*" element={<div>CATCH-ALL (dashboard bounce)</div>} />
    </Routes>
  </MemoryRouter>
)

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

describe('student class navigation', () => {
  it('opens the class detail from the sidebar list instead of bouncing to the catch-all', async () => {
    renderApp('/org-classes', <StudentClassesView />)

    fireEvent.click(await screen.findByText('Reading'))

    // The class's own page: its name as a heading, its progress, its quests.
    expect(await screen.findByRole('heading', { name: 'Reading' })).toBeInTheDocument()
    expect(screen.getByText('Your Progress')).toBeInTheDocument()
    expect(screen.getByText('Class Quests')).toBeInTheDocument()
    expect(screen.queryByText('CATCH-ALL (dashboard bounce)')).not.toBeInTheDocument()
    expect(screen.queryByText('MARKETING CLASSES PAGE')).not.toBeInTheDocument()
  })

  it('keeps a branded mount on its own base path', async () => {
    renderApp('/gryffin', <StudentClassesView basePath="/gryffin" />)

    fireEvent.click(await screen.findByText('Reading'))

    expect(await screen.findByRole('heading', { name: 'Reading' })).toBeInTheDocument()
    expect(screen.queryByText('CATCH-ALL (dashboard bounce)')).not.toBeInTheDocument()
  })

  it('sends the post-quest return path back to the class, not to /classes', async () => {
    renderApp('/org-classes', <StudentClassesView />)

    fireEvent.click(await screen.findByText('Reading'))
    await screen.findByRole('heading', { name: 'Reading' })

    // openQuest stores where the quest page should return to.
    classService.getClassQuests.mockResolvedValue({
      success: true,
      quests: [{ quest_id: 'q1', quests: { id: 'q1', title: 'Quest One' } }],
    })
    renderApp('/org-classes/c1', <StudentClassesView />)
    fireEvent.click(await screen.findByText('Quest One'))

    expect(sessionStorage.getItem('classReturnPath')).toBe('/org-classes/c1')
    expect(sessionStorage.getItem('classReturnPath')).not.toBe('/classes/c1')
  })
})
