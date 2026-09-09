import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BountyBoardPage from './BountyBoardPage'

// A parent poster with two submitted claims across their posted bounties.
// vi.mock factories are hoisted above module-level consts, so shared fixtures
// live in vi.hoisted() to be reachable from the factories below.
const { bounty, stubMutation } = vi.hoisted(() => ({
  stubMutation: () => ({ mutate: () => {}, isPending: false }),
  bounty: {
    id: 'b-1',
    title: 'Build a Bird Feeder',
    description: 'Make one',
    pillar: 'stem',
    xp_reward: 100,
    deliverables: [{ id: 'd1', text: 'Photo of feeder' }],
    claims: [
      {
        id: 'claim-1', status: 'submitted', submitted_at: '2026-03-18T10:00:00Z',
        student: { display_name: 'Alice Adams' },
        evidence: { deliverable_evidence: { d1: [{ type: 'text', content: { text: 'a' } }] } },
      },
      {
        id: 'claim-2', status: 'submitted', submitted_at: '2026-03-20T10:00:00Z',
        student: { display_name: 'Bob Brown' },
        evidence: { deliverable_evidence: { d1: [{ type: 'text', content: { text: 'b' } }] } },
      },
    ],
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'parent-1', role: 'parent' }, effectiveRole: 'parent' }),
}))

vi.mock('../hooks/api/useBounties', () => ({
  useBounties: () => ({ data: [], isLoading: false }),
  useMyClaims: () => ({ data: [], isLoading: false }),
  useMyPostedBounties: () => ({ data: [bounty], isLoading: false }),
  useToggleDeliverable: stubMutation,
  useDeleteBounty: stubMutation,
  useDeleteEvidence: stubMutation,
  useTurnInBounty: stubMutation,
  useAbandonClaim: stubMutation,
  useClaimBounty: stubMutation,
  useReviewBounty: stubMutation,
}))

// Keep the modals inert so we don't pull in their dependency trees.
vi.mock('../components/evidence/AddEvidenceModal', () => ({ default: () => null }))
vi.mock('../components/bounty/EvidenceViewerModal', () => ({ default: () => null }))
vi.mock('../services/api', () => ({ default: { post: vi.fn() } }))

function renderAt(url) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <BountyBoardPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('BountyBoardPage — review deep link', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  it('opens the review tab, highlights the targeted claim, and floats it first', async () => {
    // Notification link for Bob's submission (claim-2), even though Alice's is older.
    renderAt('/bounties?tab=review&bounty=b-1&claim=claim-2')

    const highlighted = await screen.findByTestId('highlighted-submission')
    // The highlighted card is Bob's submission.
    expect(highlighted).toHaveTextContent('Bob Brown')

    // Floated to the top: Bob appears before Alice in document order.
    const names = screen.getAllByText(/Adams|Brown/).map(n => n.textContent)
    expect(names[0]).toContain('Bob Brown')
    expect(names.some(n => n.includes('Alice Adams'))).toBe(true)
  })

  it('does not highlight anything without a claim param', async () => {
    renderAt('/bounties?tab=review')
    await waitFor(() => expect(screen.getByText('Bob Brown')).toBeInTheDocument())
    expect(screen.queryByTestId('highlighted-submission')).not.toBeInTheDocument()
  })
})
