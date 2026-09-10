/**
 * The "viewed by" list belongs to the student whose work the card shows.
 *
 * /api/observers/views/<type>/<id> enforces that on the backend: it is the list
 * of who has been looking at this student's evidence, so only the author (and
 * superadmin) may read it. The eye button was rendered for every viewer anyway,
 * so a parent opening her daughter's credits page saw an affordance that
 * answered her click with a 403 (Sentry OPTIO-WEB-1C / -1D, 2026-09-10).
 *
 * Hide the affordance instead of answering the click with a refusal.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { observerAPI } from '../../services/api'
import FeedCard from './FeedCard'

const STUDENT_ID = 'student-1'
const PARENT_ID = 'parent-1'

let currentUserId = STUDENT_ID

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: currentUserId } }),
}))

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
  observerAPI: {
    getViewers: vi.fn(() => Promise.resolve({ data: { viewers: [], total: 0 } })),
  },
}))

const getViewers = observerAPI.getViewers

const item = {
  completion_id: 'completion-1',
  student: { id: STUDENT_ID, first_name: 'Ella', last_name: 'C' },
  quest: { id: 'quest-1', title: 'Build a telescope' },
  task: { title: 'Grind the mirror' },
  timestamp: '2026-09-10T00:00:00Z',
  evidence_text: 'I ground the mirror.',
}

function renderCard() {
  return render(
    <MemoryRouter>
      <FeedCard item={item} />
    </MemoryRouter>
  )
}

describe('the viewers button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentUserId = STUDENT_ID
  })

  it('is offered to the student whose work it is', () => {
    renderCard()
    expect(screen.getByLabelText('See who viewed this')).toBeInTheDocument()
  })

  it("is not offered to a parent looking at their child's work", () => {
    currentUserId = PARENT_ID
    renderCard()
    // The card still renders; it just does not carry a control that 403s.
    expect(screen.getByText('Build a telescope')).toBeInTheDocument()
    expect(screen.queryByLabelText('See who viewed this')).toBeNull()
  })

  it('never asks the backend for a list the viewer may not read', async () => {
    currentUserId = PARENT_ID
    renderCard()
    expect(getViewers).not.toHaveBeenCalled()
  })

  it('still fetches the list when the author asks for it', async () => {
    renderCard()
    await userEvent.click(screen.getByLabelText('See who viewed this'))
    expect(getViewers).toHaveBeenCalledWith('completion', 'completion-1')
  })
})
