import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { groupClassQuestsByCurriculum } from './classQuestCurriculumGroups'

import StudentClassesView from './StudentClassesView'

/**
 * Ticket 8700c16d (iCreate org admin who is also a parent, on her son's
 * Independent study class): "he sees all the quests I assigned in independent
 * study class, but they aren't organized by class (or in any way for that
 * matter.)" The class page now puts each quest under its curriculum heading;
 * a quest on no curriculum stays directly under the class. And in family
 * scope every read on the page is the child's.
 */

let scopeState = { selectedChildId: null, selectedChild: null }
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'mom', organization_id: 'org-1' } }),
}))
vi.mock('../../contexts/FamilyScopeContext', () => ({ useFamilyScope: () => scopeState }))
vi.mock('./StudentAgenda', () => ({ default: () => null }))

const { classService, api } = vi.hoisted(() => ({
  classService: {
    getMyStudentClasses: vi.fn(),
    getClassQuests: vi.fn(),
    getClassAdvisors: vi.fn(() => Promise.resolve({ success: true, advisors: [] })),
    getClassCourses: vi.fn(() => Promise.resolve({ success: true, courses: [] })),
  },
  api: { get: vi.fn(() => Promise.resolve({ data: {} })) },
}))
vi.mock('../../services/classService', () => ({ default: classService }))
vi.mock('../../services/api', () => ({ default: api }))
// The handouts read waits on the module answer (organization for a student,
// the guardian context in family scope); neither can say "off" here.
vi.mock('../../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ organization: null, loading: false }),
}))
vi.mock('../../hooks/api/useSchoolContext', () => ({
  useSisParentContext: () => ({ orgs: [], loading: false }),
}))

const row = (id, title, curriculum = null, rank = null) => ({
  quest_id: id, quests: { id, title },
  curriculum_id: curriculum ? `cur-${curriculum}` : null,
  curriculum_title: curriculum, curriculum_rank: rank,
})

beforeEach(() => {
  vi.clearAllMocks()
  scopeState = { selectedChildId: null, selectedChild: null }
  classService.getMyStudentClasses.mockResolvedValue({
    success: true,
    classes: [{ id: 'indep', name: 'Independent study', organization_id: 'org-1', progress: {} }],
  })
  classService.getClassQuests.mockResolvedValue({
    success: true,
    quests: [
      row('q1', 'Forces lab', 'Applied Physics', 1),
      row('q2', 'Reading log'),
      row('q3', 'Colonies essay', 'U.S. History 1', 0),
      row('q4', 'Motion quiz', 'Applied Physics', 1),
    ],
  })
})

const renderDetail = () => render(
  <MemoryRouter initialEntries={['/org-classes/indep']}>
    <Routes>
      <Route path="/org-classes/:classId" element={<StudentClassesView />} />
    </Routes>
  </MemoryRouter>,
)

describe('groupClassQuestsByCurriculum', () => {
  it('keeps no-curriculum quests loose and orders sections by attach rank', () => {
    const out = groupClassQuestsByCurriculum([
      row('q1', 'A', 'Physics', 1), row('q2', 'B'), row('q3', 'C', 'History', 0),
    ])
    expect(out.loose.map((r) => r.quest_id)).toEqual(['q2'])
    expect(out.sections.map((s) => s.title)).toEqual(['History', 'Physics'])
  })

  it('a class with no curricula is all loose, as before', () => {
    const out = groupClassQuestsByCurriculum([row('q1', 'A'), row('q2', 'B')])
    expect(out.sections).toEqual([])
    expect(out.loose).toHaveLength(2)
  })
})

describe('StudentClassesView class page (ticket 8700c16d)', () => {
  it('lists the class quests under their curriculum headings', async () => {
    renderDetail()
    const physics = await screen.findByRole('region', { name: 'Applied Physics' })
    expect(within(physics).getByText('Forces lab')).toBeInTheDocument()
    expect(within(physics).getByText('Motion quiz')).toBeInTheDocument()
    const history = screen.getByRole('region', { name: 'U.S. History 1' })
    expect(within(history).getByText('Colonies essay')).toBeInTheDocument()
    // Attached first, so drawn first.
    expect(history.compareDocumentPosition(physics)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    // The class's own quest sits under the class, outside every heading.
    expect(within(physics).queryByText('Reading log')).not.toBeInTheDocument()
    expect(screen.getByText('Reading log')).toBeInTheDocument()
  })

  it("reads every part of the class as the scoped child", async () => {
    scopeState = { selectedChildId: 'brady', selectedChild: { id: 'brady', firstName: 'Brady' } }
    renderDetail()
    await screen.findByText('Forces lab')
    expect(classService.getMyStudentClasses).toHaveBeenCalledWith({ studentId: 'brady' })
    await waitFor(() => {
      expect(classService.getClassQuests).toHaveBeenCalledWith('org-1', 'indep', { studentId: 'brady' })
      expect(classService.getClassCourses).toHaveBeenCalledWith('org-1', 'indep', { studentId: 'brady' })
      expect(classService.getClassAdvisors).toHaveBeenCalledWith('org-1', 'indep', { studentId: 'brady' })
    })
    expect(api.get).toHaveBeenCalledWith('/api/users/completed-quests?per_page=100',
      { params: { student_id: 'brady' } })
  })
})
