/**
 * Setting a quest for teachers, or for families.
 *
 * iCreate, 2026-08-06: "admin need to be able to create quests for all their
 * teachers and families. they're doing teacher training through quests and back
 * to school night with families will be a quest."
 *
 * One catalog, two audiences. The specs that matter are the ones about not
 * changing what teachers already had: an admin lands on the teacher side, and a
 * teacher without the admin tier never sees the switch at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

let authState = { user: { id: 'u1', role: 'org_admin' } }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: () => {}, orgs: [], isSuperadmin: false }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('../../utils/appSurface', () => ({ switchSurfaceInApp: vi.fn() }))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import StaffTrainingPage from './StaffTrainingPage'

const STAFF_QUEST = {
  id: 't1', quest_id: 'q1', title: 'Classroom management', category: 'Onboarding',
  is_required: true, audience: 'staff', my_progress: { started: false, completed: false, done: 0, total: 0 },
}
const FAMILY_QUEST = {
  id: 't2', quest_id: 'q2', title: 'Back to school night', category: 'Community',
  is_required: true, audience: 'family', my_progress: { started: false, completed: false, done: 0, total: 0 },
}

beforeEach(() => {
  vi.clearAllMocks()
  authState = { user: { id: 'u1', role: 'org_admin' } }
  api.post.mockResolvedValue({ data: { success: true } })
  api.get.mockImplementation((url) => {
    if (url.includes('/assignable-quests')) {
      return Promise.resolve({ data: { quests: [{ quest_id: 'q9', title: 'Open house', source: 'organization' }] } })
    }
    if (url.includes('/training/progress')) {
      return Promise.resolve({ data: { training: [], staff: [], required_total: 0 } })
    }
    if (url.includes('/api/sis/training')) {
      const family = url.includes('audience=family')
      return Promise.resolve({ data: { training: [family ? FAMILY_QUEST : STAFF_QUEST] } })
    }
    return Promise.resolve({ data: {} })
  })
})

describe('school quests by audience', () => {
  it('opens on the teacher side, unchanged from before', async () => {
    render(<StaffTrainingPage />)
    expect(await screen.findByText('Classroom management')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('audience=staff'))
  })

  it('switches to the family side', async () => {
    render(<StaffTrainingPage />)
    await screen.findByText('Classroom management')
    fireEvent.click(screen.getByRole('button', { name: 'For families' }))
    expect(await screen.findByText('Back to school night')).toBeInTheDocument()
  })

  it('sets a new quest for the audience being edited', async () => {
    render(<StaffTrainingPage />)
    await screen.findByText('Classroom management')
    fireEvent.click(screen.getByRole('button', { name: 'For families' }))
    fireEvent.click(await screen.findByRole('button', { name: /Add a family quest/ }))
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'q9' } })
    fireEvent.click(screen.getByRole('button', { name: /^Add training$/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/training',
      expect.objectContaining({ quest_id: 'q9', audience: 'family' }),
    ))
  })

  it('says a family quest is the parent’s own', async () => {
    render(<StaffTrainingPage />)
    await screen.findByText('Classroom management')
    fireEvent.click(screen.getByRole('button', { name: 'For families' }))
    fireEvent.click(await screen.findByRole('button', { name: /Add a family quest/ }))
    expect(await screen.findByText(/parents complete it on their own account/i)).toBeInTheDocument()
  })

  it('hides the switch from a teacher, who only has one audience', async () => {
    authState = { user: { id: 'u2', role: 'org_managed', org_roles: ['advisor'] } }
    render(<StaffTrainingPage />)
    await screen.findByText('Classroom management')
    expect(screen.queryByRole('button', { name: 'For families' })).not.toBeInTheDocument()
  })
})

describe('building a quest on the page', () => {
  it('offers a builder as well as the existing-quest picker', async () => {
    render(<StaffTrainingPage />)
    await screen.findByText('Classroom management')
    fireEvent.click(screen.getByRole('button', { name: /Add training/ }))
    expect(await screen.findByRole('button', { name: 'Build a new one' })).toBeInTheDocument()
  })

  it('builds the quest and sets it for the audience in one step', async () => {
    render(<StaffTrainingPage />)
    await screen.findByText('Classroom management')
    fireEvent.click(screen.getByRole('button', { name: 'For families' }))
    fireEvent.click(await screen.findByRole('button', { name: /Add a family quest/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Build a new one' }))

    fireEvent.change(screen.getByLabelText('Quest title'), { target: { value: 'Back to school night' } })
    fireEvent.change(screen.getByLabelText('Quest description'), { target: { value: 'Come and meet us' } })
    fireEvent.click(screen.getByRole('button', { name: 'Build and add' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/training/create',
      expect.objectContaining({ title: 'Back to school night', audience: 'family' }),
    ))
  })

  it('carries preset tasks into the new quest', async () => {
    render(<StaffTrainingPage />)
    await screen.findByText('Classroom management')
    fireEvent.click(screen.getByRole('button', { name: /Add training/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Build a new one' }))

    fireEvent.change(screen.getByLabelText('Quest title'), { target: { value: 'Classroom basics' } })
    fireEvent.change(screen.getByPlaceholderText('Task 1 — what should they do?'), { target: { value: 'Watch the intro video' } })
    fireEvent.change(screen.getByLabelText('Task 1 XP'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Build and add' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/training/create',
      expect.objectContaining({
        tasks: [expect.objectContaining({ title: 'Watch the intro video', xp_value: '50' })],
      }),
    ))
  })

  it('will not build a quest with no title', async () => {
    render(<StaffTrainingPage />)
    await screen.findByText('Classroom management')
    fireEvent.click(screen.getByRole('button', { name: /Add training/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Build a new one' }))
    expect(screen.getByRole('button', { name: 'Build and add' })).toBeDisabled()
  })
})
