import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SisBountiesPage from './SisBountiesPage'

const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'org_admin' } }) }))
vi.mock('../../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ organization: { id: 'org-1', name: 'Apogee Cache Valley' } }),
}))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../components/bounty/SubmissionReviewCard', () => ({
  default: ({ claim }) => <div>Review card for {claim.student.display_name}</div>,
}))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(() => Promise.resolve({ data: { bounties: [
      { id: 'b1', title: 'Clean the supply room', repeatable: true,
        rewards: [{ type: 'custom', text: 'Rent one library book' }],
        claims: [
          { id: 'c1', status: 'submitted', student: { display_name: 'Ada Kid' } },
          { id: 'c2', status: 'claimed', student: { display_name: 'Ben Kid' } },
          { id: 'c3', status: 'approved', student: { display_name: 'Cy Kid' } },
        ] },
      { id: 'b2', title: 'Water the plants', rewards: [], claims: [] },
    ] } })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

beforeEach(() => vi.clearAllMocks())

describe('SisBountiesPage', () => {
  it('opens on what is waiting for review, across every bounty of the school', async () => {
    render(<SisBountiesPage />)
    expect(await screen.findByText('Review card for Ada Kid')).toBeInTheDocument()
    expect(screen.queryByText('Review card for Ben Kid')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'To review (1)' })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/bounties'))
  })

  it('lists every bounty with its reward and where its claims stand', async () => {
    render(<SisBountiesPage />)
    fireEvent.click(await screen.findByRole('tab', { name: 'All bounties' }))
    expect(screen.getByText('Clean the supply room · Repeatable')).toBeInTheDocument()
    expect(screen.getByText('Rent one library book · 1 working · 1 to review · 1 approved')).toBeInTheDocument()
    expect(screen.getByText(/No reward set/)).toBeInTheDocument()
  })
})
