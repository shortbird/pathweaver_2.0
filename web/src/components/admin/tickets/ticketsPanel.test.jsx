import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import TicketsPanel from './TicketsPanel'

/**
 * The ticket tracker at /admin/tickets.
 *
 * What these hold down: the list reads the tracker's endpoint with the
 * status the tab names, opening a row shows the ticket, and "Mark resolved"
 * is one PATCH carrying status=resolved -- the same write Claude Code makes
 * over the MCP, so a ticket closed either way reads the same.
 */
const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), patch: vi.fn() } }))
vi.mock('../../../services/api', () => ({ default: api }))
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const TICKET = {
  id: 'abc-123',
  title: 'Roster export drops the phone column',
  message: 'Export a roster to CSV.\nThe phone column is missing.',
  type: 'bug',
  priority: 'normal',
  status: 'new',
  source: 'web',
  platform: 'web-sis',
  current_route: '/reports',
  user_email: 'office@school.org',
  user_role: 'org_admin',
  users: { first_name: 'Lee', last_name: 'Office', display_name: null },
  organizations: { name: 'iCreate', slug: 'icreate' },
  created_at: '2026-09-14T17:20:40Z',
  updated_at: '2026-09-14T17:20:40Z',
}

const renderAt = (path) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/tickets" element={<TicketsPanel />} />
        <Route path="/admin/tickets/:ticketId" element={<TicketsPanel />} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>
)

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url === '/api/bug-reports/summary') {
      return Promise.resolve({ data: { counts: { new: 1, triaged: 0, fixing: 0, resolved: 4, wont_fix: 0, open: 1 } } })
    }
    if (url === `/api/bug-reports/${TICKET.id}`) {
      return Promise.resolve({ data: { report: TICKET } })
    }
    return Promise.resolve({ data: { reports: [TICKET], count: 1, total: 1 } })
  })
})

describe('TicketsPanel', () => {
  it('lists open tickets by default, with the org and the page', async () => {
    renderAt('/admin/tickets')
    expect(await screen.findByText('Roster export drops the phone column')).toBeInTheDocument()
    // From: the reporter's name, then the org they belong to.
    expect(screen.getByText('Lee Office')).toBeInTheDocument()
    expect(screen.getByText('iCreate')).toBeInTheDocument()
    expect(screen.getByText('/reports')).toBeInTheDocument()
    expect(screen.queryByText('Priority')).toBeNull()
    const listCall = api.get.mock.calls.find(([url]) => url === '/api/bug-reports')
    expect(listCall[1].params.status).toBe('open')
  })

  it('shows a Sentry ticket as from Sentry, not from the user who hit the error', async () => {
    const sentryTicket = {
      ...TICKET,
      id: 'sentry-1',
      title: "[backend] KeyError: 'organization_id'",
      source: 'sentry',
      platform: 'backend',
      user_email: 'kellee@horizon.example',
      user_role: null,
      users: null,
      organizations: null,
    }
    api.get.mockImplementation((url) => {
      if (url === '/api/bug-reports/summary') {
        return Promise.resolve({ data: { counts: { new: 1, triaged: 0, fixing: 0, resolved: 0, wont_fix: 0, open: 1 } } })
      }
      if (url === `/api/bug-reports/${sentryTicket.id}`) {
        return Promise.resolve({ data: { report: sentryTicket } })
      }
      return Promise.resolve({ data: { reports: [sentryTicket], count: 1, total: 1 } })
    })
    renderAt('/admin/tickets')
    expect(await screen.findByText("[backend] KeyError: 'organization_id'")).toBeInTheDocument()
    expect(screen.getByText('Sentry')).toBeInTheDocument()
    expect(screen.queryByText('kellee@horizon.example')).toBeNull()

    fireEvent.click(screen.getByText("[backend] KeyError: 'organization_id'"))
    // The detail keeps the affected user's email under the reporter line.
    expect(await screen.findByText('kellee@horizon.example')).toBeInTheDocument()
    expect(screen.getByText('Sentry alert · backend')).toBeInTheDocument()
  })

  it('asks for the status a tab names', async () => {
    renderAt('/admin/tickets')
    await screen.findByText('Roster export drops the phone column')
    fireEvent.click(screen.getByRole('tab', { name: /Resolved/ }))
    await waitFor(() => {
      const calls = api.get.mock.calls.filter(([url]) => url === '/api/bug-reports')
      expect(calls[calls.length - 1][1].params.status).toBe('resolved')
    })
  })

  it('opens a ticket at its own URL and resolves it with one PATCH', async () => {
    api.patch.mockResolvedValue({ data: { success: true, report: { ...TICKET, status: 'resolved' } } })
    renderAt(`/admin/tickets/${TICKET.id}`)

    expect(await screen.findByText(/Lee Office/)).toBeInTheDocument()
    expect(screen.getByText('office@school.org')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Resolution'), { target: { value: 'Fixed in a1b2c3d.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }))

    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
    expect(api.patch).toHaveBeenCalledWith(`/api/bug-reports/${TICKET.id}`, {
      status: 'resolved',
      resolution: 'Fixed in a1b2c3d.',
    })
  })

  it('offers Reopen, not Resolve, on a closed ticket', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/bug-reports/summary') return Promise.resolve({ data: { counts: {} } })
      if (url === `/api/bug-reports/${TICKET.id}`) {
        return Promise.resolve({ data: { report: { ...TICKET, status: 'resolved', resolved_at: '2026-09-14T18:00:00Z' } } })
      }
      return Promise.resolve({ data: { reports: [], count: 0, total: 0 } })
    })
    renderAt(`/admin/tickets/${TICKET.id}`)
    expect(await screen.findByRole('button', { name: 'Reopen' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark resolved' })).toBeNull()
  })
})
