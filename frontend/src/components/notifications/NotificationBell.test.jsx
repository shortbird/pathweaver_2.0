import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotificationBell from './NotificationBell'

let authState = {}

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}))

vi.mock('../../hooks/api/useNotifications', () => ({
  useNotificationSubscription: vi.fn()
}))

vi.mock('date-fns', () => ({
  formatDistanceToNow: () => '5 minutes ago'
}))

vi.mock('@heroicons/react/24/outline', () => ({
  BellIcon: (props) => <svg data-testid="bell-outline" {...props} />,
  XMarkIcon: (props) => <svg data-testid="x-icon" {...props} />
}))

vi.mock('@heroicons/react/24/solid', () => ({
  BellIcon: (props) => <svg data-testid="bell-solid" {...props} />
}))

import api from '../../services/api'

const mockNotifications = [
  { id: 'n1', title: 'New badge earned', message: 'You earned Explorer badge', is_read: false, type: 'badge', created_at: '2025-01-01T00:00:00Z', link: '/badges' },
  { id: 'n2', title: 'Quest completed', message: 'Congrats on finishing!', is_read: true, type: 'quest', created_at: '2025-01-01T00:00:00Z', link: '/quests' }
]

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>
  )
}

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = { user: { id: 'user-1' } }
    api.get.mockResolvedValue({
      data: { notifications: mockNotifications, unread_count: 1 }
    })
    api.put.mockResolvedValue({ data: {} })
    api.delete.mockResolvedValue({ data: {} })
  })

  describe('rendering', () => {
    it('renders bell button', async () => {
      renderBell()
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument()
      })
    })

    it('shows unread badge when there are unread notifications', async () => {
      renderBell()
      await waitFor(() => {
        expect(screen.getByText('1')).toBeInTheDocument()
      })
    })

    it('uses solid bell icon when unread notifications exist', async () => {
      renderBell()
      await waitFor(() => {
        expect(screen.getByTestId('bell-solid')).toBeInTheDocument()
      })
    })

    it('uses outline bell icon when no unread notifications', async () => {
      api.get.mockResolvedValue({
        data: { notifications: [], unread_count: 0 }
      })
      renderBell()
      await waitFor(() => {
        expect(screen.getByTestId('bell-outline')).toBeInTheDocument()
      })
    })
  })

  describe('dropdown', () => {
    it('shows dropdown when bell clicked', async () => {
      renderBell()
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /notifications/i }))

      expect(screen.getByText('Notifications')).toBeInTheDocument()
    })

    it('shows notification titles in dropdown', async () => {
      renderBell()
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /notifications/i }))

      expect(screen.getByText('New badge earned')).toBeInTheDocument()
      expect(screen.getByText('Quest completed')).toBeInTheDocument()
    })

    it('shows Mark all read button when unread exist', async () => {
      renderBell()
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /notifications/i }))

      expect(screen.getByText('Mark all read')).toBeInTheDocument()
    })

    it('shows Dismiss all button when notifications exist', async () => {
      renderBell()
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /notifications/i }))

      expect(screen.getByText('Dismiss all')).toBeInTheDocument()
    })

    it('shows View all notifications link', async () => {
      renderBell()
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /notifications/i }))

      expect(screen.getByText('View all notifications')).toBeInTheDocument()
    })

    it('shows empty state when no notifications', async () => {
      api.get.mockResolvedValue({
        data: { notifications: [], unread_count: 0 }
      })
      renderBell()
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /notifications/i }))

      expect(screen.getByText('No notifications yet')).toBeInTheDocument()
    })
  })

  describe('mark as read', () => {
    it('calls mark all read API', async () => {
      renderBell()
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
      fireEvent.click(screen.getByText('Mark all read'))

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/api/notifications/mark-all-read', {})
      })
    })
  })
})
