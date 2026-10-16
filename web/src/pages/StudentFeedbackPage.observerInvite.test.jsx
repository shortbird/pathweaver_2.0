import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import toast from 'react-hot-toast'
import StudentFeedbackPage from './StudentFeedbackPage'
import api, { observerAPI } from '../services/api'

/**
 * Ticket ecc20c83 (Sentry): an Apogee Cache Valley student clicked "Create an
 * invite link" on /feedback and got a 403 with a bare "parent_required" toast.
 * The 403 is right -- observers are added by parents -- so the page asks
 * /api/observers/my-observers whether this student may invite (can_invite)
 * and, when not, says who to ask instead of offering a button that can only
 * fail. If a 403 still comes back, the toast reads the server's sentence.
 */

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'stu-1' } }),
}))
vi.mock('../contexts/ConfirmContext', () => ({
  useConfirm: () => vi.fn(),
}))
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../services/api', () => ({
  default: { get: vi.fn() },
  observerAPI: {
    getMyObservers: vi.fn(),
    generateInviteLink: vi.fn(),
    removeMyObserver: vi.fn(),
  },
}))
vi.mock('../components/observer/FeedCard', () => ({ default: () => null }))
vi.mock('../components/connections/FeedFriendsCard', () => ({ default: () => null }))
vi.mock('qrcode.react', () => ({ QRCodeSVG: () => null }))

function renderPage() {
  return render(
    <MemoryRouter>
      <StudentFeedbackPage />
    </MemoryRouter>
  )
}

async function openPanels() {
  // One panel on top for mobile, one in the sidebar for desktop; the toggle
  // state is shared, so one click opens both.
  // Wait for my-observers to settle ("0 viewers" replaces "Loading...")
  // before opening the panel. Clicking during the first load timed the
  // tests out.
  await screen.findAllByText('0 viewers')
  const toggles = screen.getAllByText('Observers').map(h => h.closest('button'))
  expect(toggles).toHaveLength(2)
  fireEvent.click(toggles[0])
}

beforeEach(() => {
  toast.error.mockClear()
  observerAPI.generateInviteLink.mockReset()
  observerAPI.getMyObservers.mockReset()
  api.get.mockResolvedValue({ data: { items: [], peer_count: 0 } })
})

describe('StudentFeedbackPage observer invite (ticket ecc20c83)', () => {
  it('shows who to ask, not the button, when can_invite is false', async () => {
    observerAPI.getMyObservers.mockResolvedValue({
      data: { viewers: [], can_invite: false, approver_name: 'Summer' },
    })
    renderPage()
    await openPanels()

    const asks = await screen.findAllByText('Ask Summer to invite someone to follow your learning.')
    expect(asks).toHaveLength(2)
    expect(screen.queryByText('Create an invite link')).toBeNull()
  })

  it('falls back to "a parent or guardian" when no approver name comes back', async () => {
    observerAPI.getMyObservers.mockResolvedValue({
      data: { viewers: [], can_invite: false },
    })
    renderPage()
    await openPanels()

    expect(await screen.findAllByText(
      'Ask a parent or guardian to invite someone to follow your learning.'
    )).toHaveLength(2)
  })

  it('hides the button when the my-observers read fails (default false)', async () => {
    observerAPI.getMyObservers.mockRejectedValue(new Error('network'))
    renderPage()
    await openPanels()

    await screen.findAllByText(/Ask a parent or guardian/)
    expect(screen.queryByText('Create an invite link')).toBeNull()
  })

  it('shows the button when can_invite is true', async () => {
    observerAPI.getMyObservers.mockResolvedValue({
      data: { viewers: [], can_invite: true },
    })
    renderPage()
    await openPanels()

    expect(await screen.findAllByText('Create an invite link')).toHaveLength(2)
    expect(screen.queryByText(/to invite someone to follow your learning/)).toBeNull()
  })

  it('toasts the server message, not the error code, on a 403', async () => {
    observerAPI.getMyObservers.mockResolvedValue({
      data: { viewers: [], can_invite: true },
    })
    observerAPI.generateInviteLink.mockRejectedValue({
      response: {
        status: 403,
        data: {
          error: 'parent_required',
          message: 'Ask Summer to send this invitation. They can invite someone to follow your learning from their account.',
        },
      },
    })
    renderPage()
    await openPanels()

    const [label] = await screen.findAllByText('Create an invite link')
    const button = label.closest('button')
    fireEvent.click(button)

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'Ask Summer to send this invitation. They can invite someone to follow your learning from their account.'
    ))
    expect(toast.error).not.toHaveBeenCalledWith('parent_required')
  })
})
