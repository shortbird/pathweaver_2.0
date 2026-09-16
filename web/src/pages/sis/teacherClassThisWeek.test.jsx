import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TeacherClassPage from './TeacherClassPage'

/**
 * The This Week tab on the SIS class page.
 *
 * Arete's admin ran Friday check-ins from the learning app's class page, whose
 * This Week tab lists what every student finished that week from any quest.
 * On 2026-09-10 the school gained sis_enabled, which front-doors its staff
 * into this console, where the class page had no such tab (2026-09-15: "there
 * was an update and now I don't see where I can locate the xp they earned
 * that week"). The same component is mounted here, handed the org and class
 * this page already knows, and a ?tab=activity link lands on it.
 */

const render = (ui, entry = '/my-classes/c1') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes><Route path="/my-classes/:classId" element={ui} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', activeOrg: { id: 'org-1', feature_flags: {} } }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('../../components/sis/StudentProgressTab', () => ({ default: () => <div>progress-tab</div> }))
vi.mock('../../components/discussion/ClassCurriculum', () => ({ default: () => <div /> }))
vi.mock('../../components/sis/ClassCurriculumLibrary', () => ({ default: () => <div /> }))
vi.mock('../../components/sis/ClassQuestsManager', () => ({ default: () => <div /> }))
vi.mock('../../components/sis/ClassMessagesTab', () => ({ default: () => <div /> }))

const { activityProps } = vi.hoisted(() => ({ activityProps: vi.fn() }))
vi.mock('../../components/classes/ClassActivityTab', () => ({
  default: (props) => { activityProps(props); return <div>activity-tab</div> },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })) },
}))
vi.mock('../../services/api', () => ({ default: api }))

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/roster')) {
      return Promise.resolve({ data: { class: { id: 'c1', name: 'Explorers' }, students: [] } })
    }
    return Promise.resolve({ data: { roster: [] } })
  })
})

describe('the This Week tab on the SIS class page', () => {
  it('sits beside Student Progress and mounts the shared activity view for this org and class', async () => {
    render(<TeacherClassPage />)
    await screen.findByText('Explorers')
    expect(screen.queryByText('activity-tab')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'This Week' }))
    expect(await screen.findByText('activity-tab')).toBeInTheDocument()
    expect(activityProps).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-1', classId: 'c1', className: 'Explorers' }),
    )
  })

  it('opens straight from a ?tab=activity link', async () => {
    render(<TeacherClassPage />, '/my-classes/c1?tab=activity')
    expect(await screen.findByText('activity-tab')).toBeInTheDocument()
    expect(screen.queryByText('progress-tab')).not.toBeInTheDocument()
  })
})
