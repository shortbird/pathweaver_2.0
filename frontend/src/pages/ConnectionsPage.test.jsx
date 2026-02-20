import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ConnectionsPage from './ConnectionsPage'

const mockNavigate = vi.fn()
let authState = {}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  observerAPI: { getMyObservers: vi.fn() }
}))

vi.mock('../hooks/api/useFriends', () => ({
  useFriends: () => ({
    data: { friends: mockFriends, pending_requests: mockPending, sent_requests: [] },
    isLoading: false
  }),
  useSendFriendRequest: () => ({ mutate: vi.fn(), isPending: false }),
  useAcceptFriendRequest: () => ({ mutate: vi.fn() }),
  useDeclineFriendRequest: () => ({ mutate: vi.fn() }),
  useCancelFriendRequest: () => ({ mutate: vi.fn() })
}))

vi.mock('../utils/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn() }
}))

vi.mock('../components/connections/ConnectionsHeader', () => ({
  default: ({ returnToQuest }) => (
    <div data-testid="connections-header">
      My Network
      {returnToQuest && <span data-testid="return-quest">Return to Quest</span>}
    </div>
  )
}))

vi.mock('../components/connections/NetworkSection', () => ({
  default: ({ learningPartners, pendingPartnerRequests, observers }) => (
    <div data-testid="network-section">
      <span data-testid="partner-count">{learningPartners?.length} partners</span>
      <span data-testid="pending-count">{pendingPartnerRequests?.length} pending</span>
      <span data-testid="observer-count">{observers?.length} observers</span>
    </div>
  )
}))

vi.mock('../components/connections/Modals/AddLearningPartnerModal', () => ({
  default: ({ isOpen }) => isOpen ? <div data-testid="add-partner-modal">Add Partner</div> : null
}))

vi.mock('../components/connections/Modals/AddObserverModal', () => ({
  default: ({ isOpen }) => isOpen ? <div data-testid="add-observer-modal">Add Observer</div> : null
}))

import { observerAPI } from '../services/api'

const mockFriends = [
  { id: 'f1', display_name: 'Alice' },
  { id: 'f2', display_name: 'Bob' }
]
const mockPending = [
  { id: 'p1', display_name: 'Charlie', created_at: '2025-01-01T00:00:00Z' }
]

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } }
})

function renderConnections() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/connections']}>
        <ConnectionsPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ConnectionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
    authState = { user: { id: 'user-1', role: 'student' } }
    observerAPI.getMyObservers.mockResolvedValue({ data: { observers: [] } })
  })

  describe('rendering', () => {
    it('renders connections header', async () => {
      renderConnections()
      await waitFor(() => {
        expect(screen.getByTestId('connections-header')).toBeInTheDocument()
      })
    })

    it('renders network section', async () => {
      renderConnections()
      await waitFor(() => {
        expect(screen.getByTestId('network-section')).toBeInTheDocument()
      })
    })

    it('passes friend data to network section', async () => {
      renderConnections()
      await waitFor(() => {
        expect(screen.getByTestId('partner-count')).toHaveTextContent('2 partners')
      })
    })

    it('passes pending requests to network section', async () => {
      renderConnections()
      await waitFor(() => {
        expect(screen.getByTestId('pending-count')).toHaveTextContent('1 pending')
      })
    })
  })

  describe('structure', () => {
    it('does not render modals by default', async () => {
      renderConnections()
      await waitFor(() => {
        expect(screen.queryByTestId('add-partner-modal')).not.toBeInTheDocument()
        expect(screen.queryByTestId('add-observer-modal')).not.toBeInTheDocument()
      })
    })
  })
})
