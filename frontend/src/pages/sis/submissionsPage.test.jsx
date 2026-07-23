import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mirrors sisPages.test.jsx mocking style.
const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'Org' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api, apiData } = vi.hoisted(() => {
  const submissions = [
    {
      completion_id: 'c1',
      completed_at: '2026-07-20T10:00:00Z',
      student: { id: 's1', name: 'Alice Student', avatar_url: null },
      class_id: 'cl1', class_name: 'Biology',
      quest_id: 'q1', quest_title: 'Cells Quest',
      task: { id: 't1', title: 'Build a cell model', description: 'Model a cell', xp_value: 100, pillar: 'stem_logic' },
      evidence_blocks: [{ id: 'b1', block_type: 'text', content: 'My cell essay evidence' }],
      review: null,
    },
    {
      completion_id: 'c2',
      completed_at: '2026-07-21T10:00:00Z',
      student: { id: 's2', name: 'Bob Builder', avatar_url: null },
      class_id: 'cl1', class_name: 'Biology',
      quest_id: 'q1', quest_title: 'Cells Quest',
      task: { id: 't2', title: 'Write a mitosis report', description: null, xp_value: 50, pillar: 'stem_logic' },
      evidence_blocks: [],
      review: null,
    },
  ]
  const apiData = (url) => {
    if (url.includes('/api/sis/submissions')) {
      return { data: { success: true, submissions, counts: { new: 2, reviewed: 1 }, total: 2 } }
    }
    if (url.includes('/api/sis/classes')) {
      return { data: { classes: [{ id: 'cl1', name: 'Biology' }, { id: 'cl2', name: 'Art' }] } }
    }
    if (url.includes('/messages')) {
      return { data: { success: true, messages: [] } }
    }
    return { data: {} }
  }
  return {
    apiData,
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn(() => Promise.resolve({ data: { success: true } })),
      put: vi.fn(() => Promise.resolve({ data: { success: true, xp_value: 75 } })),
      delete: vi.fn(() => Promise.resolve({ data: { success: true } })),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import SubmissionsPage from './SubmissionsPage'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  vi.clearAllMocks()
  api.get.mockImplementation((url) => Promise.resolve(apiData(url)))
  api.post.mockImplementation(() => Promise.resolve({ data: { success: true } }))
  api.put.mockImplementation(() => Promise.resolve({ data: { success: true, xp_value: 75 } }))
  api.delete.mockImplementation(() => Promise.resolve({ data: { success: true } }))
})

describe('SubmissionsPage', () => {
  it('loads the queue with scope counts and shows the first submission', async () => {
    render(<SubmissionsPage />)
    expect(await screen.findByText('New (2)')).toBeInTheDocument()
    expect(screen.getByText('Reviewed (1)')).toBeInTheDocument()
    // Alice appears in the rail and in the detail header
    expect(screen.getAllByText('Alice Student').length).toBeGreaterThan(0)
    // First item is auto-selected: its evidence renders in the detail pane
    expect(await screen.findByText('My cell essay evidence')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/submissions?scope=new'))
  })

  it('shows class, quest, and task context for the selected submission', async () => {
    render(<SubmissionsPage />)
    expect(await screen.findByText('Biology · Cells Quest')).toBeInTheDocument()
    expect(screen.getAllByText('Build a cell model').length).toBeGreaterThan(0)
    expect(screen.getByText('100 XP')).toBeInTheDocument()
  })

  it('accepts a submission and auto-advances to the next one', async () => {
    render(<SubmissionsPage />)
    await screen.findByText('My cell essay evidence')
    fireEvent.click(screen.getByText('Accept'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/submissions/c1/review',
        expect.objectContaining({ action: 'accepted', organization_id: 'org-1' })),
    )
    // Advanced to Bob's submission; Alice is gone from the queue
    expect((await screen.findAllByText('Write a mitosis report')).length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.queryByText('Alice Student')).not.toBeInTheDocument())
  })

  it('switches to the Reviewed scope and refetches', async () => {
    render(<SubmissionsPage />)
    await screen.findByText('New (2)')
    fireEvent.click(screen.getByText('Reviewed (1)'))
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('scope=reviewed')),
    )
  })

  it('filters the queue by class', async () => {
    render(<SubmissionsPage />)
    await screen.findByText('New (2)')
    fireEvent.change(screen.getByPlaceholderText('Filter by class…'), { target: { value: 'Art' } })
    fireEvent.mouseDown(await screen.findByText('Art'))
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('class_id=cl2')),
    )
  })

  it('adjusts XP with a required reason via the gradebook endpoint', async () => {
    render(<SubmissionsPage />)
    await screen.findByText('100 XP')
    fireEvent.click(screen.getByText('Adjust XP'))
    fireEvent.change(screen.getByLabelText('New XP value'), { target: { value: '75' } })
    fireEvent.change(screen.getByLabelText('Reason for XP change'), { target: { value: 'Partial evidence' } })
    fireEvent.click(screen.getByText('Save XP'))
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/api/sis/completions/c1/xp',
        expect.objectContaining({ xp_value: 75, reason: 'Partial evidence', organization_id: 'org-1' })),
    )
    expect(await screen.findByText('75 XP')).toBeInTheDocument()
  })

  it('hides the XP control when the endpoint does not exist (404)', async () => {
    api.put.mockRejectedValueOnce({ response: { status: 404 } })
    render(<SubmissionsPage />)
    await screen.findByText('100 XP')
    fireEvent.click(screen.getByText('Adjust XP'))
    fireEvent.change(screen.getByLabelText('Reason for XP change'), { target: { value: 'Try' } })
    fireEvent.click(screen.getByText('Save XP'))
    await waitFor(() => expect(screen.queryByText('Adjust XP')).not.toBeInTheDocument())
  })

  it('shows the all-caught-up empty state when there is nothing new', async () => {
    api.get.mockImplementation((url) =>
      url.includes('/api/sis/submissions')
        ? Promise.resolve({ data: { success: true, submissions: [], counts: { new: 0, reviewed: 0 }, total: 0 } })
        : Promise.resolve(apiData(url)))
    render(<SubmissionsPage />)
    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument()
  })
})
