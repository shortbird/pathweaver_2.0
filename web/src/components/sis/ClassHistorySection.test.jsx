import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * iCreate, ticket fee0d486: "Could we get a place where we can see the history
 * of when classes were added and/or dropped by any particular student?"
 */

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

import ClassHistorySection from './ClassHistorySection'

const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const HISTORY = [
  { id: 'e2', event: 'dropped', class_name: 'Art', occurred_at: '2026-09-20T15:30:00+00:00',
    date_known: true, actor_name: 'Kayla Rose' },
  { id: 'e3', event: 'dropped', class_name: 'Pottery', occurred_at: '2026-08-01T10:00:00+00:00',
    date_known: false, actor_name: null },
  { id: 'e1', event: 'added', class_name: 'Art', occurred_at: '2026-08-01T10:00:00+00:00',
    date_known: true, actor_name: 'Marika Office' },
]

beforeEach(() => vi.clearAllMocks())

describe('ClassHistorySection', () => {
  it('asks for this student in this school', async () => {
    api.get.mockResolvedValue({ data: { history: [] } })
    render(<ClassHistorySection studentId="s1" orgId="org-1" />)
    await screen.findByText('No class changes recorded yet.')
    expect(api.get).toHaveBeenCalledWith('/api/sis/students/s1/class-history?organization_id=org-1')
  })

  it('shows added and dropped events with who did it', async () => {
    api.get.mockResolvedValue({ data: { history: HISTORY } })
    render(<ClassHistorySection studentId="s1" orgId="org-1" />)

    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(within(items[0]).getByText('Art')).toBeInTheDocument()
    expect(within(items[0]).getByText('Dropped')).toBeInTheDocument()
    expect(within(items[0]).getByText(/by Kayla Rose/)).toBeInTheDocument()
    expect(within(items[2]).getByText('Added')).toBeInTheDocument()
    expect(within(items[2]).getByText(/by Marika Office/)).toBeInTheDocument()
  })

  it('says the date was not recorded instead of showing the placeholder date', async () => {
    api.get.mockResolvedValue({ data: { history: HISTORY } })
    render(<ClassHistorySection studentId="s1" orgId="org-1" />)

    const items = await screen.findAllByRole('listitem')
    expect(within(items[1]).getByText('Date not recorded')).toBeInTheDocument()
    expect(within(items[1]).queryByText(/2026/)).toBeNull()
  })

  it('shows the empty state when nothing is recorded', async () => {
    api.get.mockResolvedValue({ data: { history: [] } })
    render(<ClassHistorySection studentId="s1" orgId="org-1" />)
    expect(await screen.findByText('No class changes recorded yet.')).toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })
})
