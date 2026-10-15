import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CapturePage from './CapturePage'
import CaptureSheet, { MARK_DONE_KEY } from '../../components/sis/studentWork/CaptureSheet'
import StudentQuestCard from '../../components/sis/studentWork/StudentQuestCard'
import { SIS_MODULE_BY_PATH } from './sisModules'
import { SIS_SURFACE_PATHS } from '../../utils/appSurface'

/**
 * Capture work (ticket 77637c3a, Apogee Cache Valley, 2026-10-15): "Is there a
 * way for my teachers to track student progress on quests and upload photos
 * of their work from their accounts instead of the students? ... our
 * chromebooks do not have the ability to take pictures and one kiosk for 30
 * kids is going to be challenging."
 *
 * Tap a student, tap a task, the camera opens, save. "Mark this task done"
 * completes it for the student (the server makes it reviewed). The same sheet
 * is on every task of the Students page.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1' }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
const { confirm } = vi.hoisted(() => ({ confirm: vi.fn(() => Promise.resolve(true)) }))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => confirm }))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(() => Promise.resolve({ data: { success: true, completed: true, blocks_added: 1 } })),
    patch: vi.fn(), delete: vi.fn(),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

const ADA = { id: 's1', name: 'Ada Lee', avatar_url: null }
const quest = {
  quest_id: 'q1', title: 'Bridges', classes: [], started: true, completed_at: null, set_aside: false,
  tasks_done: 1, tasks_total: 3, xp_earned: 50, individual: null,
  tasks: [
    { id: 't1', title: 'Sketch a design', done: true, completion_id: 'c1', removable: false },
    { id: 't2', title: 'Build the bridge', done: false, removable: false },
    { id: 't3', title: 'Test the load', done: false, removable: false },
  ],
}

const wrap = (ui, entry = '/capture') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes><Route path="/capture" element={ui} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// The task's own row button (the role query is slow on this page in jsdom).
const taskButton = async (title) => (await screen.findByText(title)).closest('button')

const photo = (name = 'work.jpg') => new File(['x'], name, { type: 'image/jpeg' })

const sentForm = () => {
  const [url, form] = api.post.mock.calls.at(-1)
  return { url, form, files: form.getAll('files'), note: form.get('note'), markDone: form.get('mark_done') }
}

beforeEach(() => {
  vi.clearAllMocks()
  try { window.localStorage.clear() } catch { /* jsdom quirk, see AuthContext tests */ }
  api.get.mockImplementation((url) => {
    if (url.startsWith('/api/sis/student-work/students/s1')) {
      return Promise.resolve({ data: { student: ADA, quests: [quest] } })
    }
    if (url.startsWith('/api/sis/student-work/students')) {
      return Promise.resolve({ data: { students: [ADA, { id: 's2', name: 'Ben Ortiz' }] } })
    }
    return Promise.resolve({ data: {} })
  })
})

describe('Capture work: wiring', () => {
  it('follows the Students page module and lives in the SIS console', () => {
    expect(SIS_MODULE_BY_PATH['/capture']).toBe('individual_work')
    expect(SIS_SURFACE_PATHS).toContain('/capture')
  })
})

