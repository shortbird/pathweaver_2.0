import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import StudentDayModal from './StudentDayModal'

/**
 * A daily-roll mark (class_id NULL, ticket 0680d03c) is the day, not a class.
 * The backend answers it as `daily` apart from `classes`; the modal shows it
 * as its own line instead of an "Unknown class" row, and a student with no
 * classes but a daily mark is not "No classes on this student's schedule".
 */

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

const day = (extra) => ({ data: { student_name: 'Ada Ant', date: '2026-10-13', classes: [], counts: {},
  not_taken: 0, daily: null, ...extra } })

beforeEach(() => vi.clearAllMocks())

describe('StudentDayModal daily mark', () => {
  it('shows the daily roll mark, its pickup and reason', async () => {
    api.get.mockResolvedValue(day({ daily: { status: 'present', note: null, arrived_at: 'a', departed_at: 'b' } }))
    render(<StudentDayModal studentId="s1" date="2026-10-13" orgId="org-1" onClose={() => {}} />)
    const line = (await screen.findByText('Daily roll:')).closest('[data-daily-mark]')
    expect(line).toHaveTextContent('Present')
    expect(line).toHaveTextContent('Picked up')
    expect(screen.queryByText(/No classes on this student/)).toBeNull()
  })

  it('says nothing about a daily roll the school does not take', async () => {
    api.get.mockResolvedValue(day())
    render(<StudentDayModal studentId="s1" date="2026-10-13" orgId="org-1" onClose={() => {}} />)
    expect(await screen.findByText(/No classes on this student/)).toBeInTheDocument()
    expect(screen.queryByText('Daily roll:')).toBeNull()
  })
})
