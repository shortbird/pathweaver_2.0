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

  /**
   * Gryffin, 2026-09-04: a teacher-sent reminder reached a parent as an alert
   * that did nothing when clicked. The row was a link to the page the reader
   * was already on, and the message under it was clipped to two lines — so the
   * substance ("still to do: ...") was only readable after a detour through
   * /notifications. Opening it here is what makes the alert worth clicking.
   */
  describe('opening a notification', () => {
    const reminder = {
      id: 'n3',
      title: 'A reminder about unfinished work',
      message: 'Still to do in Algebra — Bridge Building: Sketch designs, Measure the span',
      is_read: false,
      type: 'announcement',
      created_at: '2025-01-01T00:00:00Z',
      link: '/parent/dashboard/kid-1'
    }

    const openReminder = async () => {
      api.get.mockResolvedValue({ data: { notifications: [reminder], unread_count: 1 } })
      renderBell()
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
      fireEvent.click(screen.getByText('A reminder about unfinished work'))
    }

    it('shows the full message in place, without a trip to /notifications', async () => {
      await openReminder()
      // 'Announcement' is the detail modal's type badge and appears nowhere in
      // the dropdown -- it is what distinguishes "opened here" from "navigated".
      expect(await screen.findByText('Announcement')).toBeInTheDocument()
      expect(screen.getByText(/Measure the span/)).toBeInTheDocument()
    })

    it('still offers the link as an action', async () => {
      await openReminder()
      const cta = await screen.findByRole('link', { name: /view details/i })
      expect(cta).toHaveAttribute('href', '/parent/dashboard/kid-1')
    })

    it('marks the notification read when opened', async () => {
      await openReminder()
      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/api/notifications/n3/read', {})
      })
    })
  })
})
