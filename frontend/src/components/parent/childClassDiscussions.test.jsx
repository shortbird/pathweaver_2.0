import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('../discussion/ClassDiscussion', () => ({
  default: ({ classId, title }) => <div data-testid={`board-${classId}`}>{title}</div>,
}))

import ChildClassDiscussions from './ChildClassDiscussions'

const CONTEXT = { data: { orgs: [{ organization_id: 'org-1', organization_name: 'Gryffin', students: [{ student_id: 's1' }] }] } }
const SCHEDULE = { data: { classes: [{ id: 'c1', name: 'Earth Science' }, { id: 'c2', name: 'Reading' }] } }

beforeEach(() => vi.clearAllMocks())

describe('ChildClassDiscussions — a parent reads each class board', () => {
  it('finds the child\'s school, then renders one board per enrolled class', async () => {
    api.get.mockImplementation((url) => Promise.resolve(url.includes('/schedule') ? SCHEDULE : CONTEXT))
    render(<ChildClassDiscussions studentId="s1" studentFirstName="Tarien" />)

    expect(await screen.findByText('Class discussions')).toBeInTheDocument()
    expect(screen.getByTestId('board-c1')).toHaveTextContent('Earth Science')
    expect(screen.getByTestId('board-c2')).toHaveTextContent('Reading')
    expect(screen.getByText(/What Tarien and their classmates post/)).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/sis/parent/students/s1/schedule?organization_id=org-1')
  })

  it('renders nothing for a family that is not at a school', async () => {
    api.get.mockResolvedValue({ data: { orgs: [] } })
    const { container } = render(<ChildClassDiscussions studentId="s1" />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
