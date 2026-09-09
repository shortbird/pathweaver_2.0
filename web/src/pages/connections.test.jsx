/**
 * Peer connections — the student's page and the grown-up's page.
 *
 * What's tested is the part that would be unsafe if it broke, not the layout:
 * that there is no way to search for another child, that a student of unknown
 * age is asked rather than refused, that a confirmed under-13 meets an
 * explanation instead of a form they can retry, and that the approval card
 * actually says what is being consented to.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
vi.mock('../services/api', () => ({ default: api }))

import ConnectionsPage from './ConnectionsPage'
import ConnectionApprovalsPage from './ConnectionApprovalsPage'

const EMPTY = { active: [], incoming: [], outgoing: [], awaiting_approval: [] }

const mockLoad = (eligibility, connections = EMPTY) => {
  api.get.mockImplementation((url) => {
    if (url.includes('eligibility')) return Promise.resolve({ data: { data: eligibility } })
    if (url.includes('approvals')) return Promise.resolve({ data: { data: { pending: [], approved: [] } } })
    return Promise.resolve({ data: { data: connections } })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ConnectionsPage', () => {
  it('never offers a way to search for another student', async () => {
    // The safety property, asserted directly. A directory of children is the
    // part of a "friends" feature that lets a stranger reach one; connections
    // here start from a code handed over in person. If a search box ever
    // appears, this test should fail loudly rather than the reviewer noticing.
    mockLoad({ state: 'eligible', reason: null })
    render(<ConnectionsPage />)

    await screen.findByText('Your code')

    expect(screen.queryByPlaceholderText(/search/i)).toBeNull()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByText(/find (a )?student/i)).toBeNull()
    expect(screen.queryByText(/people you may know/i)).toBeNull()
  })

  it('asks a student of unknown age for their birthday instead of refusing them', async () => {
    // 223 of 522 students are in this state. Treating unknown age as a refusal
    // would silently remove the one entry point that can resolve it.
    mockLoad({ state: 'needs_dob', reason: 'We need your date of birth first.' })
    render(<ConnectionsPage />)

    expect(await screen.findByLabelText(/what's your date of birth/i)).toBeInTheDocument()
  })

  it('does not tell the student the age rule before asking the question', async () => {
    // Leading with "you must be 13+" turns the field into a multiple-choice
    // question with one obviously correct answer.
    mockLoad({ state: 'needs_dob', reason: 'We need your date of birth first.' })
    render(<ConnectionsPage />)

    await screen.findByLabelText(/what's your date of birth/i)
    expect(screen.queryByText(/13/)).toBeNull()
  })

  it('warns that the birthday answer is final', async () => {
    mockLoad({ state: 'needs_dob', reason: 'x' })
    render(<ConnectionsPage />)

    expect(await screen.findByText(/only answer this once/i)).toBeInTheDocument()
  })

  it('gives a confirmed under-13 an explanation, not a retryable form', async () => {
    mockLoad({
      state: 'under_13',
      reason: 'Connecting with other students is available once you turn 13.',
    })
    render(<ConnectionsPage />)

    expect(await screen.findByText(/available once you turn 13/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/date of birth/i)).toBeNull()
    expect(screen.queryByLabelText(/enter their code/i)).toBeNull()
  })

  it('points a dependent at their parent rather than at a form they cannot use', async () => {
    mockLoad({
      state: 'needs_parent_dob',
      reason: 'Your parent needs to add your date of birth before you can connect.',
    })
    render(<ConnectionsPage />)

    expect(await screen.findByText(/your parent needs to add/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/what's your date of birth/i)).toBeNull()
  })

  it('sends a request by code and says approval is still needed', async () => {
    // The success message must not read as "you are now connected" — two
    // students and two grown-ups still have to say yes.
    mockLoad({ state: 'eligible', reason: null })
    api.post.mockResolvedValue({ data: { data: { id: 'c1', status: 'pending_addressee' } } })
    render(<ConnectionsPage />)

    const input = await screen.findByLabelText(/enter their code/i)
    await userEvent.type(input, 'abcd2345')
    await userEvent.click(screen.getByRole('button', { name: /send request/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/connections/request', { code: 'ABCD2345' })
    })
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/approve/i))
  })

  it('surfaces the server refusal rather than a generic error', async () => {
    // Every message the service raises is written for a child to read.
    mockLoad({ state: 'eligible', reason: null })
    api.post.mockRejectedValue({
      response: { data: { error: 'That code is not valid or has expired.' } },
    })
    render(<ConnectionsPage />)

    const input = await screen.findByLabelText(/enter their code/i)
    await userEvent.type(input, 'NOSUCH12')
    await userEvent.click(screen.getByRole('button', { name: /send request/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('That code is not valid or has expired.')
    })
  })

  it('tells the student that either side can undo a connection', async () => {
    mockLoad({ state: 'eligible', reason: null })
    render(<ConnectionsPage />)

    expect(await screen.findByText(/can undo a connection at any time/i)).toBeInTheDocument()
  })

  it('lets a student remove an active connection', async () => {
    mockLoad({ state: 'eligible', reason: null }, {
      ...EMPTY,
      active: [{ id: 'c1', status: 'active', peer: { id: 'p1', display_name: 'Ada' }, created_at: '' }],
    })
    api.post.mockResolvedValue({ data: { data: { id: 'c1', status: 'revoked' } } })
    render(<ConnectionsPage />)

    await userEvent.click(await screen.findByRole('button', { name: /remove/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/connections/c1/revoke', {})
    })
  })
})

describe('ConnectionApprovalsPage', () => {
  const PENDING = [{
    id: 'a1',
    connection_id: 'c1',
    approver_kind: 'parent',
    child: { id: 'k1', display_name: 'Ada' },
    peer: { id: 'p1', display_name: 'Linus' },
    requested_at: '',
  }]

  it('spells out what the approval authorises', async () => {
    // This is the only place the disclosure is stated. A card that says
    // "approve connection?" and nothing else collects a click, not a consent.
    api.get.mockResolvedValue({ data: { data: { pending: PENDING, approved: [] } } })
    render(<ConnectionApprovalsPage />)

    expect(await screen.findByText(/see the other's portfolio and work/i)).toBeInTheDocument()
    expect(screen.getByText(/leave comments on that work/i)).toBeInTheDocument()
    expect(screen.getByText(/not see each other's email address or birthday/i)).toBeInTheDocument()
    expect(screen.getByText(/undo this at any time/i)).toBeInTheDocument()
  })

  it('names both children so a parent knows who is involved', async () => {
    api.get.mockResolvedValue({ data: { data: { pending: PENDING, approved: [] } } })
    render(<ConnectionApprovalsPage />)

    expect(await screen.findByText(/Ada wants to connect with Linus/)).toBeInTheDocument()
  })

  it('tells a school admin why they are the one being asked', async () => {
    api.get.mockResolvedValue({
      data: { data: { pending: [{ ...PENDING[0], approver_kind: 'org_admin' }], approved: [] } },
    })
    render(<ConnectionApprovalsPage />)

    expect(await screen.findByText(/as this student's school administrator/i)).toBeInTheDocument()
    expect(screen.getByText(/both students are at your school/i)).toBeInTheDocument()
  })

  it('posts the decision for the right connection', async () => {
    api.get.mockResolvedValue({ data: { data: { pending: PENDING, approved: [] } } })
    api.post.mockResolvedValue({ data: { data: { id: 'c1', status: 'active' } } })
    render(<ConnectionApprovalsPage />)

    await userEvent.click(await screen.findByRole('button', { name: /approve/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/connections/c1/approve', { approve: true })
    })
  })

  it('posts a decline as a decline', async () => {
    api.get.mockResolvedValue({ data: { data: { pending: PENDING, approved: [] } } })
    api.post.mockResolvedValue({ data: { data: { id: 'c1', status: 'declined' } } })
    render(<ConnectionApprovalsPage />)

    await userEvent.click(await screen.findByRole('button', { name: /decline/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/connections/c1/approve', { approve: false })
    })
  })

  // Approval is not the end of a parent's involvement. Before this section
  // existed, a parent who changed their mind had nothing to click.
  describe('managing connections after approval', () => {
    const APPROVED = [{
      connection_id: 'c9',
      approver_kind: 'parent',
      child: { id: 'k1', display_name: 'Ada' },
      peer: { id: 'p1', display_name: 'Linus' },
      approved_at: '2026-08-01T00:00:00Z',
      connected_since: '2026-08-02T00:00:00Z',
    }]

    it('lists connections the parent already approved', async () => {
      api.get.mockResolvedValue({ data: { data: { pending: [], approved: APPROVED } } })
      render(<ConnectionApprovalsPage />)

      expect(await screen.findByText('Ada and Linus')).toBeInTheDocument()
      expect(screen.getByText(/connected since/i)).toBeInTheDocument()
    })

    it('lets the parent end a connection they approved', async () => {
      api.get.mockResolvedValue({ data: { data: { pending: [], approved: APPROVED } } })
      api.post.mockResolvedValue({ data: { data: { id: 'c9', status: 'revoked' } } })
      render(<ConnectionApprovalsPage />)

      await userEvent.click(await screen.findByRole('button', { name: /end connection/i }))

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/connections/c9/revoke', {})
      })
    })

    it('says the parent can act without the other family', async () => {
      // Revocation is unilateral on purpose: consent you can only withdraw with
      // someone else's agreement is not consent.
      api.get.mockResolvedValue({ data: { data: { pending: [], approved: APPROVED } } })
      render(<ConnectionApprovalsPage />)

      expect(await screen.findByText(/without\s+asking the other family/i)).toBeInTheDocument()
    })

    it('still renders the active section when nothing is pending', async () => {
      api.get.mockResolvedValue({ data: { data: { pending: [], approved: [] } } })
      render(<ConnectionApprovalsPage />)

      expect(await screen.findByText(/no active connections yet/i)).toBeInTheDocument()
      expect(screen.getByText(/nothing waiting on you/i)).toBeInTheDocument()
    })
  })
})