describe('Capture work page', () => {
  it('starts on the roster and opens a student on a tap', async () => {
    wrap(<CapturePage />)
    fireEvent.click(await screen.findByRole('button', { name: /Ada Lee/ }))
    expect(await screen.findByRole('heading', { name: 'Ada Lee' })).toBeInTheDocument()
    expect(await screen.findByText('1 of 3 done')).toBeInTheDocument()
  })

  it('lists the open tasks, and done ones only on request', async () => {
    wrap(<CapturePage />, '/capture?student=s1')
    expect(await screen.findByText('Build the bridge')).toBeInTheDocument()
    expect(screen.queryByText('Sketch a design')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show done tasks' }))
    expect(screen.getByText('Sketch a design')).toBeInTheDocument()
  })

  it('a task tap opens the camera, and the shot opens the sheet for that task', async () => {
    wrap(<CapturePage />, '/capture?student=s1')
    const camera = await screen.findByTestId('camera-input')
    const click = vi.spyOn(camera, 'click')
    fireEvent.click(await taskButton('Build the bridge'))
    expect(click).toHaveBeenCalled()
    fireEvent.change(camera, { target: { files: [photo()] } })
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Build the bridge' })).toBeInTheDocument()
    expect(within(dialog).getByAltText('work.jpg')).toBeInTheDocument()
  })

  it('saving sends the photo to that student and task, then refreshes the list', async () => {
    wrap(<CapturePage />, '/capture?student=s1')
    const camera = await screen.findByTestId('camera-input')
    fireEvent.click(await taskButton('Test the load'))
    fireEvent.change(camera, { target: { files: [photo()] } })
    const gets = api.get.mock.calls.length
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const sent = sentForm()
    expect(sent.url).toBe('/api/sis/student-work/students/s1/tasks/t3/capture?organization_id=org-1')
    expect(sent.files).toHaveLength(1)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(api.get.mock.calls.length).toBeGreaterThan(gets))
  })

  it('cancelling the camera opens nothing', async () => {
    wrap(<CapturePage />, '/capture?student=s1')
    const camera = await screen.findByTestId('camera-input')
    fireEvent.click(await taskButton('Build the bridge'))
    fireEvent.change(camera, { target: { files: [] } })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Note or upload opens the sheet without the camera', async () => {
    wrap(<CapturePage />, '/capture?student=s1')
    await screen.findByText('Build the bridge')
    fireEvent.click(screen.getAllByRole('button', { name: 'Note or upload' })[0])
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})

describe('CaptureSheet', () => {
  const sheet = (task = quest.tasks[1], props = {}) => rtlRender(
    <CaptureSheet orgId="org-1" student={ADA} task={task} onSaved={vi.fn()} onCancel={vi.fn()} {...props} />,
  )

  it('needs a photo or a note before it saves', () => {
    sheet()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('What did they do?'), { target: { value: 'Explained it' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('Mark this task done is off by default and is sent when ticked', async () => {
    sheet()
    const box = screen.getByRole('checkbox', { name: /Mark this task done/ })
    expect(box).not.toBeChecked()
    // The promise the teacher reads: the student gets the XP, and it counts as reviewed.
    expect(screen.getByText('Ada gets the XP, and it counts as reviewed.')).toBeInTheDocument()
    fireEvent.click(box)
    fireEvent.change(screen.getByPlaceholderText('What did they do?'), { target: { value: 'Explained it' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and mark done' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const sent = sentForm()
    expect(sent.markDone).toBe('true')
    expect(sent.note).toBe('Explained it')
    expect(sent.form.get('organization_id')).toBe('org-1')
  })

  it('without the tick the work is added and the task stays open', async () => {
    sheet(quest.tasks[1], { initialFiles: [{ file: photo(), url: null }] })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(sentForm().markDone).toBe('false')
  })

  it('remembers the choice for the next student', () => {
    const { unmount } = sheet()
    fireEvent.click(screen.getByRole('checkbox', { name: /Mark this task done/ }))
    unmount()
    sheet(quest.tasks[2])
    expect(screen.getByRole('checkbox', { name: /Mark this task done/ })).toBeChecked()
  })

  it('a done task takes more work but is never completed twice', async () => {
    try { window.localStorage.setItem(MARK_DONE_KEY, 'true') } catch { /* jsdom */ }
    sheet(quest.tasks[0], { initialFiles: [{ file: photo(), url: null }] })
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByText('This task is already done. The work is added to it.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(sentForm().markDone).toBe('false')
  })
})

describe('Students page: Add work on each task', () => {
  const card = (q = quest, onChanged = vi.fn()) => rtlRender(
    <MemoryRouter>
      <StudentQuestCard orgId="org-1" student={ADA} quest={q} onChanged={onChanged} defaultOpen />
    </MemoryRouter>,
  )

  it('opens the sheet for that task and refreshes the card after a save', async () => {
    const onChanged = vi.fn()
    card(quest, onChanged)
    const row = screen.getByText('Build the bridge').closest('li')
    fireEvent.click(within(row).getByRole('button', { name: 'Add work' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Build the bridge' })).toBeInTheDocument()
    fireEvent.change(within(dialog).getByPlaceholderText('What did they do?'), { target: { value: 'Done in class' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(sentForm().url).toContain('/students/s1/tasks/t2/capture')
  })

  it('a finished quest has no Add work', () => {
    card({ ...quest, completed_at: '2026-10-01T00:00:00Z' })
    expect(screen.queryByRole('button', { name: 'Add work' })).not.toBeInTheDocument()
  })
})
