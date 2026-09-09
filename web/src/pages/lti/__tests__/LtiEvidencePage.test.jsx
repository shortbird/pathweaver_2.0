/**
 * Teacher SpeedGrader evidence page (v1) — token gating + quest-scoped
 * render. Direct fetch (not the api instance), mocked here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LtiEvidencePage from '../LtiEvidencePage'

const PAYLOAD = {
  student: { display_name: 'Jane Doe' },
  quest: { id: 'q1', title: 'Build Something You Care About' },
  earned_xp: 300,
  tasks: [
    {
      id: 't1',
      title: 'Learn the rules',
      pillar: 'stem',
      xp_value: 100,
      is_completed: true,
      completed_at: '2026-05-20T00:00:00Z',
      evidence_blocks: [
        { block_type: 'text', content: { text: 'I did the thing.' }, order_index: 0 },
        {
          block_type: 'link',
          content: { url: 'https://example.com', title: 'My repo' },
          order_index: 1,
        },
      ],
    },
  ],
}

function mockFetch(status, body) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  delete globalThis.fetch
})

function renderAt(query) {
  return render(
    <MemoryRouter initialEntries={[`/lti-evidence${query}`]}>
      <LtiEvidencePage />
    </MemoryRouter>,
  )
}

describe('LtiEvidencePage', () => {
  it('errors when no token is in the URL and never calls the API', async () => {
    mockFetch(200, PAYLOAD)
    renderAt('')
    await waitFor(() =>
      expect(screen.getByTestId('lti-shell-error')).toBeInTheDocument(),
    )
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('shows an error on 401 without leaking student data', async () => {
    mockFetch(401, { error: 'Invalid or missing evidence token' })
    renderAt('?lti_token=bad')
    await waitFor(() =>
      expect(screen.getByTestId('lti-shell-error')).toBeInTheDocument(),
    )
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument()
  })

  it('renders quest-scoped evidence on success', async () => {
    mockFetch(200, PAYLOAD)
    renderAt('?lti_token=good')
    await waitFor(() =>
      expect(screen.getByText('Build Something You Care About')).toBeInTheDocument(),
    )
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('300 XP earned')).toBeInTheDocument()
    expect(screen.getByText('Learn the rules')).toBeInTheDocument()
    expect(screen.getByText('I did the thing.')).toBeInTheDocument()
    expect(screen.getByText('🔗 My repo')).toBeInTheDocument()
    // Token went to the LTI evidence endpoint, not /public/diploma.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(globalThis.fetch.mock.calls[0][0]).toMatch(/\/lti\/evidence\?lti_token=good$/)
    expect(globalThis.fetch.mock.calls[0][0]).not.toMatch(/portfolio/)
  })
})
