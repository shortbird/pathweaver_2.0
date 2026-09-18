/**
 * The Quests page under Operations: every quest the school owns, where each
 * is in use, and assign-from-here.
 *
 * Molly (iCreate, 2026-09-14, f9b5f2ea): "I'd like it to be a separate tab
 * under operations. And from there, all the quests would be listed, and we
 * can assign them as needed from there."
 *
 * What these pin: the list reads the one library endpoint; a row says its
 * curricula (linking to them) and classes; Assign puts a quest on a curriculum
 * through the quest-scoped route and on a class through the class page's own
 * route, with the optional due date; and the pickers hide what the quest is
 * already on.
 *
 * Added 2026-09-18 (Molly, 5a20862f and 4579be68): a new quest opens on its
 * attachments the moment it exists, every row can open them, and the office's
 * library and teacher-made quests read as two lists with a filter.
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
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false }),
  withOrg: (path, orgId) => (orgId ? `${path}${path.includes('?') ? '&' : '?'}organization_id=${orgId}` : path),
}))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

const render = (ui) => rtlRender(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>
)

const LIBRARY = {
  quests: [
    { id: 'q1', title: 'Watercolor Basics', description: 'Paint a season.', task_count: 3,
      tasks: [{ id: 't1', title: 'Stretch the paper' }, { id: 't2', title: 'Mix a wash' }, { id: 't3', title: 'Paint a sky' }],
      made_by: { id: 'u-molly', name: 'Molly Christensen', teacher: false },
      curricula: [{ id: 'cur-art', title: 'Art' }],
      classes: [{ id: 'cl-1', name: 'Art Expeditions', due_date: '2026-10-01' }],
      updated_at: '2026-09-10T12:00:00Z' },
    { id: 'q2', title: 'Bridge Building', description: '', task_count: 0, tasks: [],
      made_by: { id: 'u-sam', name: 'Sam Teacher', teacher: true },
      curricula: [], classes: [], updated_at: '2026-09-09T12:00:00Z' },
  ],
  curricula: [{ id: 'cur-art', title: 'Art' }, { id: 'cur-stem', title: 'STEM' }],
  classes: [{ id: 'cl-1', name: 'Art Expeditions' }, { id: 'cl-2', name: 'Robotics' }],
}

const RESOURCES = { quest: [], by_task: {} }

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => Promise.resolve({
    data: url.includes('/resources') ? RESOURCES : LIBRARY,
  }))
})

const libraryLoads = () => api.get.mock.calls.filter(([url]) => !url.includes('/resources'))

describe('QuestsPanel (was QuestLibraryPage)', () => {
  it('lists the school\'s quests from the library endpoint, with where each is in use', async () => {
    render(<QuestsPanel />)
    expect(await screen.findByText('Watercolor Basics')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/sis/quests?organization_id=org-1')
    // Its curriculum is a link that opens that entry; its class is named.
    expect(screen.getByRole('link', { name: 'Art' })).toHaveAttribute('href', '/library?tab=curriculum&curriculum=cur-art')
    expect(screen.getByText('Art Expeditions')).toBeInTheDocument()
    // A quest nowhere yet says so, rather than showing blanks.
    expect(screen.getByText('Not on a curriculum')).toBeInTheDocument()
    expect(screen.getByText('No class yet')).toBeInTheDocument()
    // One of each kind here, so each library counts its own.
    expect(screen.getAllByText('1 quest')).toHaveLength(2)
  })

  it('filters by title, curriculum or class as you type, without another request', async () => {
    render(<QuestsPanel />)
    await screen.findByText('Watercolor Basics')
    fireEvent.change(screen.getByLabelText('Search quests'), { target: { value: 'robot' } })
    expect(screen.getByText('Nothing matches that search')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search quests'), { target: { value: 'expeditions' } })
    expect(screen.getByText('Watercolor Basics')).toBeInTheDocument()
    expect(screen.queryByText('Bridge Building')).toBeNull()
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('puts a quest on a curriculum through the quest-scoped route, and reloads', async () => {
    api.post.mockResolvedValue({ data: { success: true, added: true, pushed_to_classes: 2,
      curriculum: { id: 'cur-stem', title: 'STEM' } } })
    render(<QuestsPanel />)
    await screen.findByText('Bridge Building')
    fireEvent.click(screen.getAllByRole('button', { name: 'Assign' })[1])

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Assign “Bridge Building”/)).toBeInTheDocument()
    const curriculumBox = within(dialog).getByPlaceholderText('Search curriculum…')
    fireEvent.focus(curriculumBox)
    fireEvent.change(curriculumBox, { target: { value: 'STE' } })
    // SearchSelect renders its menu in a portal and commits on mouseDown.
    fireEvent.mouseDown(await screen.findByRole('button', { name: 'STEM' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/quests/q2/curricula?organization_id=org-1', { curriculum_id: 'cur-stem' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
  })

  it('assigns a quest to a class through the class page\'s own route, with the due date', async () => {
    api.post.mockResolvedValue({ data: { success: true, students_enrolled: 12 } })
    render(<QuestsPanel />)
    await screen.findByText('Bridge Building')
    fireEvent.click(screen.getAllByRole('button', { name: 'Assign' })[1])

    const dialog = await screen.findByRole('dialog')
    const classBox = within(dialog).getByPlaceholderText('Search classes…')
    fireEvent.focus(classBox)
    fireEvent.change(classBox, { target: { value: 'Rob' } })
    fireEvent.mouseDown(await screen.findByRole('button', { name: 'Robotics' }))
    fireEvent.change(within(dialog).getByLabelText('Due date'), { target: { value: '2026-11-01' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Assign' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/classes/cl-2/quests?organization_id=org-1', { quest_id: 'q2', due_date: '2026-11-01' }))
  })

  it('does not offer a curriculum or class the quest is already on', async () => {
    render(<QuestsPanel />)
    await screen.findByText('Watercolor Basics')
    fireEvent.click(screen.getAllByRole('button', { name: 'Assign' })[0])
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Already on: Art$/)).toBeInTheDocument()
    const curriculumBox = within(dialog).getByPlaceholderText('Search curriculum…')
    fireEvent.focus(curriculumBox)
    fireEvent.change(curriculumBox, { target: { value: 't' } })
    // Both titles contain a t; only STEM is offered, because the quest is on Art already.
    const menu = await screen.findByTestId('search-select-menu')
    expect(within(menu).queryByRole('button', { name: 'Art' })).toBeNull()
    expect(within(menu).getByRole('button', { name: 'STEM' })).toBeInTheDocument()
  })

  it('builds a new quest from the top of the page and lands it in the list', async () => {
    api.post.mockResolvedValue({ data: { success: true, quest_id: 'q-new', task_count: 1,
      tasks: [{ id: 't-new', title: 'Plant a seed' }] } })
    render(<QuestsPanel />)
    await screen.findByText('Watercolor Basics')
    fireEvent.click(screen.getByRole('button', { name: /Add quest/ }))

    fireEvent.change(screen.getByLabelText('Quest title'), { target: { value: 'Robot Garden' } })
    fireEvent.change(screen.getByLabelText('Quest description'), { target: { value: 'Grow something with a robot.' } })
    fireEvent.change(screen.getByPlaceholderText(/Task 1 /), { target: { value: 'Plant a seed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create quest' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/quests?organization_id=org-1',
      expect.objectContaining({
        title: 'Robot Garden', description: 'Grow something with a robot.',
        tasks: [expect.objectContaining({ title: 'Plant a seed' })],
      }),
    ))
    // No curriculum was chosen: none is sent, and the list is refetched.
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('curriculum_id')
    await waitFor(() => expect(libraryLoads()).toHaveLength(2))
    expect(screen.queryByRole('button', { name: 'Create quest' })).toBeNull()
  })

  it('opens the new quest on its attachments, quest and each task, before closing', async () => {
    api.post.mockResolvedValue({ data: { success: true, quest_id: 'q-new', task_count: 1,
      tasks: [{ id: 't-new', title: 'Plant a seed' }] } })
    render(<QuestsPanel />)
    await screen.findByText('Watercolor Basics')
    fireEvent.click(screen.getByRole('button', { name: /Add quest/ }))
    fireEvent.change(screen.getByLabelText('Quest title'), { target: { value: 'Robot Garden' } })
    fireEvent.change(screen.getByPlaceholderText(/Task 1 /), { target: { value: 'Plant a seed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create quest' }))

    expect(await screen.findByText('“Robot Garden” is in the library')).toBeInTheDocument()
    // The quest's own attachments and the task's are both loaded from the
    // resources route, which is the panel the curriculum editor uses.
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/sis/quests/q-new/resources'))
    expect(screen.getByText('Plant a seed')).toBeInTheDocument()
    // One add control for the quest, one per task.
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Add a resource/ })).toHaveLength(2))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByText('“Robot Garden” is in the library')).toBeNull()
  })

  it('opens any quest\'s attachments from its row, task by task', async () => {
    render(<QuestsPanel />)
    await screen.findByText('Watercolor Basics')
    const row = screen.getByText('Watercolor Basics').closest('tr')
    fireEvent.click(within(row).getByRole('button', { name: 'Attachments' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Attachments for “Watercolor Basics”')).toBeInTheDocument()
    expect(within(dialog).getByText('Stretch the paper')).toBeInTheDocument()
    expect(within(dialog).getByText('Paint a sky')).toBeInTheDocument()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/sis/quests/q1/resources'))
  })

  it('names who made each quest and splits the office\'s library from teacher-made', async () => {
    render(<QuestsPanel />)
    await screen.findByText('Watercolor Basics')
    expect(screen.getByRole('heading', { name: /School library/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Teacher-made/ })).toBeInTheDocument()
    expect(screen.getByText('Molly Christensen')).toBeInTheDocument()
    expect(screen.getByText('Sam Teacher')).toBeInTheDocument()
    const teacherSection = screen.getByRole('heading', { name: /Teacher-made/ }).closest('section')
    expect(within(teacherSection).getByText('Bridge Building')).toBeInTheDocument()
    expect(within(teacherSection).queryByText('Watercolor Basics')).toBeNull()

    // The filter shows one half on its own.
    fireEvent.click(screen.getByRole('button', { name: 'Teacher-made' }))
    expect(screen.queryByText('Watercolor Basics')).toBeNull()
    expect(screen.getByText('Bridge Building')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'School library' }))
    expect(screen.getByText('Watercolor Basics')).toBeInTheDocument()
    expect(screen.queryByText('Bridge Building')).toBeNull()
  })

  it('shows one plain list when no teacher has made a quest yet', async () => {
    api.get.mockResolvedValue({ data: { ...LIBRARY, quests: [LIBRARY.quests[0]] } })
    render(<QuestsPanel />)
    await screen.findByText('Watercolor Basics')
    expect(screen.queryByRole('heading', { name: /School library/ })).toBeNull()
    expect(screen.queryByRole('heading', { name: /Teacher-made/ })).toBeNull()
  })

  it('can put the new quest straight onto a curriculum', async () => {
    api.post.mockResolvedValue({ data: { success: true, quest_id: 'q-new', task_count: 0,
      curriculum: { id: 'cur-stem', title: 'STEM' }, added: true, pushed_to_classes: 1 } })
    render(<QuestsPanel />)
    await screen.findByText('Watercolor Basics')
    fireEvent.click(screen.getByRole('button', { name: /Add quest/ }))
    fireEvent.change(screen.getByLabelText('Quest title'), { target: { value: 'Robot Garden' } })
    const picker = screen.getByPlaceholderText('Search curriculum…')
    fireEvent.focus(picker)
    fireEvent.change(picker, { target: { value: 'STE' } })
    fireEvent.mouseDown(await screen.findByRole('button', { name: 'STEM' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create quest' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/quests?organization_id=org-1',
      expect.objectContaining({ title: 'Robot Garden', curriculum_id: 'cur-stem' }),
    ))
  })

  it('will not create a quest with no title', async () => {
    render(<QuestsPanel />)
    await screen.findByText('Watercolor Basics')
    fireEvent.click(screen.getByRole('button', { name: /Add quest/ }))
    expect(screen.getByRole('button', { name: 'Create quest' })).toBeDisabled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('says so when the school has no quests', async () => {
    api.get.mockResolvedValue({ data: { quests: [], curricula: [], classes: [] } })
    render(<QuestsPanel />)
    expect(await screen.findByText('No quests yet')).toBeInTheDocument()
  })
})
