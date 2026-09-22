import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TrainingForm from './TrainingForm'

/**
 * The "Link to a video or document" door on every tab of the training form.
 *
 * "I would like to link to a video or document option in the 'for families'
 * (and students if it's not there too). For example, it'd be nice to be able to
 * upload the training from last friday without creating an entire quest."
 * (iCreate, Molly, 2026-09-22, ae16c5da.)
 *
 * The door was staff-only, then staff + families. Students got it once migration
 * 20260922200100 let org_resources.audience hold 'students'.
 */

const { api, saveLink } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  saveLink: { mutateAsync: vi.fn(), isPending: false },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('../../hooks/api/useSisStaff', () => ({ useSisStaff: () => ({ data: [] }) }))
vi.mock('../../hooks/api/useTraining', () => ({ useSaveTrainingLink: () => saveLink }))
vi.mock('./QuestDraftForm', () => ({ default: () => null, blankTask: () => ({ title: '', xp_value: 0 }) }))
vi.mock('./QuestAiDraftPanel', () => ({ default: () => null }))
vi.mock('./QuestPreviewModal', () => ({ default: () => null }))
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))


const renderForm = (audience) => render(
  <TrainingForm orgId="org-1" audience={audience} onAdded={vi.fn()} onCancel={vi.fn()} />,
)

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { quests: [] } })
  saveLink.mutateAsync.mockResolvedValue({})
})

const openLinkDoor = () => fireEvent.click(screen.getByRole('tab', { name: 'Link to a video or document' }))
const fillLink = () => {
  fireEvent.change(screen.getByLabelText('Training title'), { target: { value: 'Last Friday training' } })
  fireEvent.change(screen.getByLabelText('Training link'), { target: { value: 'https://loom.com/x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add link' }))
}

describe('the link door on the training form', () => {
  it.each(['staff', 'family', 'student'])('is offered on the %s tab', (audience) => {
    renderForm(audience)
    expect(screen.getByRole('tab', { name: 'Link to a video or document' })).toBeInTheDocument()
  })

  it('files a student link with the student audience and no staff targeting', async () => {
    renderForm('student')
    openLinkDoor()
    // Role narrowing is a staff idea; a student link reaches every student.
    expect(screen.queryByText(/Which staff roles/)).not.toBeInTheDocument()
    fillLink()
    await waitFor(() => expect(saveLink.mutateAsync).toHaveBeenCalled())
    const { body } = saveLink.mutateAsync.mock.calls[0][0]
    expect(body.audience).toBe('student')
    expect(body).not.toHaveProperty('visible_to_roles')
    expect(body).not.toHaveProperty('visible_to_user_ids')
  })

  it('tells the admin on the student tab that a link is an option', () => {
    renderForm('student')
    expect(screen.getByText(/or link to a video or document they only have to watch/)).toBeInTheDocument()
  })

  it('still offers staff targeting on a staff link', async () => {
    renderForm('staff')
    openLinkDoor()
    expect(screen.getByText(/Which staff roles/)).toBeInTheDocument()
    fillLink()
    await waitFor(() => expect(saveLink.mutateAsync).toHaveBeenCalled())
    const { body } = saveLink.mutateAsync.mock.calls[0][0]
    expect(body.audience).toBe('staff')
    expect(body.visible_to_roles).toEqual([])
  })
})
