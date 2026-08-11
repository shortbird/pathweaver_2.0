import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TeacherHome from './TeacherHome'
import api from '../../services/api'

let authState = {}

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() }
}))

const TASKS = [
  { task_id: 't1', completion_id: 'c1', task_title: 'Write a sonnet', student_name: 'Jordan Rivera', quest_title: 'Poetry Lab' },
  { task_id: 't2', completion_id: 'c2', task_title: 'Solder a circuit', student_name: 'Sam Lee', quest_title: 'Electronics 101' }
]

const INVITATIONS = [
  { id: 'i1', status: 'pending' },
  { id: 'i2', status: 'pending' },
  { id: 'i3', status: 'pending' }
]

const CLASSES = [
  { id: 'class-1', name: 'Morning Advisory', student_count: 12, quest_count: 3 },
  { id: 'class-2', name: 'Robotics Block', student_count: 1, quest_count: 1 }
]

// Route every source through a URL-keyed mock so tests can vary each feed.
function mockApi({ tasks = [], invitations = [], classes = [] } = {}) {
  api.get.mockImplementation((url) => {
    if (url.includes('/api/teacher/pending-verifications')) {
      return tasks instanceof Error
        ? Promise.reject(tasks)
        : Promise.resolve({ data: { tasks } })
    }
    if (url.includes('/api/advisor/quest-invitations')) {
      return invitations instanceof Error
        ? Promise.reject(invitations)
        : Promise.resolve({ data: { invitations, count: invitations.length } })
    }
    if (url.includes('/api/advisor/classes')) {
      return classes instanceof Error
        ? Promise.reject(classes)
        : Promise.resolve({ data: { success: true, classes } })
    }
    return Promise.resolve({ data: {} })
  })
}

function renderHome() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <TeacherHome />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('TeacherHome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = { user: { id: 'adv-1', first_name: 'Dana', role: 'advisor' } }
    mockApi()
  })

  it('greets the advisor by first name', () => {
    renderHome()
    expect(screen.getByText('Welcome back, Dana')).toBeInTheDocument()
  })

  it('renders the verification queue count and preview items linking to the queue', async () => {
    mockApi({ tasks: TASKS })
    renderHome()

    expect(await screen.findByText('2 submissions waiting for review')).toBeInTheDocument()
    expect(screen.getByText('Write a sonnet')).toBeInTheDocument()
    expect(screen.getByText(/Jordan Rivera/)).toBeInTheDocument()
    expect(screen.getByText('Solder a circuit')).toBeInTheDocument()

    const links = screen.getAllByRole('link')
    expect(links.some(l => l.getAttribute('href') === '/advisor/verification')).toBe(true)
  })

  it('caps the verification preview and offers a view-all link', async () => {
    const manyTasks = Array.from({ length: 5 }, (_, i) => ({
      task_id: `t${i}`, task_title: `Task ${i}`, student_name: `Student ${i}`
    }))
    mockApi({ tasks: manyTasks })
    renderHome()

    expect(await screen.findByText('5 submissions waiting for review')).toBeInTheDocument()
    expect(screen.getByText('Task 0')).toBeInTheDocument()
    expect(screen.getByText('Task 2')).toBeInTheDocument()
    expect(screen.queryByText('Task 3')).not.toBeInTheDocument()
    expect(screen.getByText('View all 5')).toBeInTheDocument()
  })

  it('renders the pending invitations count linking to the invitations page', async () => {
    mockApi({ invitations: INVITATIONS })
    renderHome()

    const row = await screen.findByText('3 pending quest invitations')
    expect(row.closest('a')).toHaveAttribute('href', '/advisor/invitations')
    expect(api.get).toHaveBeenCalledWith('/api/advisor/quest-invitations?status=pending')
  })

  it('shows the all-clear line when both queues are empty', async () => {
    renderHome()
    expect(await screen.findByText('Nothing waiting on you right now.')).toBeInTheDocument()
  })

  it('renders classes as link cards to the class page', async () => {
    mockApi({ classes: CLASSES })
    renderHome()

    const card = await screen.findByText('Morning Advisory')
    expect(card.closest('a')).toHaveAttribute('href', '/org-classes/class-1')
    expect(screen.getByText('12 students · 3 quests')).toBeInTheDocument()
    expect(screen.getByText('1 student · 1 quest')).toBeInTheDocument()
    expect(screen.getByText('Robotics Block').closest('a'))
      .toHaveAttribute('href', '/org-classes/class-2')
  })

  it('shows the classes empty state when the advisor has no classes', async () => {
    renderHome()
    expect(await screen.findByText('No classes yet')).toBeInTheDocument()
  })

  it('keeps the surviving queue when one source errors', async () => {
    mockApi({ tasks: new Error('boom'), invitations: INVITATIONS })
    renderHome()

    expect(await screen.findByText('3 pending quest invitations')).toBeInTheDocument()
    expect(screen.queryByText(/waiting for review/)).not.toBeInTheDocument()
  })

  it('hides the waiting strip entirely when both sources error', async () => {
    mockApi({ tasks: new Error('boom'), invitations: new Error('boom'), classes: CLASSES })
    renderHome()

    await screen.findByText('Morning Advisory')
    await waitFor(() => {
      expect(screen.queryByText('Waiting on you')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Nothing waiting on you right now.')).not.toBeInTheDocument()
  })

  it('degrades the classes section quietly on error', async () => {
    mockApi({ classes: new Error('boom') })
    renderHome()
    expect(await screen.findByText(/Couldn’t load your classes right now/)).toBeInTheDocument()
  })

  it('keeps door tiles for Messages and Assign Quests', () => {
    renderHome()
    expect(screen.getByText('Messages').closest('a')).toHaveAttribute('href', '/messages')
    expect(screen.getByText('Assign Quests').closest('a')).toHaveAttribute('href', '/advisor/invitations')
  })
})
