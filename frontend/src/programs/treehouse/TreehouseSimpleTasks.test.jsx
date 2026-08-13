import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TreehouseSimpleTasks from './TreehouseSimpleTasks'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}))

vi.mock('../../hooks/api/useQuests', () => ({
  useCompleteTask: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('../../contexts/AIAccessContext', () => ({
  useAIAccess: () => ({ canUseTaskGeneration: true }),
}))

vi.mock('../../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ organization: { name: 'Test Org' } }),
  useOrgFeature: () => false,
}))

vi.mock('../../services/api', () => ({
  default: { post: vi.fn() },
  treehouseAPI: {
    questMoreIdeas: vi.fn(() => Promise.resolve({ data: { ideas: [] } })),
    createSignal: vi.fn(() => Promise.resolve({ data: { success: true } })),
  },
  taskStepsAPI: {
    getSteps: vi.fn(() => Promise.resolve({ data: { success: true, steps: [] } })),
    generateSteps: vi.fn(() => Promise.resolve({ data: { success: true, steps: [{ id: 's1', title: 'Step 1' }] } })),
    toggleStep: vi.fn(),
    drillDown: vi.fn(),
    deleteSteps: vi.fn(),
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({ data: { is_member: true, is_facilitator: false } }),
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

describe('TreehouseSimpleTasks with Steps Option', () => {
  const sampleTasks = [
    { id: 't1', title: 'Build a birdhouse', is_completed: false, order_index: 0 },
    { id: 't2', title: 'Paint the fence', is_completed: true, order_index: 1 },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders task list with Steps button for uncompleted tasks', () => {
    render(<TreehouseSimpleTasks tasks={sampleTasks} questId="q1" />)

    expect(screen.getByText('Build a birdhouse')).toBeInTheDocument()
    expect(screen.getByText('Paint the fence')).toBeInTheDocument()
    expect(screen.getByText('✨ Steps')).toBeInTheDocument()
  })

  it('opens TaskStepsModal when Steps button is clicked', async () => {
    render(<TreehouseSimpleTasks tasks={sampleTasks} questId="q1" />)

    const stepsBtn = screen.getByText('✨ Steps')
    fireEvent.click(stepsBtn)

    await waitFor(() => {
      expect(screen.getByText('Break into Steps')).toBeInTheDocument()
    })
  })

  it('shows Break into steps option inside open task finish sheet', async () => {
    render(<TreehouseSimpleTasks tasks={sampleTasks} questId="q1" />)

    // Click task title to open finish sheet
    fireEvent.click(screen.getByText('Build a birdhouse'))

    await waitFor(() => {
      expect(screen.getByText('Finished it? Take a photo of your work!')).toBeInTheDocument()
      expect(screen.getByText('✨ Break into steps')).toBeInTheDocument()
    })

    // Click Break into steps inside sheet
    fireEvent.click(screen.getByText('✨ Break into steps'))

    await waitFor(() => {
      expect(screen.getByText('Break into Steps')).toBeInTheDocument()
    })
  })
})
