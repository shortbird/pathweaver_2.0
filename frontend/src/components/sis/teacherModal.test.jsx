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

// Adding a teacher takes an email and nothing else.
const fillForm = () => {
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

describe('TeacherModal email-only add', () => {
  it('asks only for an email — the teacher supplies their own name and bio', async () => {
    render(<TeacherModal orgId="org-1" onClose={vi.fn()} onSaved={vi.fn()} />)
    await screen.findByText('Employee onboarding (employee)')

    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/last name/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/bio/i)).not.toBeInTheDocument()
    expect(screen.getByText(/add their\s+own name and bio/i)).toBeInTheDocument()
  })

  it('still collects name and bio when editing someone who already has an account', async () => {
    render(
      <TeacherModal
        orgId="org-1"
        onClose={vi.fn()}
        onSaved={vi.fn()}
        initial={{ id: 's1', first_name: 'Jane', last_name: 'Doe', email: 'jane@real.com', bio: 'Coach' }}
      />,
    )
    expect(await screen.findByLabelText(/first name/i)).toHaveValue('Jane')
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Doe')
    expect(screen.getByLabelText(/bio/i)).toHaveValue('Coach')
  })

  it('warns about unlinked placeholders so their classes are not stranded', async () => {
    // The old name-match guard cannot fire without a name, so this note is what
    // stops an admin creating a duplicate and orphaning a placeholder's classes.
    render(
      <TeacherModal
        orgId="org-1"
        onClose={vi.fn()}
        onSaved={vi.fn()}
        placeholders={[{ id: 'ph-1', name: 'Liz Smith' }, { id: 'ph-2', name: 'Ray Ng' }]}
      />,
    )
    await screen.findByText('Employee onboarding (employee)')

    expect(screen.getByText(/Replacing a teacher who already has classes/i)).toBeInTheDocument()
    expect(screen.getByText(/Liz Smith, Ray Ng/)).toBeInTheDocument()
    expect(screen.getByText(/Link their account/)).toBeInTheDocument()
  })

  it('says nothing about placeholders when the org has none', async () => {
    render(<TeacherModal orgId="org-1" onClose={vi.fn()} onSaved={vi.fn()} placeholders={[]} />)
    await screen.findByText('Employee onboarding (employee)')

    expect(screen.queryByText(/Replacing a teacher who already has classes/i)).not.toBeInTheDocument()
  })
})
