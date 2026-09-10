/**
 * Changing a filter has to go back to page 1.
 *
 * Holding page 2 while the filter narrows asks the API for an offset past the
 * end of the smaller result set. PostgREST answers that range with 416 rather
 * than an empty page, so the endpoint 500'd and the dashboard rendered empty
 * with no way back to the rows that were still there -- Sentry OPTIO-WEB-T /
 * OPTIO-BACKEND-83, an admin narrowing the status filter over 44 rows on
 * 2026-09-05.
 *
 * The backend now answers an overrun page with an empty page and the real
 * total. This is the other half: don't ask for it in the first place.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import CreditReviewDashboardPage from './CreditReviewDashboardPage'

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ effectiveRole: 'org_admin', user: { id: 'admin-1' } }),
}))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

import api from '../services/api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// 100 rows over 50 per page: two pages, so the Next button renders.
const ITEMS = Array.from({ length: 3 }, (_, i) => ({
  completion_id: `c${i}`,
  student_name: `Student ${i}`,
  task_title: `Task ${i}`,
  diploma_status: 'pending_review',
  xp_value: 100,
  evidence_block_count: 1,
}))

const itemsCalls = () =>
  api.get.mock.calls.filter(([url]) => url === '/api/credit-dashboard/items')

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url === '/api/credit-dashboard/items') {
      return Promise.resolve({ data: { data: { items: ITEMS, total: 100 } } })
    }
    return Promise.resolve({ data: { data: {} } })
  })
})

describe('credit dashboard pagination', () => {
  it('returns to page 1 when a filter changes', async () => {
    render(
      <QueryClientProvider client={new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      })}>
        <CreditReviewDashboardPage />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(itemsCalls().length).toBeGreaterThan(0))
    expect(itemsCalls().at(-1)[1].params.page).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(itemsCalls().at(-1)[1].params.page).toBe(2))

    // Narrow the status filter while sitting on page 2.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'finalized' } })

    await waitFor(() => {
      const [, config] = itemsCalls().at(-1)
      expect(config.params.status).toBe('finalized')
      expect(config.params.page).toBe(1)
    })
  })
})
