import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotificationDetailModal, { linksToCurrentPage } from './NotificationDetailModal'

/**
 * 11f6ad24 (iCreate): the bell's "View details" on a school-inbox message
 * linked to '/inbox', the page the reader was already on, so the button only
 * closed the modal. The backend now links the thread itself
 * ('/inbox?tab=school&conversation=<id>'); the modal leaves the button out
 * when following it would go nowhere.
 */

vi.mock('date-fns', () => ({ formatDistanceToNow: () => '5 minutes' }))

const note = (link) => ({
  id: 'n1',
  type: 'message_received',
  title: 'iCreate inbox: message from Pat',
  message: 'hello',
  link,
  metadata: {},
  created_at: '2026-09-22T10:00:00Z',
  is_read: false,
})

const mount = (link, route) => render(
  <MemoryRouter initialEntries={[route]}>
    <NotificationDetailModal notification={note(link)} isOpen onClose={() => {}} />
  </MemoryRouter>,
)

describe('NotificationDetailModal on the page it links to', () => {
  it('hides View Details when the link is the current page', () => {
    mount('/inbox', '/inbox')
    expect(screen.queryByText('View Details')).toBeNull()
  })

  it('hides it for a bare link to the page the reader is on with a tab open', () => {
    mount('/inbox', '/inbox?tab=school')
    expect(screen.queryByText('View Details')).toBeNull()
  })

  it('keeps it when the link opens a thread on this page', () => {
    mount('/inbox?tab=school&conversation=c9', '/inbox?tab=school')
    expect(screen.getByText('View Details').closest('a'))
      .toHaveAttribute('href', '/inbox?tab=school&conversation=c9')
  })

  it('keeps it for a link to another page', () => {
    mount('/inbox?tab=school&conversation=c9', '/dashboard')
    expect(screen.getByText('View Details')).toBeInTheDocument()
  })
})

describe('linksToCurrentPage', () => {
  const at = (pathname, search = '') => ({ pathname, search })

  it('compares paths, ignoring a trailing slash', () => {
    expect(linksToCurrentPage('/inbox/', at('/inbox'))).toBe(true)
    expect(linksToCurrentPage('/tasks', at('/inbox'))).toBe(false)
  })

  it('needs the query to match when the link has one', () => {
    expect(linksToCurrentPage('/inbox?tab=school', at('/inbox', '?tab=school'))).toBe(true)
    expect(linksToCurrentPage('/inbox?group=g1', at('/inbox', '?tab=school'))).toBe(false)
  })

  it('never matches an external link', () => {
    expect(linksToCurrentPage('https://example.com/inbox', at('/inbox'))).toBe(false)
  })
})
