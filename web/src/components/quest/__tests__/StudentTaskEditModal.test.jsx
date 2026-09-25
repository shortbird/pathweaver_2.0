import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import StudentTaskEditModal from '../StudentTaskEditModal'
import api from '../../../services/api'
import { AuthContext } from '../../../contexts/AuthContext'
import { OrganizationContext } from '../../../contexts/OrganizationContext'

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))

const rules = (overrides = {}) => ({
  data: { success: true, requires_success_criteria: false, can_edit_xp: true, criteria_locked: false, ...overrides },
})

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue(rules())
})

const TASK = {
  id: 'task-1',
  title: 'Build a birdhouse',
  pillar: 'stem',
  xp_value: 75,
  diploma_subjects: ['Science'],
}

const renderModal = ({ featureFlags = {}, user = { role: 'org_managed', org_role: 'student' }, onSave = vi.fn(), task = TASK } = {}) => {
  render(
    <AuthContext.Provider value={{ user }}>
      <OrganizationContext.Provider value={{ organization: { id: 'org-1', feature_flags: featureFlags } }}>
        <StudentTaskEditModal task={task} onClose={vi.fn()} onSave={onSave} />
      </OrganizationContext.Provider>
    </AuthContext.Provider>
  )
  return onSave
}

describe('StudentTaskEditModal XP lock', () => {
  it('shows an editable XP input by default', () => {
    renderModal()
    expect(screen.getByLabelText('XP Value')).toHaveValue(75)
    expect(screen.queryByTestId('xp-value-readonly')).not.toBeInTheDocument()
  })

  it('sends the edited XP when the org has not locked it', async () => {
    const onSave = renderModal()
    fireEvent.change(screen.getByLabelText('XP Value'), { target: { value: '120' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ pillar: 'stem', xp_value: 120 })
      )
    )
  })

  it('renders XP read-only for a student when the org locks it', () => {
    renderModal({ featureFlags: { lock_xp_editing: true } })
    expect(screen.queryByLabelText('XP Value')).not.toBeInTheDocument()
    expect(screen.getByTestId('xp-value-readonly')).toHaveTextContent('75 XP')
    expect(screen.getByText(/Your school sets the XP for tasks/)).toBeInTheDocument()
  })

  it('names the role "teacher", never the internal word "guide"', () => {
    // Student-facing copy uses ROLE_DISPLAY_NAMES wording (advisor -> Teacher).
    renderModal({ featureFlags: { lock_xp_editing: true } })
    expect(screen.getByText(/Ask your teacher/)).toBeInTheDocument()
    expect(screen.queryByText(/guide/i)).not.toBeInTheDocument()
  })

  it('omits xp_value from the payload when locked, so other edits still save', async () => {
    const onSave = renderModal({ featureFlags: { lock_xp_editing: true } })
    fireEvent.click(screen.getByText('Art'))
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const payload = onSave.mock.calls[0][0]
    expect(payload).not.toHaveProperty('xp_value')
    expect(payload.pillar).toBe('art')
  })

  it('keeps the XP input for an advisor even when the org locks it', () => {
    renderModal({
      featureFlags: { lock_xp_editing: true },
      user: { role: 'org_managed', org_role: 'advisor' },
    })
    expect(screen.getByLabelText('XP Value')).toHaveValue(75)
  })
})

describe('StudentTaskEditModal Definition of Done', () => {
  const WITH_CRITERIA = { ...TASK, success_criteria: ['You built it', 'You painted it'] }

  it('asks for the rules of this task and prefills its lines', async () => {
    renderModal({ task: WITH_CRITERIA })
    expect(screen.getByLabelText('Definition of Done line 1')).toHaveValue('You built it')
    expect(screen.getByLabelText('Definition of Done line 2')).toHaveValue('You painted it')
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/api/tasks/authoring-rules', { params: { task_id: 'task-1' } })
    )
  })

  it('sends the edited lines in the save', async () => {
    const onSave = renderModal({ task: WITH_CRITERIA })
    fireEvent.change(screen.getByLabelText('Definition of Done line 2'), {
      target: { value: 'You hung it outside' },
    })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].success_criteria).toEqual(['You built it', 'You hung it outside'])
  })

  it('shows the lines read-only once the task was sent for credit, and never sends them', async () => {
    api.get.mockResolvedValue(rules({ criteria_locked: true }))
    const onSave = renderModal({ task: WITH_CRITERIA })

    expect(await screen.findByText('Locked because this task was sent for credit.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Definition of Done line 1')).not.toBeInTheDocument()
    expect(screen.getByText('You built it')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('success_criteria')
  })

  it('will not save an empty list where the school requires one', async () => {
    api.get.mockResolvedValue(rules({ requires_success_criteria: true }))
    const onSave = renderModal({ task: { ...TASK, success_criteria: ['You built it'] } })
    await waitFor(() => expect(screen.getByText(/Definition of Done \*/)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Remove line 1' }))
    fireEvent.click(screen.getByText('Save'))

    expect(await screen.findByText(/asks for a Definition of Done/)).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it("shows the server's message when the save is refused", async () => {
    const onSave = vi.fn().mockRejectedValue({
      response: { status: 409, data: { code: 'success_criteria_locked', error: 'This task was already sent for credit.' } },
    })
    renderModal({ task: WITH_CRITERIA, onSave })
    fireEvent.change(screen.getByLabelText('Definition of Done line 1'), { target: { value: 'Changed' } })
    fireEvent.click(screen.getByText('Save'))

    expect(await screen.findByText('This task was already sent for credit.')).toBeInTheDocument()
  })
})

describe('StudentTaskEditModal for a learner 13 or older', () => {
  it('hides the pillar picker and saves the subject without a pillar', async () => {
    api.get.mockResolvedValue(rules({ hide_pillars: true }))
    const onSave = renderModal()
    await waitFor(() => expect(screen.queryByText(/Skill Pillar/)).not.toBeInTheDocument())

    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('pillar')
    expect(onSave.mock.calls[0][0].diploma_subjects).toEqual(['Science'])
  })

  it('keeps the pillar picker for younger learners', async () => {
    api.get.mockResolvedValue(rules({ hide_pillars: false }))
    renderModal()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.getByText(/Skill Pillar/)).toBeInTheDocument()
  })
})
