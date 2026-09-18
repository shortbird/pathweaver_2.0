import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Training that is a link, not a quest.
 *
 * iCreate, 2026-09-15: "I still dont' have a way to add resources to the
 * teacher training. I need to get some trainings up asap!" A recorded
 * training or a slide deck has no tasks to invent, so the Training page's add
 * panel grew a third door: paste a link, file it under a category, aim it at
 * roles or people. Teachers open it and press done; the report shows who has.
 *
 * Since M18 (2026-09-17) a link is a row of the one training list and one
 * column of the one report: GET /api/sis/training carries both kinds with
 * `kind`, POST /api/sis/training with kind='link' files one, and
 * /training/<id>/done marks it.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({
    orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false,
    activeOrg: { id: 'org-1', branding_config: {} },
  }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-admin', role: 'org_admin' } }),
}))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => async () => true }))
vi.mock('./sisRole', () => ({ isSisAdmin: () => true }))
vi.mock('../../utils/appSurface', () => ({ switchSurfaceInApp: vi.fn() }))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import TrainingPanel from './libraryPage/TrainingPanel'

// The page's link writes go through hooks/api, so it needs a QueryClient. A fresh client per render keeps one test's cache out of the
// next one's, and retry:false makes a failed query fail rather than hang.
const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const QUEST = {
  kind: 'quest', id: 'tr-1', quest_id: 'q-1', title: 'Orientation quest', category: 'Onboarding',
  is_required: true, auto_assign: false, sequence_order: 0, audience: 'staff',
  my_progress: { started: false, completed: false, done: 0, total: 0 }, quest_is_ours: true,
}
const LINK = {
  kind: 'link', id: 'l-1', title: 'Whole Brain Teaching', url: 'https://loom.com/x',
  description: 'Part one', category: 'Onboarding', is_required: true, sequence_order: 1,
  visible_to_roles: null, visible_to_user_ids: null, my_done: null,
}

const mockGets = ({ training = [QUEST, LINK] } = {}) => {
  api.get.mockImplementation((url) => {
    if (url.includes('/training/progress')) {
      // One report: a quest cell is progress, a link cell is done or not,
      // and a link never aimed at the person does not apply to them.
      return Promise.resolve({ data: { training, required_total: 2, staff: [
        { user_id: 'u-1', name: 'A Teacher', required_completed: 1, cells: [
          { kind: 'quest', id: 'tr-1', quest_id: 'q-1', applies: true, started: false, completed: false, done: 0, total: 0 },
          { kind: 'link', id: 'l-1', applies: true, completed: true, done_at: 'now' }] },
        { user_id: 'u-2', name: 'Katrine', required_completed: 1, cells: [
          { kind: 'quest', id: 'tr-1', quest_id: 'q-1', applies: true, started: true, completed: true, done: 2, total: 2 },
          { kind: 'link', id: 'l-1', applies: false, completed: false, done_at: null }] },
      ] } })
    }
    if (url.includes('/assignable-quests')) return Promise.resolve({ data: { quests: [] } })
    if (url.includes('/api/sis/staff')) {
      return Promise.resolve({ data: { staff: [{ id: 'u-2', name: 'Katrine' }] } })
    }
    return Promise.resolve({ data: { training } })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGets()
  api.post.mockResolvedValue({ data: { success: true, training: LINK } })
  api.delete.mockResolvedValue({ data: { success: true } })
})

describe('adding a link', () => {
  it('is a third door in the add panel, and posts the link with its targeting', async () => {
    render(<TrainingPanel />)
    fireEvent.click(await screen.findByRole('button', { name: /add training/i }))
    fireEvent.click(screen.getByRole('tab', { name: /link to a video or document/i }))

    fireEvent.change(screen.getByLabelText('Training title'), { target: { value: 'Whole Brain Teaching' } })
    fireEvent.change(screen.getByLabelText('Training link'), { target: { value: 'https://loom.com/x' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Teaching' } })
    fireEvent.click(screen.getByLabelText(/required for everyone/i))
    fireEvent.click(screen.getByLabelText('Teachers'))
    fireEvent.click(screen.getByRole('button', { name: /^add link$/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/training',
      expect.objectContaining({
        kind: 'link', organization_id: 'org-1', title: 'Whole Brain Teaching', url: 'https://loom.com/x',
        category: 'Teaching', is_required: true, visible_to_roles: ['advisor'],
      })))
  })

  it('is offered for teachers only -- families and students still get quests', async () => {
    render(<TrainingPanel />)
    fireEvent.click(await screen.findByRole('button', { name: /for families/i }))
    fireEvent.click(await screen.findByRole('button', { name: /add a family quest/i }))
    expect(screen.queryByRole('tab', { name: /link to a video or document/i })).toBeNull()
  })
})

describe('the list', () => {
  it('files links under the same category headings as the quests', async () => {
    render(<TrainingPanel />)
    await screen.findByText('Whole Brain Teaching')
    expect(screen.getByText('Orientation quest')).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 2, name: /onboarding/i })).toHaveLength(1)
    expect(screen.getByRole('link', { name: /open/i }).getAttribute('href')).toBe('https://loom.com/x')
  })

  it('counts a required link in the required banner', async () => {
    render(<TrainingPanel />)
    await screen.findByText('Whole Brain Teaching')
    expect(screen.getByText('0 of 2 required items complete.')).toBeTruthy()
  })

  it('marks it done for the caller, and can take it back', async () => {
    render(<TrainingPanel />)
    fireEvent.click(await screen.findByRole('button', { name: /mark as done/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/training/l-1/done?organization_id=org-1', {}))

    mockGets({ training: [QUEST, { ...LINK, my_done: { done_at: 'now' } }] })
    render(<TrainingPanel />)
    fireEvent.click(await screen.findByRole('button', { name: /mark as not done/i }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(
      '/api/sis/training/l-1/done?organization_id=org-1'))
  })
})

describe('who has done what', () => {
  it('adds a column per link, and a dash where the link was not aimed at the person', async () => {
    render(<TrainingPanel />)
    await screen.findByText('Whole Brain Teaching')
    fireEvent.click(screen.getByRole('button', { name: /who has done what/i }))
    const table = await screen.findByRole('table')
    expect(table.textContent).toContain('Whole Brain Teaching')
    const rows = table.querySelectorAll('tbody tr')
    expect(rows[0].textContent).toContain('Done')
    expect(rows[1].textContent).toContain('—')
    // Required done: quests + links, one total.
    expect(rows[0].textContent).toContain('1/2')
    expect(rows[1].textContent).toContain('1/2')
  })
})

describe('editing a link', () => {
  it('opens the same form on the link door, filled in, and patches it as a link', async () => {
    render(<TrainingPanel />)
    const row = (await screen.findByText('Whole Brain Teaching')).closest('.p-4')
    fireEvent.click(within(row).getByRole('button', { name: /^edit$/i }))
    expect(screen.getByLabelText('Training link').value).toBe('https://loom.com/x')
    fireEvent.change(screen.getByLabelText('Training title'), { target: { value: 'Whole Brain Teaching, part 1' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/training/l-1?organization_id=org-1',
      expect.objectContaining({ kind: 'link', title: 'Whole Brain Teaching, part 1' })))
  })

  it('removes a link as a link', async () => {
    render(<TrainingPanel />)
    await screen.findByText('Whole Brain Teaching')
    fireEvent.click(screen.getByRole('button', { name: /remove whole brain teaching/i }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(
      '/api/sis/training/l-1?organization_id=org-1&kind=link'))
  })
})
