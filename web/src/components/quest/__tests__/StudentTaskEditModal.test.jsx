import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import StudentTaskEditModal from '../StudentTaskEditModal'
import { AuthContext } from '../../../contexts/AuthContext'
import { OrganizationContext } from '../../../contexts/OrganizationContext'

const TASK = {
  id: 'task-1',
  title: 'Build a birdhouse',
  pillar: 'stem',
  xp_value: 75,
  diploma_subjects: ['Science'],
}

const renderModal = ({ featureFlags = {}, user = { role: 'org_managed', org_role: 'student' }, onSave = vi.fn() } = {}) => {
  render(
    <AuthContext.Provider value={{ user }}>
      <OrganizationContext.Provider value={{ organization: { id: 'org-1', feature_flags: featureFlags } }}>
        <StudentTaskEditModal task={TASK} onClose={vi.fn()} onSave={onSave} />
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
