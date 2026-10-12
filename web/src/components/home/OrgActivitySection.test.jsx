import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import OrgActivitySection, { attentionReasons, trend, sortRows, activeChange } from './OrgActivitySection'
import PipelinesSection, { ageDays, pct } from './PipelinesSection'
import api from '../../services/api'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn() }
}))

const org = (over = {}) => ({
  organization_id: 'o1', name: 'School', members: 40, students: 20,
  active_users: 20, active_users_prev: 18, active_students: 10,
  tasks: 30, tasks_prev: 25, evidence: 5, messages: 3,
  quiet_students: 0, open_alerts: 0, last_seen: '2026-10-12T10:00:00Z', ...over,
})

function renderWith(ui) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('attentionReasons', () => {
  it('flags the school where almost nobody shows up', () => {
    // Williamsburg on 2026-10-12: 47 members, 1 active.
    expect(attentionReasons(org({ members: 47, active_users: 1, active_users_prev: 1, tasks: 0 })))
      .toEqual(['few people active', 'no tasks done'])
  })

  it('flags a school whose activity halved', () => {
    expect(attentionReasons(org({ active_users: 10, active_users_prev: 20 }))).toEqual(['activity halved'])
  })

  it('leaves a healthy school and a tiny one alone', () => {
    expect(attentionReasons(org())).toEqual([])
    // Too few people to judge: a one-person test org is not a problem.
    expect(attentionReasons(org({ members: 1, active_users: 0, tasks: 0 }))).toEqual([])
  })
})

describe('trend', () => {
  it('reports direction and size against the previous window', () => {
    expect(trend(30, 20)).toEqual({ dir: 'up', pct: 50 })
    expect(trend(10, 20)).toEqual({ dir: 'down', pct: -50 })
    expect(trend(21, 20).dir).toBe('flat')
    expect(trend(5, 0)).toEqual({ dir: 'up', pct: null })
    expect(trend(0, 0)).toBeNull()
  })
})

describe('sortRows', () => {
  it('sorts by the active share, not the raw count', () => {
    const rows = [org({ name: 'Big', members: 100, active_users: 20 }), org({ name: 'Small', members: 10, active_users: 8 })]
    expect(sortRows(rows, { key: 'share', dir: 'desc' }).map(r => r.name)).toEqual(['Small', 'Big'])
  })
})

describe('activeChange and the default sort', () => {
  it('puts the biggest drop in active people first, and rows with no last period last', () => {
    const rows = [
      org({ name: 'Steady', active_users: 20, active_users_prev: 20 }),
      org({ name: 'New', active_users: 5, active_users_prev: 0 }),
      org({ name: 'Falling', active_users: 6, active_users_prev: 20 }),
      org({ name: 'Rising', active_users: 30, active_users_prev: 20 }),
    ]
    expect(activeChange(rows[2])).toBe(-70)
    expect(activeChange(rows[1])).toBeNull()
    expect(sortRows(rows, { key: 'change', dir: 'asc' }).map(r => r.name))
      .toEqual(['Falling', 'Steady', 'Rising', 'New'])
  })
})

describe('OrgActivitySection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists every organization, counts the flagged ones, and filters to them', async () => {
    api.get.mockResolvedValue({ data: { period_days: 30, orgs: [
      org({ organization_id: 'a', name: 'Busy School' }),
      org({ organization_id: 'b', name: 'Williamsburg', members: 47, active_users: 1, tasks: 0 }),
      org({ organization_id: null, name: 'No organization', members: 300, active_users: 150 }),
    ] } })
    renderWith(<OrgActivitySection />)

    const region = await screen.findByRole('region', { name: 'Activity by organization' })
    await waitFor(() => expect(region).toHaveTextContent('1 of 3 need a look'))
    expect(api.get).toHaveBeenCalledWith('/api/admin/platform-metrics/orgs', { params: { days: 30 } })
    expect(within(region).getByRole('link', { name: 'Williamsburg' }))
      .toHaveAttribute('href', '/admin/organizations/b')
    expect(region).toHaveTextContent('few people active, no tasks done')
    // Only the columns that say whether to reach out (2026-10-12).
    const headers = within(region).getAllByRole('columnheader').map(h => h.textContent.replace(/ [↑↓]$/, ''))
    expect(headers).toEqual(['Organization (members)', 'Active people', 'vs. last period', 'Tasks done', 'Last seen'])

    // Least restrictive by default: every row shows until the box is ticked.
    expect(within(region).getAllByRole('row')).toHaveLength(4)
    fireEvent.click(within(region).getByRole('checkbox'))
    expect(within(region).getAllByRole('row')).toHaveLength(2)
  })

  it('is absent when the source fails', async () => {
    api.get.mockRejectedValue(new Error('down'))
    renderWith(<OrgActivitySection />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Activity by organization' })).not.toBeInTheDocument())
  })
})

describe('PipelinesSection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('leads each card with the number somebody has to act on', async () => {
    const now = Date.now()
    api.get.mockResolvedValue({ data: {
      period_days: 30,
      credit: { waiting_school: 271, waiting_school_oldest: new Date(now - 55 * 86_400_000).toISOString(),
        waiting_optio: 12, waiting_optio_oldest: new Date(now - 21 * 86_400_000).toISOString(),
        requested: 332, approved: 358, sent_back: 21 },
      crm: { leads: 88, converted: 62, in_funnels: 31, delivered: 2372, opened: 211, clicked: 21, bounced: 18 },
      tickets: { open: 4, open_over_7d: 1, oldest_open: new Date(now - 20 * 86_400_000).toISOString(),
        opened: 337, resolved: 391, median_hours_to_resolve: 21.5 },
    } })
    renderWith(<PipelinesSection />)

    const credit = await screen.findByRole('region', { name: 'Credit review' })
    expect(credit).toHaveTextContent('271')
    expect(credit).toHaveTextContent("waiting on a school's approval, oldest 55 days")
    expect(credit).toHaveTextContent('oldest 21d')
    const crm = screen.getByRole('region', { name: 'Leads and email' })
    expect(crm).toHaveTextContent('leads became families over 30 days, of 88 new leads')
    expect(crm).toHaveTextContent('211 · 9%')
    const tickets = screen.getByRole('region', { name: 'Tickets' })
    expect(tickets).toHaveTextContent('open, oldest 20 days')
    expect(tickets).toHaveTextContent('21.5h')
  })
})

describe('pipeline helpers', () => {
  it('ages and percentages degrade to null, never NaN', () => {
    expect(ageDays(null)).toBeNull()
    expect(ageDays('2026-10-10T00:00:00Z', new Date('2026-10-12T12:00:00Z'))).toBe(2)
    expect(pct(1, 0)).toBeNull()
    expect(pct(1, 4)).toBe(25)
  })
})
