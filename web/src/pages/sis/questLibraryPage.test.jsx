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
 *
 * Since P6 (owner decision 2026-09-23) Add quest and Edit are QuestEditor,
 * the one quest form: Add quest starts an inactive draft at once, Publish
 * files it (optionally on a curriculum), and Drafts lists what is unpublished.
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

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() } }))
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
const ROSTER = { roster: [
  { student_id: 's-ava', name: 'Ava Stone', is_student: true },
  { student_id: 's-ben', name: 'Ben Stone', is_student: true },
  { student_id: 'p-mum', name: 'Mum Stone', is_student: false },
] }

// What the quest editor reads for each quest (GET /api/sis/quest-editor/<id>).
const editorQuest = (id, extra = {}) => ({
  id, title: '', description: '', header_image_url: '', is_active: false, is_draft: true,
  draft: { context: 'library', target_id: null }, is_library: false, xp_threshold: 0,
  teachers_may_change_xp: true, allow_custom_tasks: true, tasks: [], editable: true,
  can_lock_xp: true, ...extra,
})
const EDITOR = {
  'q-new': editorQuest('q-new'),
  q1: editorQuest('q1', { title: 'Watercolor Basics', is_active: true, is_draft: false, draft: null,
    tasks: [{ id: 't1', title: 'Stretch the paper', pillar: 'art', xp_value: 100, is_required: true,
      diploma_subjects: ['fine_arts'], subject_xp_distribution: { fine_arts: 100 } }] }),
  q2: editorQuest('q2', { title: 'Bridge Building', is_active: true, is_draft: false, draft: null }),
}
let DRAFTS = []

const routeGet = (url) => {
  if (url.startsWith('/api/sis/quest-editor/drafts')) return { drafts: DRAFTS }
  const m = url.match(/^\/api\/sis\/quest-editor\/([^/?]+)/)
  if (m) return { quest: EDITOR[m[1]] }
  if (url.includes('/resources')) return RESOURCES
  if (url.includes('/roster')) return ROSTER
  return LIBRARY
}

beforeEach(() => {
  vi.clearAllMocks()
  DRAFTS = []
  api.get.mockImplementation((url) => Promise.resolve({ data: routeGet(url) }))
  api.put.mockImplementation((url, body) => {
    const id = url.match(/quest-editor\/([^/?]+)/)[1]
    return Promise.resolve({ data: { quest: { ...EDITOR[id], ...body,
      tasks: (body.tasks || []).map((t, i) => ({ id: t.id || `t-saved-${i}`, ...t })) } } })
  })
  api.delete.mockResolvedValue({ data: { success: true, discarded: false } })
})

// Each row's actions sit behind one kebab menu: open the i-th row's menu,
// then pick the action.
const rowAction = (i, label) => {
  fireEvent.click(screen.getAllByRole('button', { name: /^Actions for / })[i])
  fireEvent.click(screen.getByRole('menuitem', { name: label }))
}

