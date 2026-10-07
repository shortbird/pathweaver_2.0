import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import StudentChatCard from './StudentChatCard'
import { settingsCardsFor } from '../settingsRegistry'

/**
 * The school's Student Chat switch. Ticket 81cc92e6, from Horizon: "An option
 * to turn off in-app chat would help, because it can pull students away from
 * their work and bury teacher feedback."
 *
 * What holds: an org admin sees the switch with its plain help text and turns
 * it off with one call; a caller the API refuses (a campus coordinator) sees
 * nothing; and the card stays on the page when the module is off, because
 * the card is how a school turns it back on.
 */

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), put: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { data: { enabled: true } } })
  api.put.mockImplementation((_url, body) =>
    Promise.resolve({ data: { data: { enabled: body.enabled } } }))
})

describe('StudentChatCard', () => {
  it('renders for an org admin with the help text, and turns chat off', async () => {
    render(<StudentChatCard orgId="org-1" />)
    const toggle = await screen.findByRole('switch', { name: 'Student chat' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/When off, students cannot see or send messages in class student chats or to\s+friends\. Messages from teachers and the school still reach them\./)).toBeInTheDocument()

    fireEvent.click(toggle)
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(api.put.mock.calls[0][0]).toBe('/api/messages/student-chat/settings')
    expect(api.put.mock.calls[0][1]).toEqual({ enabled: false, organization_id: 'org-1' })
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'))
  })

  it('renders nothing when the caller is not an org admin', async () => {
    api.get.mockRejectedValue({ response: { status: 403 } })
    const { container } = render(<StudentChatCard orgId="org-1" />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})

describe('settingsCardsFor: the Student chat card', () => {
  const keys = (surface, org) => settingsCardsFor({ surface, org, seesFinance: true }).map((c) => c.key)

  it('is on the SIS Settings page whether the module is on or off', () => {
    expect(keys('console', { feature_flags: {}, effective_modules: ['student_chat'] })).toContain('student-chat')
    expect(keys('console', { feature_flags: {}, effective_modules: [] })).toContain('student-chat')
    expect(keys('learning', { feature_flags: {} })).toContain('student-chat')
  })
})
