/**
 * One search box over Checklist progress, for a person or a form or both.
 *
 * iCreate, 2026-09-14: the office could see that Lisa Price had uploaded her
 * W-4 and I-9, and had to scroll a list of every assigned checklist to reach
 * her row. The list needed a box that takes "lisa", "w-4" or "lisa w-4" and
 * narrows as they type.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AdminOnboarding } from './OnboardingPage'
import { matchAssignment } from './checklistSearch'

const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', role: 'org_managed', org_roles: ['org_admin'] } }),
}))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))


const LISA = {
  id: 'a1', user_id: 'lisa', user_name: 'Lisa Price', template_name: 'Employee onboarding',
  audience: 'staff', status: 'complete', done_count: 2, total_count: 2,
  items: [
    { key: 'w4', title: 'W-4', status: 'complete', needs_document: true,
      documents: [{ path: 'staff/lisa/w4.pdf', filename: 'lisa-w4.pdf' }] },
    { key: 'i9', title: 'I-9', status: 'complete', needs_document: true,
      documents: [{ path: 'staff/lisa/i9.pdf', filename: 'passport.pdf' }] },
  ],
}
const MOLLY = {
  id: 'a2', user_id: 'molly', user_name: 'Molly Christensen', template_name: 'Employee onboarding',
  audience: 'staff', status: 'in_progress', done_count: 0, total_count: 1,
  items: [{ key: 'bgcheck', title: 'Background check', status: 'pending', needs_document: true, documents: [] }],
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/onboarding/templates')) return Promise.resolve({ data: { templates: [] } })
    if (url.includes('/onboarding/assignments')) return Promise.resolve({ data: { assignments: [LISA, MOLLY] } })
    return Promise.resolve({ data: {} })
  })
})

const renderList = async () => {
  render(<MemoryRouter><AdminOnboarding orgId="org-1" /></MemoryRouter>)
  await screen.findByText('Lisa Price')
  return screen.getByLabelText('Search checklists by name or document')
}

describe('matchAssignment', () => {
  it('matches a person, a form, or both; punctuation in a form name is optional', () => {
    expect(matchAssignment(LISA, 'lisa')).toEqual({ items: [] })
    expect(matchAssignment(LISA, 'w4')).toEqual({ items: ['w4'] })
    expect(matchAssignment(LISA, 'I-9')).toEqual({ items: ['i9'] })
    expect(matchAssignment(LISA, 'lisa w-4')).toEqual({ items: ['w4'] })
    expect(matchAssignment(LISA, 'passport')).toEqual({ items: ['i9'] })
    expect(matchAssignment(MOLLY, 'w4')).toBeNull()
    expect(matchAssignment(MOLLY, 'molly w4')).toBeNull()
    expect(matchAssignment(MOLLY, '   ')).toEqual({ items: [] })
  })
})

describe('Checklist progress search', () => {
  it('narrows the list as the office types a name', async () => {
    const box = await renderList()
    fireEvent.change(box, { target: { value: 'lis' } })
    expect(screen.getByText('Lisa Price')).toBeInTheDocument()
    expect(screen.queryByText('Molly Christensen')).not.toBeInTheDocument()

    fireEvent.change(box, { target: { value: '' } })
    expect(screen.getByText('Molly Christensen')).toBeInTheDocument()
  })

  it('finds people by the form they were asked for and opens the card on it', async () => {
    const box = await renderList()
    fireEvent.change(box, { target: { value: 'w-4' } })
    expect(screen.queryByText('Molly Christensen')).not.toBeInTheDocument()
    const card = screen.getByText('Lisa Price').closest('details')
    expect(card.open).toBe(true)
    expect(screen.getByText('lisa-w4.pdf')).toBeInTheDocument()
  })

  it('says so when nothing matches', async () => {
    const box = await renderList()
    fireEvent.change(box, { target: { value: 'zzz' } })
    await waitFor(() => expect(screen.getByText('No checklists match "zzz".')).toBeInTheDocument())
    expect(screen.queryByText('Lisa Price')).not.toBeInTheDocument()
  })
})
