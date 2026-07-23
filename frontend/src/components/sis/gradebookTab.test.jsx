import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// GradebookTab pulls withOrg from useSisOrg, which imports the auth/org contexts.
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'org_admin' } }) }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => ({ organization: { id: 'org-1', name: 'Org' } }) }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api, apiData } = vi.hoisted(() => {
  const apiData = (url) => {
    if (url.includes('/api/sis/gradebook/classes/c1')) {
      return { data: { students: [
        {
          student_user_id: 's1',
          name: 'Alice Student',
          avatar_url: null,
          average: 92.5,
          assignments: [
            { id: 'a1', name: 'Workbook 101 - Quiz 1', date_scheduled: '2026-07-01',
              date_completed: '2026-07-02', score: 90, max_score: 100, notes: 'Solid work' },
            { id: 'a2', name: 'Workbook 101 - Quiz 2', date_scheduled: '2026-07-08',
              date_completed: null, score: 95, max_score: 100, notes: null },
          ],
        },
        { student_user_id: 's2', name: 'Bob Builder', avatar_url: null, average: null, assignments: [] },
      ] } }
    }
    if (url.includes('/api/sis/gradebook/templates')) {
      return { data: { templates: [
        { id: 't1', name: 'Workbook 101-110', class_id: 'c1',
          items: [{ name: 'Workbook 101 - Quiz 1', sort_order: 0 }] },
      ] } }
    }
    return { data: {} }
  }
  return {
    apiData,
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn(() => Promise.resolve({ data: { created: 4, skipped: 0 } })),
      patch: vi.fn(() => Promise.resolve({ data: {} })),
      delete: vi.fn(() => Promise.resolve({ data: {} })),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import GradebookTab from './GradebookTab'

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => Promise.resolve(apiData(url)))
  api.post.mockImplementation(() => Promise.resolve({ data: { created: 4, skipped: 0 } }))
  api.patch.mockImplementation(() => Promise.resolve({ data: {} }))
  api.delete.mockImplementation(() => Promise.resolve({ data: {} }))
})

describe('GradebookTab', () => {
  it('lists each student with a current-average chip', async () => {
    render(<GradebookTab classId="c1" orgId="org-1" className="Math" />)
    expect(await screen.findByText('Alice Student')).toBeInTheDocument()
    expect(screen.getByText('Bob Builder')).toBeInTheDocument()
    expect(screen.getByText('92.5%')).toBeInTheDocument()   // Alice's average chip
    expect(screen.getByText('—')).toBeInTheDocument()       // Bob has no scores yet
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/gradebook/classes/c1'))
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('organization_id=org-1'))
  })

  it('expands a student to the assignment table', async () => {
    render(<GradebookTab classId="c1" orgId="org-1" className="Math" />)
    fireEvent.click(await screen.findByText('Alice Student'))
    expect(await screen.findByText('Workbook 101 - Quiz 1')).toBeInTheDocument()
    expect(screen.getByText('Workbook 101 - Quiz 2')).toBeInTheDocument()
    expect(screen.getByText('90/100')).toBeInTheDocument()
    expect(screen.getByText('Solid work')).toBeInTheDocument()
    // Table headers
    expect(screen.getByText('Assignment')).toBeInTheDocument()
    expect(screen.getByText('Scheduled')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Score')).toBeInTheDocument()
    expect(screen.getByText('Notes')).toBeInTheDocument()
  })

  it('saves an inline score edit via PATCH on Enter', async () => {
    render(<GradebookTab classId="c1" orgId="org-1" className="Math" />)
    fireEvent.click(await screen.findByText('Alice Student'))
    fireEvent.click(await screen.findByText('90/100'))
    const input = screen.getByDisplayValue('90/100')
    fireEvent.change(input, { target: { value: '88/100' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/sis/gradebook/assignments/a1',
        expect.objectContaining({ score: 88, max_score: 100, organization_id: 'org-1' })),
    )
  })

  it('adds a row for a student', async () => {
    render(<GradebookTab classId="c1" orgId="org-1" className="Math" />)
    fireEvent.click(await screen.findByText('Alice Student'))
    fireEvent.click(await screen.findByText('+ Add row'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/gradebook/assignments',
        expect.objectContaining({ class_id: 'c1', student_user_id: 's1', organization_id: 'org-1' })),
    )
  })

  it('opens the Sequences modal, generates a sequence, and applies it', async () => {
    render(<GradebookTab classId="c1" orgId="org-1" className="Math" />)
    await screen.findByText('Alice Student')
    fireEvent.click(screen.getByText('Sequences'))
    // Existing template listed
    expect(await screen.findByText('Workbook 101-110')).toBeInTheDocument()
    // Generator preview: Workbook 101..110 x 4 steps = 40 assignments
    expect(screen.getByText(/40 assignments/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Save sequence'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/gradebook/templates',
        expect.objectContaining({
          class_id: 'c1',
          organization_id: 'org-1',
          items: expect.arrayContaining([
            expect.objectContaining({ name: 'Workbook 101 - Quiz 1', sort_order: 0 }),
          ]),
        })),
    )

    // Apply to a student
    fireEvent.change(screen.getByDisplayValue('Choose a sequence…'), { target: { value: 't1' } })
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(screen.getByText('Apply'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/gradebook/templates/t1/apply',
        expect.objectContaining({ class_id: 'c1', student_ids: ['s1'], organization_id: 'org-1' })),
    )
  })
})