// The Assign dialog also asks who already has the quest (/students,
// ebfc9253); that read is not a library load either.
const libraryLoads = () => api.get.mock.calls.filter(([url]) => !url.includes('/resources')
  && !url.includes('/roster') && !url.endsWith('/students?organization_id=org-1')
  && !url.startsWith('/api/sis/quest-editor'))

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
    expect(libraryLoads()).toHaveLength(1)
  })

  it('puts a quest on a curriculum through the quest-scoped route, and reloads', async () => {
    api.post.mockResolvedValue({ data: { success: true, added: true, pushed_to_classes: 0,
      curriculum: { id: 'cur-stem', title: 'STEM' } } })
    render(<QuestsPanel />)
    await screen.findByText('Bridge Building')
    rowAction(1, 'Assign')

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Assign “Bridge Building”/)).toBeInTheDocument()
    // a933ee02: from here a curriculum is where a quest is filed, not a push.
    expect(within(dialog).getByText(/Classes already on it do not get/)).toBeInTheDocument()
    const curriculumBox = within(dialog).getByPlaceholderText('Search curriculum…')
    fireEvent.focus(curriculumBox)
    fireEvent.change(curriculumBox, { target: { value: 'STE' } })
    // SearchSelect renders its menu in a portal and commits on mouseDown.
    fireEvent.mouseDown(await screen.findByRole('button', { name: 'STEM' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/quests/q2/curricula?organization_id=org-1', { curriculum_id: 'cur-stem' }))
    // The library reloads; the roster the dialog reads for its student picker is
    // a separate request and not counted.
    await waitFor(() => expect(libraryLoads()).toHaveLength(2))
  })

  it('assigns a quest to a class through the class page\'s own route, with the due date', async () => {
    api.post.mockResolvedValue({ data: { success: true, students_enrolled: 12 } })
    render(<QuestsPanel />)
    await screen.findByText('Bridge Building')
    rowAction(1, 'Assign')

    const dialog = await screen.findByRole('dialog')
    const classBox = within(dialog).getByPlaceholderText('Search classes…')
    fireEvent.focus(classBox)
    fireEvent.change(classBox, { target: { value: 'Rob' } })
    fireEvent.mouseDown(await screen.findByRole('button', { name: 'Robotics' }))
    fireEvent.change(within(dialog).getByLabelText('Due date'), { target: { value: '2026-11-01' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Assign' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/classes/cl-2/quests?organization_id=org-1',
      // attach_to_curricula: false -- from the library the quest goes on this
      // one class and no curriculum (iCreate, 56dbc3ab, 2026-09-23: "it also
      // adds it to the applied physics curriculum").
      { quest_id: 'q2', due_date: '2026-11-01', attach_to_curricula: false }))
    // The dialog says the class's curriculum is left alone.
    expect(within(dialog).getByText(/curriculum the class follows stays as it is/)).toBeInTheDocument()
  })

  it('shows a school with more classes than the menu draws, and says it cut the list', async () => {
    // Molly (iCreate, 2026-09-22): "When I go to assign the quest to a class,
    // it doesn't actually show all the classes. So I can't assign it." Her
    // school has 158; the menu drew the first 50 in silence and stopped in the
    // middle of the alphabet, so the list looked complete and her class looked
    // absent. The cut itself is fine -- the menu has to say it is cutting.
    const many = Array.from({ length: 120 }, (_, i) => ({
      id: `cl-${i}`, name: `Class ${String(i).padStart(3, '0')}`,
    }))
    api.get.mockImplementation((url) => {
      if (url.includes('/resources')) return Promise.resolve({ data: RESOURCES })
      if (url.includes('/roster')) return Promise.resolve({ data: ROSTER })
      return Promise.resolve({ data: { ...LIBRARY, classes: many } })
    })

    render(<QuestsPanel />)
    await screen.findByText('Bridge Building')
    rowAction(1, 'Assign')
    const dialog = await screen.findByRole('dialog')
    const classBox = within(dialog).getByPlaceholderText('Search classes…')
    fireEvent.focus(classBox)

    // 120 is under the draw limit, so nothing is cut and nothing is said.
    expect(screen.queryByText(/Showing the first/)).toBeNull()
    // A class far past the old 50-row ceiling is reachable.
    expect(await screen.findByRole('button', { name: 'Class 099' })).toBeInTheDocument()
  })

  it('names the classes it could not draw when there are more than the menu holds', async () => {
    const many = Array.from({ length: 260 }, (_, i) => ({
      id: `cl-${i}`, name: `Class ${String(i).padStart(3, '0')}`,
    }))
    api.get.mockImplementation((url) => {
      if (url.includes('/resources')) return Promise.resolve({ data: RESOURCES })
      if (url.includes('/roster')) return Promise.resolve({ data: ROSTER })
      return Promise.resolve({ data: { ...LIBRARY, classes: many } })
    })

    render(<QuestsPanel />)
    await screen.findByText('Bridge Building')
    rowAction(1, 'Assign')
    const dialog = await screen.findByRole('dialog')
    fireEvent.focus(within(dialog).getByPlaceholderText('Search classes…'))

    expect(await screen.findByText(/Showing the first 200 of 260/)).toBeInTheDocument()
    // And typing reaches the rest.
    fireEvent.change(within(dialog).getByPlaceholderText('Search classes…'), { target: { value: 'Class 255' } })
    expect(await screen.findByRole('button', { name: 'Class 255' })).toBeInTheDocument()
  })

  it('gives a quest to students by name, students only, through the quest-scoped route', async () => {
    // Dallin (iCreate, 293c4d99): "Can we assign quests to individuals too?"
    api.post.mockResolvedValue({ data: { success: true, enrolled: 2, already_had_it: 0 } })
    render(<QuestsPanel />)
    await screen.findByText('Bridge Building')
    rowAction(1, 'Assign')

    const dialog = await screen.findByRole('dialog')
    const box = await within(dialog).findByPlaceholderText('Search students…')
    fireEvent.focus(box)
    fireEvent.change(box, { target: { value: 'Stone' } })
    // A parent named Stone is on the roster too; only the children are offered.
    expect(screen.queryByRole('button', { name: 'Mum Stone' })).toBeNull()
    fireEvent.mouseDown(await screen.findByRole('button', { name: 'Ava Stone' }))
    fireEvent.focus(box)
    fireEvent.change(box, { target: { value: 'Ben' } })
    fireEvent.mouseDown(await screen.findByRole('button', { name: 'Ben Stone' }))
    expect(within(dialog).getByLabelText('Students to give it to')).toHaveTextContent('Ava Stone')
    expect(within(dialog).getByLabelText('Students to give it to')).toHaveTextContent('Ben Stone')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Give' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/quests/q2/students?organization_id=org-1', { student_ids: ['s-ava', 's-ben'] }))
  })

  it('does not offer a curriculum or class the quest is already on', async () => {
    render(<QuestsPanel />)
    await screen.findByText('Watercolor Basics')
    rowAction(0, 'Assign')
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

  it('Add quest starts a draft at once, and Publish files it', async () => {
    api.post.mockImplementation(async (url) => (url.startsWith('/api/sis/quest-editor/drafts')
      ? { data: { success: true, quest_id: 'q-new' } }
      : { data: { success: true, quest_id: 'q-new' } }))
    render(<QuestsPanel />)
    await screen.findByText('Watercolor Basics')
    fireEvent.click(screen.getByRole('button', { name: /Add quest/ }))

    // The quest exists before a word is typed: an inactive draft for the library.
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/quest-editor/drafts?organization_id=org-1', { context: 'library' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(await within(dialog).findByLabelText('Quest title'), { target: { value: 'Robot Garden' } })
    fireEvent.change(within(dialog).getByLabelText('Quest description'), { target: { value: 'Grow something with a robot.' } })
    fireEvent.change(within(dialog).getByPlaceholderText(/Task 1 /), { target: { value: 'Plant a seed' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/quest-editor/q-new?organization_id=org-1',
      expect.objectContaining({
        title: 'Robot Garden', description: 'Grow something with a robot.',
        tasks: [expect.objectContaining({ title: 'Plant a seed' })],
      }),
    ))
    // No curriculum was chosen: none is sent.
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/quests/q-new/publish?organization_id=org-1', {}))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('a new quest takes files and links on the quest before it is saved', async () => {
    api.post.mockResolvedValue({ data: { success: true, quest_id: 'q-new' } })
    render(<QuestsPanel />)
    await screen.findByText('Watercolor Basics')
    fireEvent.click(screen.getByRole('button', { name: /Add quest/ }))
    const dialog = await screen.findByRole('dialog')
    // The quest's own attachments load from the resources route straight away.
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/sis/quests/q-new/resources'))
    expect(await within(dialog).findByRole('button', { name: /Add a resource/ })).toBeInTheDocument()
  })

  it('puts every row action behind one menu', async () => {
    render(<QuestsPanel />)
    await screen.findByText('Watercolor Basics')
    // No loose action links on the row any more.
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Watercolor Basics' }))
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent))
      .toEqual(['Edit', 'Assign', 'Attachments', 'Duplicate'])
  })

  it('opens any quest\'s attachments from its row, task by task', async () => {
    render(<QuestsPanel />)
    await screen.findByText('Watercolor Basics')
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Watercolor Basics' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Attachments' }))
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

  it('can put the new quest onto a curriculum when it is published', async () => {
    api.post.mockResolvedValue({ data: { success: true, quest_id: 'q-new',
      curriculum: { id: 'cur-stem', title: 'STEM' }, added: true, pushed_to_classes: 0 } })
    render(<QuestsPanel />)
    await screen.findByText('Watercolor Basics')
    fireEvent.click(screen.getByRole('button', { name: /Add quest/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(await within(dialog).findByLabelText('Quest title'), { target: { value: 'Robot Garden' } })
    const picker = within(dialog).getByPlaceholderText('Search curriculum…')
    fireEvent.focus(picker)
    fireEvent.change(picker, { target: { value: 'STE' } })
    fireEvent.mouseDown(await screen.findByRole('button', { name: 'STEM' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/quests/q-new/publish?organization_id=org-1', { curriculum_id: 'cur-stem' }))
  })

  it('will not publish a quest with no title', async () => {
    api.post.mockResolvedValue({ data: { success: true, quest_id: 'q-new' } })
    render(<QuestsPanel />)
    await screen.findByText('Watercolor Basics')
    fireEvent.click(screen.getByRole('button', { name: /Add quest/ }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByRole('button', { name: 'Publish' })).toBeDisabled()
  })

  it('lists the school\'s drafts, and Resume opens one where it was started', async () => {
    DRAFTS = [{ id: 'q-new', title: 'Half-done garden', context: 'library', target_id: null,
      created_by_name: 'Molly Christensen', updated_at: '2026-09-20T12:00:00Z' }]
    render(<QuestsPanel />)
    const drafts = await screen.findByRole('region', { name: 'Drafts' })
    expect(within(drafts).getByText('Half-done garden')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/sis/quest-editor/drafts?context=all&organization_id=org-1')
    fireEvent.click(within(drafts).getByRole('button', { name: 'Resume' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/sis/quest-editor/q-new?organization_id=org-1'))
    expect(api.post).not.toHaveBeenCalled()
  })

  it('says so when the school has no quests', async () => {
    api.get.mockResolvedValue({ data: { quests: [], curricula: [], classes: [] } })
    render(<QuestsPanel />)
    expect(await screen.findByText('No quests yet')).toBeInTheDocument()
  })
})

describe('editing and duplicating from the library row', () => {
  // Molly (iCreate, 2026-09-22): "There's no way to edit a quest that I can
  // see. I'd also love to be able to duplicate quests." Editing lived only on
  // the curriculum a quest sat on, so a quest on no curriculum -- the exact
  // population this page was built for -- had no editor anywhere.
  beforeEach(() => {
    api.patch.mockResolvedValue({ data: { success: true, quest: { id: 'q2', title: 'Renamed' } } })
  })

  it('opens the one quest editor on a quest that is on no curriculum at all', async () => {
    render(<QuestsPanel />)
    // q2 has no curricula and no classes.
    await screen.findByText('Not on a curriculum')
    rowAction(1, 'Edit')

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByLabelText('Quest title')).toHaveValue('Bridge Building')
    expect(api.get).toHaveBeenCalledWith('/api/sis/quest-editor/q2?organization_id=org-1')
    // Editing an existing quest starts nothing new.
    expect(api.post).not.toHaveBeenCalled()
  })

  it('saves the title, description and finish line through the editor', async () => {
    render(<QuestsPanel />)
    await screen.findByText('Bridge Building')
    rowAction(1, 'Edit')
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(await within(dialog).findByLabelText('Quest title'), { target: { value: 'Bridges' } })
    fireEvent.change(within(dialog).getByLabelText('Quest description'), { target: { value: 'Build one.' } })
    fireEvent.change(within(dialog).getByLabelText(/XP required to finish/), { target: { value: '500' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/quest-editor/q2?organization_id=org-1',
      expect.objectContaining({ title: 'Bridges', description: 'Build one.', xp_threshold: 500,
        teachers_may_change_xp: true })))
  })

  // 3d926fc3, Molly: "Then I think it'd be good to click on 'teachers may
  // change' if we want teachers to change it."
  it('saves whether teachers may change the XP to finish', async () => {
    render(<QuestsPanel />)
    await screen.findByText('Bridge Building')
    rowAction(1, 'Edit')
    const dialog = await screen.findByRole('dialog')

    const box = await within(dialog).findByLabelText('Teachers may change the XP to finish')
    expect(box).toBeChecked()
    fireEvent.click(box)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/quest-editor/q2?organization_id=org-1',
      expect.objectContaining({ teachers_may_change_xp: false })))
  })

  it('opens the checkbox on the saved value', async () => {
    EDITOR.q2 = { ...EDITOR.q2, teachers_may_change_xp: false }
    try {
      render(<QuestsPanel />)
      await screen.findByText('Bridge Building')
      rowAction(1, 'Edit')
      const dialog = await screen.findByRole('dialog')
      expect(await within(dialog).findByLabelText('Teachers may change the XP to finish')).not.toBeChecked()
    } finally {
      EDITOR.q2 = { ...EDITOR.q2, teachers_may_change_xp: true }
    }
  })

  it('clearing the box means no requirement, not zero XP', async () => {
    render(<QuestsPanel />)
    await screen.findByText('Bridge Building')
    rowAction(1, 'Edit')
    const dialog = await screen.findByRole('dialog')

    const box = await within(dialog).findByLabelText(/XP required to finish/)
    fireEvent.change(box, { target: { value: '500' } })
    fireEvent.change(box, { target: { value: '' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/quest-editor/q2?organization_id=org-1',
      expect.objectContaining({ xp_threshold: null })))
  })

  it('will not save a live quest with no title', async () => {
    render(<QuestsPanel />)
    await screen.findByText('Bridge Building')
    rowAction(1, 'Edit')
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(await within(dialog).findByLabelText('Quest title'), { target: { value: '  ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await new Promise((r) => setTimeout(r, 20))
    expect(api.put).not.toHaveBeenCalled()
  })

  it('will not save a negative XP requirement', async () => {
    render(<QuestsPanel />)
    await screen.findByText('Bridge Building')
    rowAction(1, 'Edit')
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(await within(dialog).findByLabelText(/XP required to finish/), { target: { value: '-5' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await new Promise((r) => setTimeout(r, 20))
    expect(api.put).not.toHaveBeenCalled()
  })

  it('warns that an edit reaches everyone when the quest is already in use', async () => {
    render(<QuestsPanel />)
    await screen.findByText('Watercolor Basics')
    // q1 is on a curriculum and a class.
    rowAction(0, 'Edit')
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(/reach everyone already on it/i)).toBeInTheDocument()
  })

  it('says nothing about blast radius for a quest nobody is on', async () => {
    render(<QuestsPanel />)
    await screen.findByText('Bridge Building')
    rowAction(1, 'Edit')
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByLabelText('Quest title')
    expect(within(dialog).queryByText(/reach everyone already on it/i)).toBeNull()
  })

  it('caps the chips on a quest that is on many classes, and counts the rest', async () => {
    // A quest pushed to every section of a microschool carried nine class
    // chips; stacked, the row grew taller than the screen and the column
    // demanded width the table did not have (2026-09-22).
    const classes = Array.from({ length: 9 }, (_, i) => ({ id: `cl-${i}`, name: `Section ${i}` }))
    api.get.mockImplementation((url) => {
      if (url.includes('/resources')) return Promise.resolve({ data: RESOURCES })
      if (url.includes('/roster')) return Promise.resolve({ data: ROSTER })
      return Promise.resolve({
        data: { ...LIBRARY, quests: [{ ...LIBRARY.quests[0], classes }] },
      })
    })

    render(<QuestsPanel />)
    await screen.findByText('Watercolor Basics')
    expect(screen.getByText('Section 0')).toBeInTheDocument()
    expect(screen.getByText('Section 2')).toBeInTheDocument()
    expect(screen.queryByText('Section 3')).toBeNull()
    // The rest are counted, and named on hover.
    const more = screen.getByText('+6 more')
    expect(more).toHaveAttribute('title', expect.stringContaining('Section 8'))
  })

  it('lays the table out in fixed columns so it cannot outgrow the window', async () => {
    // jsdom has no layout, so this pins the mechanism: fixed columns share the
    // width available instead of each demanding what its widest cell wants.
    render(<QuestsPanel />)
    await screen.findByText('Watercolor Basics')
    const table = screen.getAllByRole('table')[0]
    expect(table.className).toMatch(/table-fixed/)
    expect(table.querySelector('colgroup')).toBeTruthy()
  })

  it('duplicates a quest and re-reads the library, because the copy is a new row', async () => {
    api.post.mockResolvedValue({ data: { success: true, quest_id: 'q3', title: 'Bridge Building (copy)', task_count: 0 } })
    render(<QuestsPanel />)
    await screen.findByText('Bridge Building')
    const before = libraryLoads().length

    rowAction(1, 'Duplicate')

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/quests/q2/duplicate?organization_id=org-1', {}))
    await waitFor(() => expect(libraryLoads().length).toBeGreaterThan(before))
  })
})

describe('who already has the quest, in the Give picker (ebfc9253)', () => {
  // iCreate, ebfc9253, 2026-09-23: "When assigning to a student, I can't tell
  // if they already have it or not until I enter it in again."
  const holdersFor = (ids) => (url) => Promise.resolve({
    data: url.includes('/resources') ? RESOURCES
      : url.includes('/roster') ? ROSTER
      : url.startsWith('/api/sis/quests/q2/students') ? { success: true, student_ids: ids }
      : LIBRARY,
  })

  it('marks a student who already has it before anyone presses Give', async () => {
    api.get.mockImplementation(holdersFor(['s-ava']))
    render(<QuestsPanel />)
    await screen.findByText('Bridge Building')
    rowAction(1, 'Assign')
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/sis/quests/q2/students?organization_id=org-1'))
    const box = await within(dialog).findByPlaceholderText('Search students…')
    fireEvent.focus(box)
    fireEvent.change(box, { target: { value: 'Stone' } })
    expect(await screen.findByRole('button', { name: 'Ava Stone (already has it)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ben Stone' })).toBeInTheDocument()
  })

  it('asks again after a Give, so the one just given is marked', async () => {
    api.get.mockImplementation(holdersFor([]))
    api.post.mockResolvedValue({ data: { success: true, enrolled: 1, already_had_it: 0 } })
    render(<QuestsPanel />)
    await screen.findByText('Bridge Building')
    rowAction(1, 'Assign')
    const dialog = await screen.findByRole('dialog')
    const box = await within(dialog).findByPlaceholderText('Search students…')
    fireEvent.focus(box)
    fireEvent.change(box, { target: { value: 'Ben' } })
    fireEvent.mouseDown(await screen.findByRole('button', { name: 'Ben Stone' }))
    const holderReads = () => api.get.mock.calls.filter(([u]) => u.startsWith('/api/sis/quests/q2/students')).length
    await waitFor(() => expect(holderReads()).toBe(1))
    api.get.mockImplementation(holdersFor(['s-ben']))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Give' }))
    await waitFor(() => expect(holderReads()).toBe(2))
    fireEvent.focus(box)
    fireEvent.change(box, { target: { value: 'Ben' } })
    expect(await screen.findByRole('button', { name: 'Ben Stone (already has it)' })).toBeInTheDocument()
  })
})

// The b067c6c8 create-form fields (XP required, teachers may change it, links
// at create time) are the quest editor's now; a draft has an id from the
// first minute, so links and files go on through the attachments panel.
// components/sis/questEditor.test.jsx holds that behaviour.
