import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GiveStudentsMyTasksCard from './GiveStudentsMyTasksCard'
import api from '../../services/api'
import { toast } from 'react-hot-toast'

const auth = { user: null, hasAnyRole: vi.fn() }
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => auth,
}))

vi.mock('../../services/api', () => ({
  default: { post: vi.fn() },
}))

vi.mock('react-hot-toast', () => {
  const toast = { success: vi.fn(), error: vi.fn() }
  return { default: toast, toast }
})

const ORG = 'org-apogee'
const QUEST_ID = 'quest-art'

const asOrgAdmin = () => {
  auth.user = { id: 'katy', organization_id: ORG }
  auth.hasAnyRole.mockImplementation((roles) => roles.includes('org_admin'))
}
const asStudent = () => {
  auth.user = { id: 'kid', organization_id: ORG }
  auth.hasAnyRole.mockReturnValue(false)
}
const asSuperadmin = () => {
  auth.user = { id: 'tanner', organization_id: null }
  auth.hasAnyRole.mockImplementation((roles) => roles.includes('superadmin'))
}

const quest = (overrides = {}) => ({
  id: QUEST_ID,
  organization_id: ORG,
  user_enrollment: { id: 'enr-1' },
  has_template_tasks: false,
  quest_tasks: [{ id: 't1', title: 'Collect natural materials' }, { id: 't2', title: 'Leaf rubbings' }],
  ...overrides,
})

describe('GiveStudentsMyTasksCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    asOrgAdmin()
  })

  it('offers an org admin their own list on their org quest', () => {
    render(<GiveStudentsMyTasksCard quest={quest()} />)
    expect(screen.getByText('Give students this task list')).toBeInTheDocument()
    expect(screen.getByText(/Give them your 2 tasks instead/)).toBeInTheDocument()
  })

  it('renders nothing for a student', () => {
    asStudent()
    const { container } = render(<GiveStudentsMyTasksCard quest={quest()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders nothing on another org's quest", () => {
    const { container } = render(<GiveStudentsMyTasksCard quest={quest({ organization_id: 'org-other' })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing on a global Optio quest for org staff', () => {
    const { container } = render(<GiveStudentsMyTasksCard quest={quest({ organization_id: null })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lets a superadmin do it on any quest', () => {
    asSuperadmin()
    render(<GiveStudentsMyTasksCard quest={quest({ organization_id: null })} />)
    expect(screen.getByText('Give students this task list')).toBeInTheDocument()
  })

  it('renders nothing once the quest has an authored task list', () => {
    const { container } = render(<GiveStudentsMyTasksCard quest={quest({ has_template_tasks: true })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the teacher has no tasks to give', () => {
    const { container } = render(<GiveStudentsMyTasksCard quest={quest({ quest_tasks: [] })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when not enrolled', () => {
    const { container } = render(<GiveStudentsMyTasksCard quest={quest({ user_enrollment: null })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('posts to the promote endpoint, reports who got the list, and refreshes', async () => {
    // enrollments: the teacher's own plus one student who had already picked
    // it up; inserted counts task ROWS and must not be read as students.
    api.post.mockResolvedValue({ data: { success: true, total: 2, resynced: { enrollments: 2, inserted: 2 } } })
    const onDone = vi.fn()
    render(<GiveStudentsMyTasksCard quest={quest()} onDone={onDone} />)

    fireEvent.click(screen.getByText('Give students this task list'))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(api.post).toHaveBeenCalledWith(`/api/admin/quests/${QUEST_ID}/template-tasks/from-my-tasks`, {})
    expect(toast.success).toHaveBeenCalledWith('Students now get your 2 tasks. 1 who already picked it up has them too.')
  })

  it("shows the backend's reason when it refuses", async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'This quest already has a task list. Edit it from the quest form.' } } })
    render(<GiveStudentsMyTasksCard quest={quest()} />)

    fireEvent.click(screen.getByText('Give students this task list'))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('already has a task list')))
  })
})
