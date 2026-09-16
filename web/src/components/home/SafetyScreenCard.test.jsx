import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SafetyScreenCard, { surfaceTotals, grandTotals, compactCount } from './SafetyScreenCard'
import * as moderation from '../../services/moderationAPI'

vi.mock('../../services/moderationAPI', () => ({
  getScreenStats: vi.fn(),
}))

const payload = {
  days: 7,
  surfaces: {
    group_message: { screened: 187, clear: 184, flagged: 1, pending: 2, refused: 3, hidden_later: 1 },
    message: { screened: 12, clear: 12, flagged: 0, pending: 0, refused: 0, hidden_later: 0 },
    peer_comment: { screened: 16, clear: 16, flagged: 0, pending: 0, refused: 1, hidden_later: 0 },
  },
  model: { calls: 219, failed_calls: 2, input_tokens: 96400, output_tokens: 3200, cost_usd: 0.084 },
  csam: { matches: 0, unreported: 0 },
  reviews: { reviewed: 40, flagged: 1 },
  csam_provider: 'off',
}

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SafetyScreenCard />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('surfaceTotals', () => {
  it('counts refused texts as screened and held, and hidden-later as held', () => {
    expect(surfaceTotals(payload.surfaces.group_message)).toEqual({ screened: 190, held: 4, waiting: 2, byAdults: 0 })
  })

  it('treats a missing surface as zeros', () => {
    expect(surfaceTotals(undefined)).toEqual({ screened: 0, held: 0, waiting: 0, byAdults: 0 })
  })

  it('sums the surfaces', () => {
    expect(grandTotals(payload.surfaces)).toEqual({ screened: 219, held: 5, waiting: 2, byAdults: 0 })
  })

  it('compacts only large counts', () => {
    expect(compactCount(219)).toBe('219')
    expect(compactCount(96400)).toBe('96.4K')
  })
})

describe('SafetyScreenCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the totals, the per-surface rows, the cost and the holds link', async () => {
    moderation.getScreenStats.mockResolvedValue(payload)
    renderCard()
    await waitFor(() => expect(screen.getByTestId('safety-screen-table')).toBeInTheDocument())
    expect(moderation.getScreenStats).toHaveBeenCalledWith(7)

    expect(screen.getByText('219')).toBeInTheDocument()
    expect(screen.getByText('5 held')).toBeInTheDocument()
    expect(screen.getByText('2 waiting')).toBeInTheDocument()
    expect(screen.getByText(/\$0\.084 model cost over 7 days/)).toBeInTheDocument()

    const classRow = screen.getByRole('row', { name: /class chat/i })
    expect(classRow).toHaveTextContent('190')
    expect(classRow).toHaveTextContent('4')
    expect(classRow).toHaveTextContent('2')

    expect(screen.getByText(/219 model calls/)).toBeInTheDocument()
    expect(screen.getByText(/2 failed/)).toBeInTheDocument()
    expect(screen.getByText('Review holds').closest('a')).toHaveAttribute('href', '/admin/moderation?tab=holds')
    // The hash match says out loud that it is not configured.
    expect(screen.getByText('off (no provider key)')).toBeInTheDocument()
    expect(screen.getByText('40 read, 1 flagged')).toBeInTheDocument()
  })

  it('counts matches and unreported incidents once a provider is on', async () => {
    moderation.getScreenStats.mockResolvedValue({
      ...payload, csam_provider: 'photodna', csam: { matches: 2, unreported: 1 },
      surfaces: { ...payload.surfaces, message: { ...payload.surfaces.message, refused: 1, by_adults: 1 } },
    })
    renderCard()
    expect(await screen.findByText('2 matches, 1 unreported')).toBeInTheDocument()
    expect(screen.getByText('(1 by adults)')).toBeInTheDocument()
  })

  it('refetches for the chosen window', async () => {
    moderation.getScreenStats.mockResolvedValue(payload)
    renderCard()
    await waitFor(() => expect(screen.getByTestId('safety-screen-table')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '30d' }))
    await waitFor(() => expect(moderation.getScreenStats).toHaveBeenCalledWith(30))
  })

  it('renders nothing when the source fails', async () => {
    moderation.getScreenStats.mockRejectedValue(new Error('500'))
    const { container } = renderCard()
    await waitFor(() => expect(moderation.getScreenStats).toHaveBeenCalled())
    await waitFor(() => expect(container.querySelector('section')).toBeNull())
  })
})
