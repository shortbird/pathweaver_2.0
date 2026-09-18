import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * A class roster is a list of students, and a student's name on it is a door
 * to the one student record (M13a): a question on the roster no longer means
 * a trip to the People page.
 */

const { api, doors } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  doors: { openStudent: vi.fn() },
}))
vi.mock('../../../services/api', () => ({ default: api }))
vi.mock('../../../components/sis/RecordDoors', () => ({ useRecordDoors: () => doors }))
vi.mock('../useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1' }),
  withOrg: (p, orgId) => `${p}${p.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('../../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn(() => Promise.resolve(true)) }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

import ClassRoster from './ClassRoster'

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/enrollments')) {
      return Promise.resolve({ data: { roster: [
        { student_id: 's1', name: 'Ada Ant', age: 9, email: 'ada@example.com',
          next_class: { name: 'Clay', location: 'Room 2', start_time: '10:30' } },
      ] } })
    }
    if (url.includes('/api/sis/roster')) return Promise.resolve({ data: { roster: [] } })
    return Promise.resolve({ data: {} })
  })
})

describe('ClassRoster', () => {
  it("a student's name opens their record, with where they go next under it", async () => {
    render(<ClassRoster classId="c1" className="Art" orgId="org-1" />)
    const name = await screen.findByRole('button', { name: /Ada Ant/ })
    expect(name).toHaveTextContent('age 9')
    expect(screen.getByText(/Next: Clay · Room 2 · 10:30/)).toBeInTheDocument()
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    fireEvent.click(name)
    expect(doors.openStudent).toHaveBeenCalledWith('s1', expect.objectContaining({ onSaved: expect.any(Function) }))
  })
})
