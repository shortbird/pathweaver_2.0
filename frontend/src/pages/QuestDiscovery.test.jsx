import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import QuestDiscovery from './QuestDiscovery'

const mockNavigate = vi.fn()
let authState = {}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn()
  }
}))

vi.mock('../utils/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

// Mock heroicons
vi.mock('@heroicons/react/24/outline', () => ({
  MagnifyingGlassIcon: (props) => <svg data-testid="search-icon" {...props} />,
  PlusIcon: (props) => <svg data-testid="plus-icon" {...props} />,
  XMarkIcon: (props) => <svg data-testid="x-icon" {...props} />
}))

vi.mock('../components/quest/QuestCard', () => ({
  default: ({ quest, onClick }) => (
    <div data-testid={`quest-card-${quest.id}`} onClick={onClick}>
      <span>{quest.title}</span>
    </div>
  )
}))

vi.mock('../components/CreateQuestModal', () => ({
  default: ({ isOpen, onClose }) => isOpen ? (
    <div data-testid="create-quest-modal">
      <button onClick={onClose}>Close</button>
    </div>
  ) : null
}))

vi.mock('../components/ui/Skeleton', () => ({
  SkeletonCard: () => <div data-testid="skeleton-card" />
}))

import api from '../services/api'

function renderQuestDiscovery(initialRoute = '/quests') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/quests" element={<QuestDiscovery />} />
          <Route path="/quests/:id" element={<div>Quest Detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('QuestDiscovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = { user: { id: 'user-1', role: 'student' } }

    // Default: topics load successfully, quests load successfully
    api.get.mockImplementation((url) => {
      if (url.includes('/api/quests/topics')) {
        return Promise.resolve({
          data: {
            success: true,
            topics: [
              { name: 'Creative', count: 5 },
              { name: 'Science', count: 3 },
              { name: 'Building', count: 2 }
            ]
          }
        })
      }
      if (url.includes('/api/quests')) {
        return Promise.resolve({
          data: {
            data: [
              { id: 'q1', title: 'Build a Robot', description: 'Robotics quest' },
              { id: 'q2', title: 'Paint a Mural', description: 'Art quest' },
              { id: 'q3', title: 'Lab Experiment', description: 'Lab quest' }
            ],
            meta: { total: 3 },
            links: { next: null }
          }
        })
      }
      return Promise.resolve({ data: {} })
    })
  })

  // --- Rendering ---
  describe('rendering', () => {
    it('renders page heading', async () => {
      renderQuestDiscovery()
      expect(screen.getByText('Discover Your Next Adventure')).toBeInTheDocument()
    })

    it('renders search input', () => {
      renderQuestDiscovery()
      expect(screen.getByPlaceholderText('Search quests...')).toBeInTheDocument()
    })

    it('renders quest count after loading', async () => {
      renderQuestDiscovery()
      await waitFor(() => {
        expect(screen.getByText('3 quests')).toBeInTheDocument()
      })
    })

    it('renders create quest button for authenticated users', () => {
      renderQuestDiscovery()
      expect(screen.getByText('Create Quest')).toBeInTheDocument()
    })

    it('does not render create quest button for unauthenticated users', () => {
      authState = { user: null }
      renderQuestDiscovery()
      expect(screen.queryByText('Create Quest')).not.toBeInTheDocument()
    })
  })

  // --- Quest grid ---
  describe('quest grid', () => {
    it('shows skeleton cards while loading', () => {
      api.get.mockImplementation(() => new Promise(() => {})) // never resolves
      renderQuestDiscovery()
      expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0)
    })

    it('renders quest cards after loading', async () => {
      renderQuestDiscovery()
      await waitFor(() => {
        expect(screen.getByTestId('quest-card-q1')).toBeInTheDocument()
        expect(screen.getByTestId('quest-card-q2')).toBeInTheDocument()
        expect(screen.getByTestId('quest-card-q3')).toBeInTheDocument()
      })
    })

    it('displays quest titles', async () => {
      renderQuestDiscovery()
      await waitFor(() => {
        expect(screen.getByText('Build a Robot')).toBeInTheDocument()
        expect(screen.getByText('Paint a Mural')).toBeInTheDocument()
      })
    })
  })

  // --- Topic filters ---
  describe('topic filters', () => {
    it('renders topic chips after loading', async () => {
      renderQuestDiscovery()
      await waitFor(() => {
        expect(screen.getByText(/Creative/)).toBeInTheDocument()
        expect(screen.getByText(/Science/)).toBeInTheDocument()
        expect(screen.getByText(/Building/)).toBeInTheDocument()
      })
    })

    it('displays topic counts', async () => {
      renderQuestDiscovery()
      await waitFor(() => {
        expect(screen.getByText(/\(5\)/)).toBeInTheDocument()
        expect(screen.getByText(/\(3\)/)).toBeInTheDocument()
      })
    })
  })

  // --- Empty state ---
  describe('empty state', () => {
    it('shows empty state when no quests found', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/api/quests/topics')) {
          return Promise.resolve({ data: { success: true, topics: [] } })
        }
        return Promise.resolve({
          data: { data: [], meta: { total: 0 }, links: {} }
        })
      })

      renderQuestDiscovery()
      await waitFor(() => {
        expect(screen.getByText('No quests found')).toBeInTheDocument()
      })
    })

    it('shows create first quest button in empty state for authenticated users', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/api/quests/topics')) {
          return Promise.resolve({ data: { success: true, topics: [] } })
        }
        return Promise.resolve({
          data: { data: [], meta: { total: 0 }, links: {} }
        })
      })

      renderQuestDiscovery()
      await waitFor(() => {
        expect(screen.getByText('Create Your First Quest')).toBeInTheDocument()
      })
    })
  })

  // --- Error state ---
  describe('error state', () => {
    it('shows error message on fetch failure', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/api/quests/topics')) {
          return Promise.resolve({ data: { success: true, topics: [] } })
        }
        return Promise.reject(new Error('Network error'))
      })

      renderQuestDiscovery()
      await waitFor(() => {
        expect(screen.getByText('Failed to load quests. Please try again.')).toBeInTheDocument()
      })
    })
  })

  // --- Search ---
  describe('search', () => {
    it('updates search input value', () => {
      renderQuestDiscovery()
      const input = screen.getByPlaceholderText('Search quests...')
      fireEvent.change(input, { target: { value: 'robot' } })
      expect(input.value).toBe('robot')
    })
  })
})
