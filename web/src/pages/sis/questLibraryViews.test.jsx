/**
 * Library > Quests: the views that came over from the web org console on
 * 2026-10-15 (every org is an SIS org; the console goes).
 *
 *   Optio quests   the shared library, the school's quest visibility policy,
 *                  curated grants one by one or in bulk, paging, and each
 *                  quest opening in a new tab
 *   Quest groups   only for a school with feature_flags.quest_groups_enabled
 *                  (no slug check: Treehouse needs the flag)
 *   Unpublish      take a published quest down, and Publish again from the
 *                  Unpublished list
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import QuestsPanel from './libraryPage/QuestsPanel'

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { org } = vi.hoisted(() => ({ org: { current: { id: 'org-1', feature_flags: {} } } }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: org.current }),
  withOrg: (path, orgId) => (orgId ? `${path}${path.includes('?') ? '&' : '?'}organization_id=${orgId}` : path),
}))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() } }))
const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => confirmMock }))
vi.mock('../../services/api', () => ({ default: api }))

const render = (ui, path = '/library?tab=quests') => rtlRender(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
  </QueryClientProvider>
)

const LIBRARY = {
  quests: [
    { id: 'q1', title: 'Watercolor Basics', description: '', task_count: 1, tasks: [],
      made_by: { id: 'u1', name: 'Molly', teacher: false }, curricula: [], classes: [],
      updated_at: '2026-09-10T12:00:00Z' },
  ],
  unpublished: [
    { id: 'q-old', title: 'Last Spring Garden', description: '', updated_at: '2026-05-01T12:00:00Z' },
  ],
  curricula: [],
  classes: [],
}

const optioPage = (policy, page = 1) => ({
  success: true, policy, granted_count: 1, page, per_page: 25, total: 30,
  quests: page === 1
    ? [
      { id: 'lib-a', title: 'Garden Science', description: 'Grow things.', quest_type: 'optio', granted: true,
        available: policy !== 'private_only' },
      { id: 'lib-b', title: 'Bridge Physics', description: '', quest_type: 'course', granted: false,
        available: policy === 'all_optio' },
    ]
    : [{ id: 'lib-z', title: 'Zoology Walk', description: '', quest_type: 'optio', granted: false, available: false }],
})

let policy = 'curated'
let groups = []

beforeEach(() => {
  vi.clearAllMocks()
  policy = 'curated'
  groups = [{ id: 'g1', name: 'STEM pins', quest_ids: [] }]
  org.current = { id: 'org-1', feature_flags: {} }
  confirmMock.mockResolvedValue(true)
  api.get.mockImplementation(async (url) => {
    if (url.startsWith('/api/sis/optio-quests')) {
      const page = Number(new URL(url, 'http://x').searchParams.get('page') || 1)
      return { data: optioPage(policy, page) }
    }
    if (url.startsWith('/api/sis/quests')) return { data: LIBRARY }
    if (url.startsWith('/api/sis/quest-editor/drafts')) return { data: { drafts: [] } }
    if (url === '/api/organizations/org-1/quest-groups') return { data: { groups } }
    return { data: {} }
  })
  api.put.mockResolvedValue({ data: { success: true } })
  api.post.mockResolvedValue({ data: { success: true } })
})

describe('the views of Library > Quests', () => {
  it('offers Our quests and Optio quests, and no Quest groups without the flag', async () => {
    render(<QuestsPanel />)
    const group = screen.getByRole('group', { name: 'Quests' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Our quests', 'Optio quests'])
    await screen.findByText('Watercolor Basics')
  })

  it('offers Quest groups when the school has quest_groups_enabled', () => {
    org.current = { id: 'org-1', feature_flags: { quest_groups_enabled: true } }
    render(<QuestsPanel />)
    expect(screen.getByRole('button', { name: 'Quest groups' })).toBeInTheDocument()
  })

  it('does not open Quest groups for the treehouse slug alone', async () => {
    org.current = { id: 'org-1', slug: 'treehouse', feature_flags: {} }
    render(<QuestsPanel />, '/library?tab=quests&quests=groups')
    expect(screen.queryByRole('button', { name: 'Quest groups' })).toBeNull()
    // An unknown view falls back to the school's own quests.
    await screen.findByText('Watercolor Basics')
  })
})

describe('Optio quests', () => {
  const open = async () => {
    render(<QuestsPanel />, '/library?tab=quests&quests=optio')
    await screen.findByText('Garden Science')
  }

  it('shows the policy and marks each quest available or not', async () => {
    await open()
    expect(screen.getByRole('radio', { name: 'Only the ones we choose' })).toBeChecked()
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Available')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Not available')).toBeInTheDocument()
  })

  it('opens a quest in a new tab', async () => {
    await open()
    const link = screen.getByRole('link', { name: /Garden Science/ })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('href')).toMatch(/\/quests\/lib-a$/)
  })

  it('changes the policy after a confirm', async () => {
    await open()
    fireEvent.click(screen.getByRole('radio', { name: 'None, only our own quests' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/quest-visibility?organization_id=org-1', { policy: 'private_only' }))
    expect(confirmMock).toHaveBeenCalled()
  })

  it('keeps the policy when the confirm is declined', async () => {
    confirmMock.mockResolvedValue(false)
    await open()
    fireEvent.click(screen.getByRole('radio', { name: 'Every Optio quest' }))
    await waitFor(() => expect(confirmMock).toHaveBeenCalled())
    expect(api.put).not.toHaveBeenCalled()
  })

  it('grants and revokes one quest under the curated policy', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Make available' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/optio-quests/access?organization_id=org-1', { quest_ids: ['lib-b'], available: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Make unavailable' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/optio-quests/access?organization_id=org-1', { quest_ids: ['lib-a'], available: false }))
  })

  it('grants every selected quest at once', async () => {
    await open()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select every quest on this page' }))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    const bar = screen.getByText('2 selected').parentElement
    fireEvent.click(within(bar).getByRole('button', { name: 'Make available' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/optio-quests/access?organization_id=org-1', { quest_ids: ['lib-a', 'lib-b'], available: true }))
  })

  it('offers no grant controls outside the curated policy', async () => {
    policy = 'all_optio'
    await open()
    expect(screen.queryByRole('button', { name: 'Make available' })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('pages through the library on the server', async () => {
    await open()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Zoology Walk')
    expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/\/api\/sis\/optio-quests\?page=2/))
  })

  it('filters by what is not available, on the server', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Not available' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/sis\/optio-quests\?show=unavailable&page=1/)))
  })
})

describe('Quest groups', () => {
  beforeEach(() => {
    org.current = { id: 'org-1', feature_flags: { quest_groups_enabled: true } }
  })

  it('puts the school\'s quests in a group and saves it', async () => {
    render(<QuestsPanel />, '/library?tab=quests&quests=groups')
    fireEvent.click(await screen.findByRole('button', { name: 'STEM pins (0)' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Watercolor Basics' }))
    api.put.mockResolvedValueOnce({ data: { success: true, quest_ids: ['q1'] } })
    fireEvent.click(screen.getByRole('button', { name: 'Save group' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/organizations/org-1/quest-groups/g1/quests', { quest_ids: ['q1'] }))
  })

  it('makes a new group', async () => {
    api.post.mockResolvedValueOnce({ data: { success: true, group: { id: 'g2', name: 'Ages 5-7', quest_ids: [] } } })
    render(<QuestsPanel />, '/library?tab=quests&quests=groups')
    await screen.findByRole('button', { name: 'STEM pins (0)' })
    fireEvent.change(screen.getByRole('textbox', { name: 'New group name' }), { target: { value: 'Ages 5-7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add group' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/organizations/org-1/quest-groups', { name: 'Ages 5-7' }))
  })

  it('deletes a group after a confirm', async () => {
    render(<QuestsPanel />, '/library?tab=quests&quests=groups')
    fireEvent.click(await screen.findByRole('button', { name: 'STEM pins (0)' }))
    api.delete.mockResolvedValueOnce({ data: { success: true } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete group' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/organizations/org-1/quest-groups/g1'))
  })
})

describe('Unpublish and Publish again', () => {
  it('unpublishes a quest from its row menu after a confirm', async () => {
    render(<QuestsPanel />)
    await screen.findByText('Watercolor Basics')
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Watercolor Basics' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unpublish' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/quests/q1/active?organization_id=org-1', { active: false }))
    expect(confirmMock).toHaveBeenCalled()
  })

  it('lists unpublished quests with a way back', async () => {
    render(<QuestsPanel />)
    const list = await screen.findByRole('region', { name: 'Unpublished quests' })
    expect(within(list).getByText('Last Spring Garden')).toBeInTheDocument()
    fireEvent.click(within(list).getByRole('button', { name: 'Publish again' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/quests/q-old/active?organization_id=org-1', { active: true }))
  })
})
