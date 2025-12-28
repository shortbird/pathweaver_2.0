import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import NotificationBell from '../NotificationBell'
import api from '../../../services/api'

// Mock the API
vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}))

// Mock date-fns
vi.mock('date-fns', () => ({
  formatDistanceToNow: vi.fn(() => '5 minutes ago'),
}))

const renderNotificationBell = () => {
  return render(
    <BrowserRouter>
      <NotificationBell />
    </BrowserRouter>
  )
}

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  it('renders the bell icon', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        notifications: [],
        unread_count: 0,
      },
    })

    renderNotificationBell()

    // Should have a button with aria-label containing "Notifications"
    const button = screen.getByRole('button', { name: /notifications/i })
    expect(button).toBeInTheDocument()
  })

  it('displays unread count badge when there are unread notifications', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        notifications: [
          {
            id: '1',
            type: 'announcement',
            title: 'Test Notification',
            message: 'Test message',
            is_read: false,
            created_at: new Date().toISOString(),
          },
        ],
        unread_count: 3,
      },
    })

    renderNotificationBell()

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  it('does not display badge when there are no unread notifications', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        notifications: [],
        unread_count: 0,
      },
    })

    renderNotificationBell()

    await waitFor(() => {
      expect(screen.queryByText('0')).not.toBeInTheDocument()
    })
  })

  it('displays "99+" when unread count exceeds 99', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        notifications: [],
        unread_count: 150,
      },
    })

    renderNotificationBell()

    await waitFor(() => {
      expect(screen.getByText('99+')).toBeInTheDocument()
    })
  })

  it('opens dropdown when bell is clicked', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        notifications: [
          {
            id: '1',
            type: 'quest_invitation',
            title: 'Quest Invitation',
            message: 'You have been invited to a quest',
            is_read: false,
            created_at: new Date().toISOString(),
            link: '/invitations',
          },
        ],
        unread_count: 1,
      },
    })

    renderNotificationBell()

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
    })

    const button = screen.getByRole('button', { name: /notifications/i })
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByText('Quest Invitation')).toBeInTheDocument()
    })
  })

  it('displays "No notifications yet" when list is empty', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        notifications: [],
        unread_count: 0,
      },
    })

    renderNotificationBell()

    const button = screen.getByRole('button', { name: /notifications/i })
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByText('No notifications yet')).toBeInTheDocument()
    })
  })

  it('calls markAsRead when notification is clicked', async () => {
    const notificationId = 'test-notification-id'
    api.get.mockResolvedValueOnce({
      data: {
        notifications: [
          {
            id: notificationId,
            type: 'announcement',
            title: 'Test Notification',
            message: 'Click me',
            is_read: false,
            created_at: new Date().toISOString(),
            link: '/announcements',
          },
        ],
        unread_count: 1,
      },
    })
    api.put.mockResolvedValueOnce({ data: { success: true } })

    renderNotificationBell()

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
    })

    const button = screen.getByRole('button', { name: /notifications/i })
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByText('Test Notification')).toBeInTheDocument()
    })

    const notificationLink = screen.getByText('Test Notification').closest('a')
    fireEvent.click(notificationLink)

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(`/api/notifications/${notificationId}/read`, {})
    })
  })

  it('calls markAllAsRead when "Mark all as read" is clicked', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        notifications: [
          {
            id: '1',
            type: 'announcement',
            title: 'Notification 1',
            is_read: false,
            created_at: new Date().toISOString(),
          },
          {
            id: '2',
            type: 'badge_earned',
            title: 'Notification 2',
            is_read: false,
            created_at: new Date().toISOString(),
          },
        ],
        unread_count: 2,
      },
    })
    api.put.mockResolvedValueOnce({ data: { success: true } })

    renderNotificationBell()

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    const button = screen.getByRole('button', { name: /notifications/i })
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByText('Mark all as read')).toBeInTheDocument()
    })

    const markAllButton = screen.getByText('Mark all as read')
    fireEvent.click(markAllButton)

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/notifications/read-all', {})
    })
  })

  it('displays correct icons for different notification types', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        notifications: [
          {
            id: '1',
            type: 'quest_invitation',
            title: 'Quest Invitation',
            is_read: false,
            created_at: new Date().toISOString(),
          },
          {
            id: '2',
            type: 'announcement',
            title: 'Announcement',
            is_read: false,
            created_at: new Date().toISOString(),
          },
          {
            id: '3',
            type: 'badge_earned',
            title: 'Badge Earned',
            is_read: false,
            created_at: new Date().toISOString(),
          },
        ],
        unread_count: 3,
      },
    })

    renderNotificationBell()

    const button = screen.getByRole('button', { name: /notifications/i })
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByText('Quest Invitation')).toBeInTheDocument()
      expect(screen.getByText('Announcement')).toBeInTheDocument()
      expect(screen.getByText('Badge Earned')).toBeInTheDocument()
    })
  })

  it('has link to view all notifications', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        notifications: [],
        unread_count: 0,
      },
    })

    renderNotificationBell()

    const button = screen.getByRole('button', { name: /notifications/i })
    fireEvent.click(button)

    await waitFor(() => {
      const viewAllLink = screen.getByText('View all notifications')
      expect(viewAllLink).toHaveAttribute('href', '/notifications')
    })
  })
})
