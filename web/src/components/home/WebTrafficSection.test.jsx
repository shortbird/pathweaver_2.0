import { cloneElement } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import WebTrafficSection, { topShare, truncateLabel, funnelStages, stepRate } from './WebTrafficSection'
import api from '../../services/api'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn() }
}))

// recharts measures its container with ResizeObserver, which jsdom lacks;
// hand each chart a fixed box instead so it lays out real axes and ticks.
vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts')
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => (
      <div data-testid="chart">{cloneElement(children, { width: 480, height: 240 })}</div>
    ),
  }
})

const payload = {
  configured: true,
  period_days: 30,
  days: [
    { day: '2026-09-16', users: 40, sessions: 50 },
    { day: '2026-09-17', users: 20, sessions: 30 },
    { day: '2026-09-18', users: 0, sessions: 0 },
  ],
  channels: [
    { name: 'Organic Search', sessions: 48 },
    { name: 'Direct', sessions: 32 },
  ],
  pages: [
    { path: '/', views: 120 },
    { path: '/classes', views: 15 },
  ],
  funnel: {
    site_visitors: 400, signup_page_visitors: 40, accounts_independent: 10, accounts_school: 90,
  },
}

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <WebTrafficSection />
    </QueryClientProvider>
  )
}

describe('WebTrafficSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is absent when Google Analytics is not configured', async () => {
    api.get.mockResolvedValue({ data: { configured: false } })
    const { container } = renderSection()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('region', { name: 'Website traffic' })).not.toBeInTheDocument()
  })

  it('is absent when the endpoint fails, never an error wall', async () => {
    api.get.mockRejectedValue(new Error('502'))
    const { container } = renderSection()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('asks for the selected window and renders the four cards from it', async () => {
    api.get.mockResolvedValue({ data: payload })
    renderSection()

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Website traffic' })).toBeInTheDocument()
    })
    expect(api.get).toHaveBeenCalledWith('/api/admin/platform-metrics/analytics', { params: { days: 30 } })

    // Visitors: the honest headline is the per-day mean, not a double-counting sum.
    const visitors = screen.getByRole('region', { name: 'Visitors' })
    expect(visitors).toHaveTextContent('20')
    expect(visitors).toHaveTextContent('average per day over 30 days · 80 sessions')

    // Breakdowns lead with the top row's share of the window's sessions as
    // the number, and name the row in the subtitle (a hostname at headline
    // size overflows a phone-width card).
    const channels = screen.getByRole('region', { name: 'Where visitors come from' })
    expect(channels).toHaveTextContent('60%')
    expect(channels).toHaveTextContent('of sessions from Organic Search over 30 days')
    const pages = screen.getByRole('region', { name: 'Top pages' })
    expect(pages).toHaveTextContent('120')
    expect(pages).toHaveTextContent('views of / over 30 days')
    // The funnel replaced "Traffic by site": its headline is the first step's
    // rate, each stage carries its step rate, and school-made accounts are
    // named beside the funnel, not inside it.
    expect(screen.queryByRole('region', { name: 'Traffic by site' })).not.toBeInTheDocument()
    const funnel = screen.getByRole('region', { name: 'Sign-up funnel' })
    expect(funnel).toHaveTextContent('10%')
    expect(funnel).toHaveTextContent('of marketing-site visitors opened a sign-up page over 30 days')
    expect(funnel).toHaveTextContent('Created an account themselves10 · 25% of the step before')
    expect(funnel).toHaveTextContent('Schools also created 90 accounts')

    // recharts hands tickFormatter (value, index); a category label must never
    // lose characters to the index. "Direct" sits at index 1.
    const labels = channels.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick-value tspan')
    expect([...labels].map(l => l.textContent)).toEqual(['Organic Search', 'Direct'])
  })

  it('refetches for the window the toggle selects', async () => {
    api.get.mockResolvedValue({ data: payload })
    renderSection()
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Website traffic' })).toBeInTheDocument()
    })

    screen.getByRole('button', { name: '7d' }).click()

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/admin/platform-metrics/analytics', { params: { days: 7 } })
    })
    // The previous window's cards stay up while the new one loads.
    expect(screen.getByRole('region', { name: 'Website traffic' })).toBeInTheDocument()
  })
})

describe('topShare', () => {
  it('names the top row and its share of the total', () => {
    expect(topShare([{ name: 'Direct', sessions: 30 }, { name: 'Referral', sessions: 10 }], 'sessions', 100))
      .toEqual({ name: 'Direct', pct: 30 })
  })

  it('falls back to host and path names', () => {
    expect(topShare([{ host: 'app.optioeducation.com', sessions: 5 }], 'sessions', 10).name)
      .toBe('app.optioeducation.com')
  })

  it('is null with no rows, a zero top row, or a zero total — 0% and no-data differ', () => {
    expect(topShare([], 'sessions', 10)).toBeNull()
    expect(topShare([{ name: 'Direct', sessions: 0 }], 'sessions', 10)).toBeNull()
    expect(topShare([{ name: 'Direct', sessions: 3 }], 'sessions', 0)).toBeNull()
  })
})

describe('truncateLabel', () => {
  it('keeps short labels whole and shortens long ones in the middle', () => {
    expect(truncateLabel('/classes')).toBe('/classes')
    // The surface survives at the head, the distinctive part at the tail.
    expect(truncateLabel('/courses/6c963eb3-0b5f-4660-9b26-cb935db44a84')).toBe('/courses/6c96…935db44a84')
    expect(truncateLabel('/quests/abcdef0123456789/curriculum', 16)).toBe('/quests/…riculum')
    expect(truncateLabel(undefined)).toBe('')
  })
})

describe('funnelStages', () => {
  it('orders the stages and gives each its rate from the step before', () => {
    const stages = funnelStages({ site_visitors: 200, signup_page_visitors: 50, accounts_independent: 5 })
    expect(stages.map(s => [s.key, s.value, s.rate])).toEqual([
      ['site', 200, null], ['signup', 50, 25], ['accounts', 5, 10],
    ])
  })

  it('leaves out a stage the server could not count rather than drawing a zero', () => {
    const stages = funnelStages({ site_visitors: 200, signup_page_visitors: 50 })
    expect(stages.map(s => s.key)).toEqual(['site', 'signup'])
  })

  it('has no rate without a base', () => {
    expect(stepRate(5, 0)).toBeNull()
    expect(funnelStages(null)).toEqual([])
  })
})
