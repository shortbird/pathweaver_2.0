/**
 * A moment attached to the quest, on the web quest page.
 *
 * Sentry tickets 9f3206de, 8350643f, 2fe50e77 and 890f62fc (2026-10-02): the
 * quest page shows such a moment as a task with id "moment-<uuid>". There is no
 * task row or evidence document behind that id, but the page treated it like a
 * task: it asked for the evidence document (always empty, so a moment with
 * photos read "No evidence yet"), and pressing Add sent the id to the upload
 * and save routes, which answered 500.
 *
 * Mobile has always read the moment's inline evidence and offered "Edit
 * moment" (QuestDetailView). These pin the web page to the same: the moment's
 * own blocks, no task controls, and Edit moment opening the moment editor on
 * the whole moment fetched from /api/learning-events/<id>.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
// vi.mock calls below are hoisted above these imports.
import TaskWorkspace from '../TaskWorkspace'
import { evidenceDocumentService } from '../../../services/evidenceDocumentService'

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))

vi.mock('../../../contexts/AIAccessContext', () => ({
  useAIAccess: () => ({ canUseTaskGeneration: false }),
}))
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'stu-1' }, effectiveRole: 'student' }),
}))
vi.mock('../../../hooks/useHidePillars', () => ({ default: () => false }))
vi.mock('../../../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ organization: null }),
  useOrgFeature: () => false,
}))

const { scope } = vi.hoisted(() => ({
  scope: { current: { studentId: null, params: {}, isDelegated: false } },
}))
vi.mock('../../../hooks/useStudentScope', () => ({ useStudentScope: () => scope.current }))

vi.mock('../../../services/evidenceDocumentService', () => ({
  evidenceDocumentService: {
    getDocument: vi.fn(() => Promise.resolve({ success: true, blocks: [] })),
    saveDocument: vi.fn(),
    uploadFile: vi.fn(),
  },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() },
}))
vi.mock('../../../services/api', () => ({ default: api }))

// The editor itself is LearningEventModal's own business; here it only has to
// receive the whole moment and report a save.
vi.mock('../../learning-events/LearningEventModal', () => ({
  default: ({ editEvent, onSuccess }) => (
    <div data-testid="moment-editor">
      <span>{`editing ${editEvent.id} with ${editEvent.pillars.join(',')}`}</span>
      <button onClick={() => onSuccess(editEvent)}>Save moment</button>
    </div>
  ),
}))

const EVENT_ID = '915a0ca3-a8e4-4e67-a376-4a9471452d28'

const MOMENT_TASK = {
  id: `moment-${EVENT_ID}`,
  title: 'Museum trip',
  pillar: 'art',
  xp_amount: 50,
  is_completed: true,
  is_moment: true,
  evidence_blocks: [
    { id: 'b1', block_type: 'text', content: { text: 'We saw the dinosaur hall.' } },
  ],
}

const FULL_EVENT = {
  id: EVENT_ID,
  title: 'Museum trip',
  description: 'Natural history museum',
  pillars: ['art', 'stem'],
  event_date: '2026-10-01',
  evidence_blocks: [
    { id: 'b1', block_type: 'text', content: { text: 'We saw the dinosaur hall.' } },
    { id: 'b2', block_type: 'text', content: { text: 'And the gem room.' } },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  scope.current = { studentId: null, params: {}, isDelegated: false }
  api.get.mockImplementation((url) => {
    if (url === `/api/learning-events/${EVENT_ID}`) {
      return Promise.resolve({ data: { success: true, event: FULL_EVENT } })
    }
    return Promise.resolve({ data: {} })
  })
})

const renderWorkspace = (props = {}) => render(
  <TaskWorkspace task={MOMENT_TASK} tasks={[MOMENT_TASK]} questId="quest-1" {...props} />
)

describe('TaskWorkspace — a moment shown as a task', () => {
  it("shows the moment's own evidence, not an empty task document", async () => {
    renderWorkspace()

    expect(await screen.findByText('We saw the dinosaur hall.')).toBeInTheDocument()
    expect(screen.queryByText(/No evidence yet/)).not.toBeInTheDocument()
    expect(evidenceDocumentService.getDocument).not.toHaveBeenCalled()
  })

  it('offers no task controls that would write to a task that does not exist', async () => {
    renderWorkspace()

    await screen.findByText('We saw the dinosaur hall.')
    expect(screen.queryByTitle('Add Evidence')).not.toBeInTheDocument()
    expect(screen.queryByText('Done')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Request diploma credit for this task')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Include in portfolio')).not.toBeInTheDocument()
    // Nor does it ask for a completion row that a moment cannot have.
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/credit-status'), expect.anything())
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/api/portfolio/completions/by-task/'), expect.anything())
  })

  it('opens the moment editor on the whole moment, fetched by its own id', async () => {
    renderWorkspace()

    fireEvent.click(await screen.findByRole('button', { name: 'Edit moment' }))

    expect(await screen.findByText(`editing ${EVENT_ID} with art,stem`)).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(`/api/learning-events/${EVENT_ID}`)
  })

  it('shows what was saved, and tells the quest page', async () => {
    const onTaskUpdate = vi.fn()
    renderWorkspace({ onTaskUpdate })

    fireEvent.click(await screen.findByRole('button', { name: 'Edit moment' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save moment' }))

    expect(await screen.findByText('And the gem room.')).toBeInTheDocument()
    await waitFor(() => expect(onTaskUpdate).toHaveBeenCalledWith(expect.objectContaining({
      id: MOMENT_TASK.id,
      title: 'Museum trip',
      evidence_blocks: FULL_EVENT.evidence_blocks,
    })))
  })

  it("offers no Edit moment to a parent looking at the child's quest", async () => {
    scope.current = { studentId: 'kid-1', params: { student_id: 'kid-1' }, isDelegated: true }
    renderWorkspace()

    expect(await screen.findByText('We saw the dinosaur hall.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit moment' })).not.toBeInTheDocument()
  })

  it('still loads the evidence document for a real task', async () => {
    const task = { id: 'task-1', title: 'Sketch', pillar: 'art', xp_amount: 25, is_completed: false }
    render(<TaskWorkspace task={task} tasks={[task]} questId="quest-1" />)

    await waitFor(() => expect(evidenceDocumentService.getDocument).toHaveBeenCalledWith('task-1', { studentId: null }))
    expect(screen.getByTitle('Add Evidence')).toBeInTheDocument()
  })
})
