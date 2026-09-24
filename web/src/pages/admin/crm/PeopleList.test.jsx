import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '../../../services/api'
import PeopleList from './PeopleList'

vi.mock('../../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

const mount = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <PeopleList />
    </MemoryRouter>
  )

describe('PeopleList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('finds users and leads with no account, and does not list a signed-up lead twice', async () => {
    api.get.mockImplementation((url) =>
      Promise.resolve(
        url.startsWith('/api/admin/users')
          ? { data: { users: [{ id: 'u1', email: 'Pat@example.com', first_name: 'Pat', last_name: 'Lee' }] } }
          : {
              data: {
                leads: [
                  { id: 'l1', email: 'pat@example.com', first_name: 'Pat' },
                  { id: 'l2', email: 'nia@example.com', first_name: 'Nia', lead_source: 'manual' },
                ],
              },
            }
      )
    )
    mount('/admin/crm/people?q=a')

    expect(await screen.findByText('Pat Lee')).toBeInTheDocument()
    expect(screen.getByText('Nia')).toBeInTheDocument()
    expect(screen.getByText('No account · Added by hand')).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.getByRole('link', { name: /Nia/ })).toHaveAttribute('href', '/admin/crm/leads/l2')
  })

  it('offers to add the person when nobody matches', async () => {
    api.get.mockResolvedValue({ data: { users: [], leads: [] } })
    mount('/admin/crm/people?q=Nia%20Moss')
    expect(await screen.findByText('No one found')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Nia Moss' })).toBeInTheDocument()
  })
})
