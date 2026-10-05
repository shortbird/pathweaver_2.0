import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BloomyPage, { domainLabel, recentLine } from './BloomyPage'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'org_admin' } }) }))
vi.mock('../../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ organization: { id: 'org-1', name: 'Apogee Cache Valley' } }),
}))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    put: vi.fn(() => Promise.resolve({ data: { success: true } })),
    post: vi.fn(() => Promise.resolve({ data: { success: true, tasks: 2, error: null } })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

const overview = {
  success: true,
  connected: true,
  last_sync_at: null,
  optio_students: [{ id: 'kaya', name: 'Makaya Gochnour' }, { id: 'ben', name: 'Ben Kid' }],
  students: [
    { bloomy_student_id: 'b1', name: 'Makaya Gochnour', grade: 7, estimated_grade: 5, learning_hours: 2.8,
      skills_mastered: 14, user_id: null, suggested_user_id: 'kaya',
      subjects: { math: { mastered: 11, in_progress: 1, placed: 90,
        domains: [{ domain: 'number_base_ten', mastered: 4, in_progress: 0, placed: 2, grade_level: 2 }] } },
      recent: { mastered: { math: 3, reading: 1 }, worked: 6, days: 2, last_active: '2026-09-30' } },
    { bloomy_student_id: 'b2', name: 'Ben Kid', grade: 4, learning_hours: 5,
      skills_mastered: 3, user_id: 'ben', suggested_user_id: null },
  ],
}

describe('helpers', () => {
  it('turns Bloomy domain keys into words', () => {
    expect(domainLabel('number_base_ten')).toBe('Number base ten')
  })

  it('says plainly when a student did nothing this week', () => {
    expect(recentLine({ worked: 0 })).toBe('No Bloomy work in the last 7 days')
  })
})

describe('BloomyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: overview })
  })

  it('offers a same-name match but links only when somebody presses Link', async () => {
    render(<BloomyPage />)
    expect(await screen.findByText('Same name')).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Link'))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(api.put.mock.calls[0][0]).toContain('/api/sis/bloomy/links')
    expect(api.put.mock.calls[0][1]).toEqual({ bloomy_student_id: 'b1', user_id: 'kaya' })
  })

  it('unlinks a linked student', async () => {
    render(<BloomyPage />)
    expect(await screen.findByText('Linked to Ben Kid')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Unlink'))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(api.put.mock.calls[0][1]).toEqual({ bloomy_student_id: 'b2', user_id: null })
  })

  it('asks for a key before anything else when Bloomy is not connected', async () => {
    api.get.mockResolvedValue({ data: { ...overview, connected: false, students: [] } })
    render(<BloomyPage />)
    expect(await screen.findByText('Connect')).toBeInTheDocument()
    expect(screen.queryByText('Sync now')).not.toBeInTheDocument()
  })

  it('shows what Bloomy knows and loads skills and tests on demand', async () => {
    render(<BloomyPage />)
    expect(await screen.findByText(/Bloomy estimate grade 5/)).toBeInTheDocument()
    expect(screen.getByText(/Last 7 days: 4 skills mastered \(Math 3, Reading 1\)/)).toBeInTheDocument()
    api.get.mockResolvedValueOnce({ data: { success: true,
      counts: { earned: 1, in_progress: 0, placed: 90, attempts: 2, attempts_passed: 1 },
      recent_mastered: [{ task_id: 'NBT-1', task_title: 'Compare numbers', subject: 'math', grade: 2,
        mastery_tier: 'proficient', best_passing_summit_score_pct: 80, mastered_at: '2026-09-16 19:43:23+00' }],
      in_progress: [],
      attempts: [{ task_id: 'NBT-1', task_title: 'Compare numbers', stage: 'summit', status: 'completed',
        score_pct: 80, passed: true, started_at: '2026-09-16T19:40:00Z', completed_at: '2026-09-16T19:43:00Z' }],
    } })
    fireEvent.click(screen.getAllByText('Show details')[0])
    expect(await screen.findByText('Recent tests (1 of 2 passed)')).toBeInTheDocument()
    expect(screen.getByText('Number base ten')).toBeInTheDocument()
    expect(api.get.mock.calls.at(-1)[0]).toContain('/api/sis/bloomy/student?bloomy_student_id=b1')
  })
})
