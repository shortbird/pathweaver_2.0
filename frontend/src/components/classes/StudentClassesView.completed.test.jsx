import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
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
      name: 'Algebra',
      organization_id: 'org-1',
      progress: { earned_xp: 50, xp_threshold: 100, percentage: 50, is_complete: false },
    }],
    classQuests: [
      { quest_id: 'q1', quests: { id: 'q1', title: 'Quest One' } },
      { quest_id: 'q2', quests: { id: 'q2', title: 'Quest Two' } },
      { quest_id: 'q3', quests: { id: 'q3', title: 'Quest Three' } },
    ],
    completedQuests: [{ id: 'q2', title: 'Quest Two' }],
  }
  return {
    state,
    classService: {
      getMyStudentClasses: vi.fn(() => Promise.resolve({ success: true, classes: state.classes })),
      getClassQuests: vi.fn(() => Promise.resolve({ success: true, quests: state.classQuests })),
      getClassAdvisors: vi.fn(() => Promise.resolve({ success: true, advisors: [] })),
    },
    api: {
      get: vi.fn((url) => {
        if (url.includes('/api/users/completed-quests')) {
          return Promise.resolve({ data: { quests: state.completedQuests } })
        }
        return Promise.resolve({ data: {} })
      }),
    },
  }
})
vi.mock('../../services/classService', () => ({ default: classService }))
vi.mock('../../services/api', () => ({ default: api }))

import StudentClassesView from './StudentClassesView'

const renderDetail = () => rtlRender(
  <MemoryRouter initialEntries={['/classes/c1']}>
    <Routes>
      <Route path="/classes/:classId" element={<StudentClassesView />} />
      <Route path="/quests/:questId" element={<div>QUEST PAGE</div>} />
    </Routes>
  </MemoryRouter>
)

beforeEach(() => {
  state.completedQuests = [{ id: 'q2', title: 'Quest Two' }]
  vi.clearAllMocks()
  // Restore the default implementation (a test overrides it with a rejection)
  api.get.mockImplementation((url) => {
    if (url.includes('/api/users/completed-quests')) {
      return Promise.resolve({ data: { quests: state.completedQuests } })
    }
    return Promise.resolve({ data: {} })
  })
  sessionStorage.clear()
})

describe('StudentClassesView — completed quest archive', () => {
  it('renders active quests normally and folds completed ones into a collapsed section', async () => {
    renderDetail()

    expect(await screen.findByText('Quest One')).toBeInTheDocument()
    expect(screen.getByText('Quest Three')).toBeInTheDocument()

    // Completed quest is hidden behind the collapsed accordion
    expect(screen.queryByText('Quest Two')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Completed \(1\)/ })).toBeInTheDocument()
  })

  it('expands on click, shows the completed quest, and stays fully clickable', async () => {
    renderDetail()

    const toggle = await screen.findByRole('button', { name: /Completed \(1\)/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const completedQuest = await screen.findByText('Quest Two')
    expect(completedQuest).toBeInTheDocument()

    // Still navigates to the quest page like any other quest row
    fireEvent.click(completedQuest)
    expect(await screen.findByText('QUEST PAGE')).toBeInTheDocument()
    expect(sessionStorage.getItem('classReturnPath')).toBe('/classes/c1')
  })

  it('collapses again on a second click', async () => {
    renderDetail()

    const toggle = await screen.findByRole('button', { name: /Completed \(1\)/ })
    fireEvent.click(toggle)
    expect(await screen.findByText('Quest Two')).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.queryByText('Quest Two')).not.toBeInTheDocument()
  })

  it('shows no Completed section when nothing is completed (fetch fails)', async () => {
    api.get.mockImplementation(() => Promise.reject(new Error('nope')))
    renderDetail()

    expect(await screen.findByText('Quest One')).toBeInTheDocument()
    expect(screen.getByText('Quest Two')).toBeInTheDocument() // renders as a normal quest
    expect(screen.queryByText(/Completed \(/)).not.toBeInTheDocument()
  })

  it('shows an all-caught-up note when every quest is completed', async () => {
    state.completedQuests = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }]
    renderDetail()

    expect(await screen.findByRole('button', { name: /Completed \(3\)/ })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/All caught up/)).toBeInTheDocument()
    })
  })
})
