/**
 * The hero's "Quests" stat counts finished quests only.
 *
 * /api/quests/completed returns in-progress quests too, as long as they have
 * one submitted task, so the portfolio can show partial evidence. The hero
 * used to show the raw length of that list, so a student with 12 finished
 * quests and 5 half-done ones read 17 on the web and 12 on the mobile profile,
 * which already filtered by status (Banks Hanna, 2026-09-14).
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import StudentOverviewPage from './StudentOverviewPage'
import api from '../services/api'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'student-1', first_name: 'Banks' }, updateUser: vi.fn(), loginTimestamp: 1 }),
}))

vi.mock('../contexts/ActingAsContext', () => ({
  useActingAs: () => ({ actingAsDependent: null }),
}))

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), put: vi.fn() },
}))

vi.mock('../programs/registry', () => ({
  fetchProgramDiploma: vi.fn().mockResolvedValue(null),
}))

vi.mock('react-helmet-async', () => ({
  Helmet: () => null,
}))

// The hero is the unit under test; everything below it is somebody else's.
vi.mock('../components/overview/StudentOverviewSections', () => ({ default: () => null }))
vi.mock('../components/overview/WeeklyXpGoalCard', () => ({ default: () => null }))
vi.mock('../components/overview/AccountSettings', () => ({ default: () => null }))
vi.mock('../components/overview/CollapsibleSection', () => ({ default: ({ children }) => <div>{children}</div> }))
vi.mock('../components/overview/EditProfileModal', () => ({ default: () => null }))
vi.mock('../components/diploma/PublicConsentModal', () => ({ default: () => null }))

vi.mock('../components/overview/HeroSection', () => ({
  default: ({ completedQuestsCount }) => (
    <div data-testid="hero-quests">{completedQuestsCount}</div>
  ),
}))

const achievement = (status) => ({ quest: { id: `q-${Math.random()}`, title: 'Quest' }, status, task_evidence: {} })

describe('StudentOverviewPage quest count', () => {
  beforeEach(() => {
    api.get.mockImplementation((url) => {
      if (url === '/api/quests/completed') {
        return Promise.resolve({
          data: {
            achievements: [
              achievement('completed'),
              achievement('completed'),
              achievement('in_progress'),
              achievement('in_progress'),
              achievement('in_progress'),
            ],
          },
        })
      }
      if (url === '/api/users/dashboard') {
        return Promise.resolve({ data: { stats: { total_xp: 100, completed_tasks_count: 7 } } })
      }
      return Promise.resolve({ data: {} })
    })
  })

  it('passes only status=completed achievements to the hero', async () => {
    render(
      <MemoryRouter>
        <StudentOverviewPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('hero-quests')).toHaveTextContent('2')
    })
  })
})
