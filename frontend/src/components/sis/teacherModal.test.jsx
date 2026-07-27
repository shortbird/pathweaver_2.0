import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))
// ModalOverlay renders children (avoid portal/focus-trap noise in jsdom).
vi.mock('../ui', () => ({ ModalOverlay: ({ children }) => <div>{children}</div> }))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import TeacherModal from './TeacherModal'

const fillForm = () => {
  fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Jane' } })
  fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Doe' } })
  fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'jane@real.com' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  // Staff onboarding templates load on mount; a family template must be excluded.
  api.get.mockImplementation((url) => {
    if (url.includes('/onboarding/templates')) {
      return Promise.resolve({ data: { templates: [
        { id: 't1', name: 'Employee onboarding', audience: 'staff', role_type: 'employee' },
        { id: 'fam', name: 'Family welcome', audience: 'family' },
      ] } })
    }
    return Promise.resolve({ data: {} })
  })
})

describe('TeacherModal onboarding picker', () => {
  it('assigns the selected onboarding template when adding a teacher', async () => {
    api.post.mockResolvedValue({ data: { teacher: { id: 'new-1' }, email_sent: true, onboarding_assigned: true } })
    const onSaved = vi.fn()
    render(<TeacherModal orgId="org-1" onClose={vi.fn()} onSaved={onSaved} />)

    // Staff template shown; family template filtered out.
    await screen.findByText('Employee onboarding (employee)')
    expect(screen.queryByText('Family welcome')).toBeNull()

    fillForm()
    fireEvent.click(screen.getByRole('button', { name: /add teacher/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/api/sis/staff')
    expect(body.onboarding_template_id).toBe('t1')  // defaulted to first staff template
    expect(body.force_new).toBeUndefined()
  })
})

describe('TeacherModal placeholder guard', () => {
  it('offers to link an existing placeholder instead of creating a duplicate', async () => {
    api.post.mockImplementation((url) => {
      if (url === '/api/sis/staff') {
        return Promise.resolve({ data: { placeholder_match: { id: 'ph-1', name: 'Jane Doe', class_count: 3 } } })
      }
      if (url.includes('/link')) {
        return Promise.resolve({ data: { linked: 'invited', staff_id: 'ph-1', email_sent: true } })
      }
      return Promise.resolve({ data: {} })
    })
    const onSaved = vi.fn()
    render(<TeacherModal orgId="org-1" onClose={vi.fn()} onSaved={onSaved} />)
    await screen.findByText('Employee onboarding (employee)')

    fillForm()
    fireEvent.click(screen.getByRole('button', { name: /add teacher/i }))

    // Decision screen appears instead of creating.
    await screen.findByText(/may already exist/i)
    expect(screen.getByText(/3 classes assigned/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /link jane doe.*account/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const linkCall = api.post.mock.calls.find(([u]) => u.includes('/link'))
    expect(linkCall[0]).toBe('/api/sis/staff/ph-1/link')
    expect(linkCall[1]).toMatchObject({ email: 'jane@real.com', organization_id: 'org-1' })
  })

  it('force-creates when the admin chooses "create a new teacher"', async () => {
    let calls = 0
    api.post.mockImplementation((url) => {
      if (url === '/api/sis/staff') {
        calls += 1
        return calls === 1
          ? Promise.resolve({ data: { placeholder_match: { id: 'ph-1', name: 'Jane Doe', class_count: 0 } } })
          : Promise.resolve({ data: { teacher: { id: 'new-1' }, email_sent: true } })
      }
      return Promise.resolve({ data: {} })
    })
    const onSaved = vi.fn()
    render(<TeacherModal orgId="org-1" onClose={vi.fn()} onSaved={onSaved} />)
    await screen.findByText('Employee onboarding (employee)')

    fillForm()
    fireEvent.click(screen.getByRole('button', { name: /add teacher/i }))
    await screen.findByText(/may already exist/i)
    fireEvent.click(screen.getByRole('button', { name: /create a new teacher/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const second = api.post.mock.calls.filter(([u]) => u === '/api/sis/staff')[1]
    expect(second[1].force_new).toBe(true)
  })
})
