import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '../../../services/api'
import AddPersonModal from './AddPersonModal'

vi.mock('../../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
const navigate = vi.fn()
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig()),
  useNavigate: () => navigate,
}))

const mount = (props = {}) =>
  render(<AddPersonModal isOpen onClose={vi.fn()} {...props} />)

describe('AddPersonModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adds a new person with a first note and opens their lead file', async () => {
    api.post.mockResolvedValue({ data: { kind: 'lead', id: 'lead-9', existing: false } })
    mount({ initialQuery: 'Nia Moss' })

    // The search term prefills the name.
    expect(screen.getByLabelText('First name')).toHaveValue('Nia')
    expect(screen.getByLabelText('Last name')).toHaveValue('Moss')

    const submit = screen.getByRole('button', { name: 'Add person' })
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/Email/), 'nia@example.com')
    await userEvent.type(screen.getByLabelText('Note'), 'Met at the co-op fair.')
    await userEvent.type(screen.getByLabelText('Meeting date'), '2026-09-22')
    await userEvent.click(submit)

    expect(api.post).toHaveBeenCalledWith('/api/admin/crm/people', {
      first_name: 'Nia',
      last_name: 'Moss',
      email: 'nia@example.com',
      phone: '',
      note: 'Met at the co-op fair.',
      met_on: '2026-09-22',
    })
    expect(navigate).toHaveBeenCalledWith('/admin/crm/leads/lead-9')
  })

  it('opens the existing file when the email already has an Optio account', async () => {
    api.post.mockResolvedValue({ data: { kind: 'user', id: 'u1', existing: true } })
    mount({ initialQuery: 'pat@example.com' })
    expect(screen.getByLabelText(/Email/)).toHaveValue('pat@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }))
    expect(navigate).toHaveBeenCalledWith('/admin/crm/people/u1')
  })
})
