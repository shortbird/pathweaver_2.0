import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

// vi.mock below is hoisted above these, so they load the mocked modules.
import { officeTaskApi } from '../../../hooks/api/useTasks'
import { sisOnboardingApi } from '../../../hooks/api/useSisOnboarding'
import { BatchCard } from './AssignedWork'
import AssignComposer from './AssignComposer'

/**
 * Changing a task after it was sent, and the composer's template wording.
 *
 *   6eeaef78  "I would like to be able to edit tasks."            -> Edit
 *   35d879db  "Tasks can't be reassigned to someone else."         -> Reassign
 *   a063cbd9  "Can't delete tasks" (a campus coordinator)          -> Delete,
 *             and an Unassign you can actually find
 *   f794810e  "I don't know what save as template does for 'a new task'?"
 *
 * What is pinned: each control renders where the office looks for it and
 * calls the right door on officeTaskApi with the card's key or the person's
 * task id. What an edit does to people's progress is the server's rule and is
 * tested there (backend/tests/test_sis_task_edit_reassign_delete.py).
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../../pages/sis/useSisOrg', () => ({
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn(() => Promise.resolve(true)) }))
vi.mock('../../../contexts/ConfirmContext', () => ({ useConfirm: () => confirmMock }))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../../services/api', () => ({ default: api }))

const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

const KEY = 'batch:3f1b6f1e-1111-4111-8111-111111111111'

const ONBOARDING = {
  key: KEY, title: 'New teacher onboarding', description: 'Before your first day',
  audiences: ['staff'], priority: null, action: 'do', due_date: '2026-10-01',
  assigned_by_name: 'Ada Admin', created_at: '2026-09-20T00:00:00Z',
  done: 0, total: 2, awaiting_review: 0, outstanding: true,
  people: [
    { id: 'ta-kate', user_id: 'kate', user_name: 'Kate Myers', title: 'New teacher onboarding',
      audience: 'staff', status: 'in_progress', native_status: 'in_progress', done_count: 1,
      total_count: 2,
      items: [
        { key: 'badge', title: 'Pick up your badge', status: 'complete', required: true },
        { key: 'w4', title: 'W-4', status: 'pending', needs_document: true, required: true },
      ] },
    { id: 'ta-sam', user_id: 'sam', user_name: 'Sam Teacher', title: 'New teacher onboarding',
      audience: 'staff', status: 'todo', native_status: 'in_progress', done_count: 0,
      total_count: 2,
      items: [
        { key: 'badge', title: 'Pick up your badge', status: 'pending', required: true },
        { key: 'w4', title: 'W-4', status: 'pending', needs_document: true, required: true },
      ] },
  ],
}

// A one-step task: the title is the step and the note rides on it.
const ROSTER = {
  key: 'batch:roster', title: 'Turn in your roster', description: null, audiences: ['staff'],
  priority: 'high', action: 'do', due_date: '2026-09-01', done: 0, total: 1,
  people: [{ id: 'ta-r', user_id: 'sam', user_name: 'Sam Teacher', title: 'Turn in your roster',
    audience: 'staff', native_status: 'in_progress', done_count: 0, total_count: 1,
    items: [{ key: 'roster', title: 'Turn in your roster', description: 'Room 3 only',
      status: 'pending', required: true }] }],
}

const STAFF = [{ id: 'kate', name: 'Kate Myers' }, { id: 'sam', name: 'Sam Teacher' },
  { id: 'lisa', name: 'Lisa Wong' }]

beforeEach(() => {
  vi.clearAllMocks()
  confirmMock.mockResolvedValue(true)
  api.get.mockImplementation((url) => {
    if (url.includes('/onboarding/recipients?audience=staff')) return Promise.resolve({ data: { recipients: STAFF } })
    if (url.includes('/onboarding/templates')) {
      return Promise.resolve({ data: { templates: [{ id: 't1', name: 'Field trip prep', items: [] }] } })
    }
    return Promise.resolve({ data: {} })
  })
  api.patch.mockResolvedValue({ data: { updated: 2 } })
  api.delete.mockResolvedValue({ data: { deleted: 2 } })
  api.post.mockResolvedValue({ data: {} })
})

const renderCard = (batch = ONBOARDING) => {
  const onChanged = vi.fn()
  const view = render(<BatchCard orgId="org-1" batch={batch} onChanged={onChanged} />)
  const card = view.container.querySelector('details')
  card.open = true
  return { card, onChanged }
}

// The card's own actions sit above the people table; each person's card has
// its own below it.
const personCard = (name) => screen.getAllByText(name)
  .map((el) => el.closest('details'))
  .find((d) => d && d.parentElement?.closest('details'))

describe('editing a task that was sent (6eeaef78)', () => {
  it('has an Edit task button on the card that opens an editor filled from the task', async () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Edit task' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit task' })
    const d = within(dialog)
    expect(d.getByLabelText('Title')).toHaveValue('New teacher onboarding')
    expect(d.getByLabelText('Directions')).toHaveValue('Before your first day')
    expect(d.getByLabelText('Due date')).toHaveValue('2026-10-01')
    expect(d.getByLabelText('Step 1')).toHaveValue('Pick up your badge')
    expect(d.getByLabelText('Step 2')).toHaveValue('W-4')
    expect(d.getByText(/Changes go to all 2 people/)).toBeInTheDocument()
  })

  it('sends the card key and every step with its key, so progress is kept', async () => {
    const spy = vi.spyOn(officeTaskApi, 'editBatch')
    const { onChanged } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Edit task' }))
    const d = within(await screen.findByRole('dialog', { name: 'Edit task' }))
    fireEvent.change(d.getByLabelText('Step 1'), { target: { value: 'Collect your badge' } })
    fireEvent.change(d.getByLabelText('Due date'), { target: { value: '2026-10-08' } })
    fireEvent.click(d.getByText('+ Another step'))
    fireEvent.change(d.getByLabelText('Step 3'), { target: { value: 'Meet your mentor' } })
    fireEvent.click(d.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    const [orgId, key, body] = spy.mock.calls[0]
    expect(orgId).toBe('org-1')
    expect(key).toBe(KEY)
    expect(body).toMatchObject({ title: 'New teacher onboarding', description: 'Before your first day',
      due_date: '2026-10-08' })
    expect(body.items.map((i) => [i.key, i.title])).toEqual([
      ['badge', 'Collect your badge'], ['w4', 'W-4'], [undefined, 'Meet your mentor']])
    // Nobody's progress travels in the edit.
    body.items.forEach((i) => expect(i.status).toBeUndefined())
    expect(api.patch.mock.calls[0][0]).toBe(`/api/sis/tasks/batches/${encodeURIComponent(KEY)}`)
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('edits a one-step task the way the composer writes one', async () => {
    const spy = vi.spyOn(officeTaskApi, 'editBatch')
    renderCard(ROSTER)
    fireEvent.click(screen.getByRole('button', { name: 'Edit task' }))
    const d = within(await screen.findByRole('dialog', { name: 'Edit task' }))
    expect(d.getByLabelText('Note')).toHaveValue('Room 3 only')
    fireEvent.change(d.getByLabelText('Title'), { target: { value: 'Turn in your class roster' } })
    fireEvent.click(d.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    const body = spy.mock.calls[0][2]
    expect(body.description).toBeNull()
    expect(body.items).toEqual([expect.objectContaining({
      key: 'roster', title: 'Turn in your class roster', description: 'Room 3 only' })])
    // The due date was not touched, so it is not sent.
    expect('due_date' in body).toBe(false)
  })
})

describe('deleting a whole task (a063cbd9)', () => {
  it('has a Delete task button on the card that asks first, then deletes by the card key', async () => {
    const spy = vi.spyOn(officeTaskApi, 'deleteBatch')
    const { onChanged } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('org-1', KEY))
    expect(confirmMock.mock.calls[0][0]).toMatch(/Delete "New teacher onboarding" for all 2 people\?/)
    expect(confirmMock.mock.calls[0][0]).toMatch(/1 of them already started it/)
    expect(api.delete.mock.calls[0][0]).toBe(
      `/api/sis/tasks/batches/${encodeURIComponent(KEY)}?organization_id=org-1`)
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('deletes nothing when the office says no', async () => {
    confirmMock.mockResolvedValue(false)
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }))
    await waitFor(() => expect(confirmMock).toHaveBeenCalled())
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('keeps Delete and Edit out of the card header, which is the expand target', () => {
    const { card } = renderCard()
    const summary = card.querySelector('summary')
    expect(within(summary).queryByRole('button')).toBeNull()
  })

  it('gives each person a visible Unassign button, outside their card header', async () => {
    const spy = vi.spyOn(sisOnboardingApi, 'unassign')
    renderCard()
    const kate = personCard('Kate Myers')
    expect(within(kate.querySelector('summary')).queryByRole('button')).toBeNull()
    fireEvent.click(within(kate).getByRole('button', { name: 'Unassign' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('ta-kate', 'org-1'))
  })
})

describe('reassigning one person\'s task (35d879db)', () => {
  it('offers the school\'s people except the one who has it, and moves it', async () => {
    const spy = vi.spyOn(officeTaskApi, 'reassign')
    const { onChanged } = renderCard()
    const kate = personCard('Kate Myers')
    fireEvent.click(within(kate).getByRole('button', { name: 'Reassign' }))
    const box = await within(kate).findByPlaceholderText('Who should do it?')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      '/api/sis/staff-admin/onboarding/recipients?audience=staff&organization_id=org-1'))
    fireEvent.focus(box)
    // Kate is not offered her own task.
    await screen.findByText('Lisa Wong')
    expect(screen.queryAllByRole('button', { name: 'Kate Myers' })).toHaveLength(0)
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Lisa Wong' }))
    fireEvent.click(within(kate).getByRole('button', { name: 'Move it' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('org-1', 'ta-kate', 'lisa'))
    expect(confirmMock.mock.calls[0][0]).toMatch(/Lisa Wong starts from the beginning/)
    expect(api.post).toHaveBeenCalledWith('/api/sis/tasks/ta-kate/reassign',
      { organization_id: 'org-1', user_id: 'lisa' })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('cannot move it before somebody is picked', async () => {
    renderCard()
    const kate = personCard('Kate Myers')
    fireEvent.click(within(kate).getByRole('button', { name: 'Reassign' }))
    await within(kate).findByPlaceholderText('Who should do it?')
    expect(within(kate).getByRole('button', { name: 'Move it' })).toBeDisabled()
  })
})

describe('the composer says what a template is (f794810e)', () => {
  it('calls the no-template choice "Start from scratch", not "A new task"', async () => {
    render(<AssignComposer orgId="org-1" sigEndpoint="/api/sis/signature-requests" onClose={() => {}} />)
    const select = await screen.findByLabelText('Start from a template')
    const options = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(options[0]).toBe('Start from scratch')
    expect(options).not.toContain('A new task')
  })

  it('explains Save as a template under the checkbox', async () => {
    render(<AssignComposer orgId="org-1" sigEndpoint="/api/sis/signature-requests" onClose={() => {}} />)
    expect(await screen.findByText('Save as a template')).toBeInTheDocument()
    expect(screen.getByText(
      'Saves this title, description and steps so you can send it again from the Templates tab.',
    )).toBeInTheDocument()
  })
})
