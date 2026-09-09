/**
 * The family portal's own quests.
 *
 * iCreate, 2026-08-06: "back to school night with families will be a quest."
 *
 * These are the guardian's, on the guardian's account — the copy says "these are
 * yours to do" for the same reason the backend never touches a student record
 * here. A parent who reads it as their child's homework will not do it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}))
vi.mock('../services/api', () => ({ default: api }))

import FamilyPortalPage from './FamilyPortalPage'

const QUEST = {
  quest_id: 'q1', title: 'Back to school night', description: 'Come and meet us',
  category: 'Community', is_required: true,
  progress: { started: false, completed: false, done: 0, total: 0 },
}

const mockPortal = ({ quests = [QUEST], assignments = [] } = {}) => {
  api.get.mockImplementation((url) => {
    if (url.includes('/parent/context')) {
      return Promise.resolve({ data: { orgs: [{ organization_id: 'org-1', organization_name: 'iCreate' }] } })
    }
    if (url.includes('/parent/quests')) return Promise.resolve({ data: { quests } })
    if (url.includes('/parent/onboarding')) return Promise.resolve({ data: { assignments } })
    return Promise.resolve({ data: {} })
  })
}

beforeEach(() => vi.clearAllMocks())

describe('quests the school set for families', () => {
  it('lists them in the portal', async () => {
    mockPortal()
    render(<FamilyPortalPage />)
    expect(await screen.findByText('Back to school night')).toBeInTheDocument()
    expect(screen.getByText('Required')).toBeInTheDocument()
  })

  it('says the quest is the parent’s own to do', async () => {
    mockPortal()
    render(<FamilyPortalPage />)
    expect(await screen.findByText(/These are yours to do/i)).toBeInTheDocument()
  })

  it('links into the quest to start it', async () => {
    mockPortal()
    render(<FamilyPortalPage />)
    const link = await screen.findByRole('link', { name: 'Start this quest' })
    expect(link).toHaveAttribute('href', '/quests/q1')
  })

  it('says Continue once it is under way, with the task count', async () => {
    mockPortal({ quests: [{ ...QUEST, progress: { started: true, completed: false, done: 1, total: 3 } }] })
    render(<FamilyPortalPage />)
    expect(await screen.findByRole('link', { name: 'Continue' })).toBeInTheDocument()
    expect(screen.getByText('1 of 3 tasks')).toBeInTheDocument()
  })

  it('shows nothing at a school that has set none', async () => {
    mockPortal({ quests: [] })
    render(<FamilyPortalPage />)
    expect(await screen.findByText('Nothing to complete right now.')).toBeInTheDocument()
    expect(screen.queryByText('Quests from your school')).not.toBeInTheDocument()
  })

  it('still shows the quests when there are no checklists', async () => {
    mockPortal({ assignments: [] })
    render(<FamilyPortalPage />)
    expect(await screen.findByText('Back to school night')).toBeInTheDocument()
    expect(screen.queryByText('Nothing to complete right now.')).not.toBeInTheDocument()
  })
})
