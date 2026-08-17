import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Your own quests, on the homes that are not the student dashboard.
 *
 * iCreate, 2026-08-17. Schools assign training and orientation quests straight
 * onto teacher, admin and family accounts — but none of those roles ever sees
 * the student dashboard, and no role home had a quest surface. The quest
 * existed on the account with nowhere in the app to meet it.
 *
 * The rule this holds down: it earns its space or it takes none. A home that
 * has never been assigned a quest must look exactly as it did before.
 */

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

import MyEnrolledQuests from './MyEnrolledQuests'

const QUEST = {
  id: 'q-1', title: 'Staff onboarding',
  progress: { completed_tasks: 1, total_tasks: 4, percentage: 25 },
}

// The card renders QuestCardSimple, the same one the student dashboard uses,
// which reaches for react-query. In the app that provider is at the root
// (App.jsx); here it is supplied so the real card is under test rather than a
// stand-in for it.
const renderCard = () => render(
  <QueryClientProvider client={new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })}>
    <MemoryRouter><MyEnrolledQuests /></MemoryRouter>
  </QueryClientProvider>
)

beforeEach(() => vi.clearAllMocks())

it('shows the quests on your account, in the card students get', async () => {
  // QuestCardSimple, not a second card design for the same object — hence the
  // strings it owns ("Next up", "Continue") rather than any of our own.
  api.get.mockResolvedValue({ data: { quests: [QUEST] } })
  renderCard()
  expect(await screen.findByText('Staff onboarding')).toBeInTheDocument()
  expect(screen.getByText('Next up')).toBeInTheDocument()
  expect(screen.getByText('Continue')).toBeInTheDocument()
})

it('takes no space at all when nothing is enrolled', async () => {
  // The common case for most homes — it must not leave an empty box behind.
  api.get.mockResolvedValue({ data: { quests: [] } })
  const { container } = renderCard()
  await waitFor(() => expect(api.get).toHaveBeenCalled())
  expect(container).toBeEmptyDOMElement()
})

it('stays out of the way when the request fails', async () => {
  // A home must not break because one card could not load.
  api.get.mockRejectedValue(new Error('offline'))
  const { container } = renderCard()
  await waitFor(() => expect(api.get).toHaveBeenCalled())
  expect(container).toBeEmptyDOMElement()
})

it('shows a quest that was assigned but never opened', async () => {
  api.get.mockResolvedValue({
    data: { quests: [{ id: 'q-2', title: 'Orientation', progress: { total_tasks: 0 } }] },
  })
  renderCard()
  expect(await screen.findByText('Orientation')).toBeInTheDocument()
})

it('counts what is in progress', async () => {
  api.get.mockResolvedValue({ data: { quests: [QUEST, { ...QUEST, id: 'q-3' }] } })
  renderCard()
  expect(await screen.findByText('2 in progress')).toBeInTheDocument()
})
