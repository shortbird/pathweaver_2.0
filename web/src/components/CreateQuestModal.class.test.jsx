import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CreateQuestModal from './CreateQuestModal'

/**
 * A learner in a school class can say which class a quest is for (Gryffin,
 * 2026-09-25). Leaving it on "just for me" must send exactly what the form
 * always sent, so a personal quest stays personal.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
const { api, classService } = vi.hoisted(() => ({
  api: { post: vi.fn(), get: vi.fn() },
  classService: { getMyStudentClasses: vi.fn() },
}))
vi.mock('../services/api', () => ({ default: api }))
vi.mock('../services/classService', () => ({ default: classService }))
vi.mock('../hooks/useStudentScope', () => ({ useStudentScope: () => ({ params: {}, studentId: null }) }))
vi.mock('../hooks/api/useFamilyQuests', () => ({ useCreateFamilyQuest: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('./SimilarQuestAutocomplete', () => ({ default: () => null }))

const fill = () => {
  fireEvent.change(screen.getByLabelText(/Quest Title/), { target: { value: 'Minerals in Rocks' } })
  fireEvent.change(screen.getByLabelText(/Quest Description/), { target: { value: 'What rocks are made of' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  classService.getMyStudentClasses.mockResolvedValue({ classes: [{ id: 'c1', name: 'Earth Science' }] })
  api.post.mockResolvedValue({ data: { success: true, quest: { id: 'q1' }, class_attached: true } })
})

const renderModal = (props = {}) => render(
  <MemoryRouter>
    <CreateQuestModal isOpen onClose={() => {}} {...props} />
  </MemoryRouter>,
)

describe('CreateQuestModal class picker', () => {
  it('sends the class the learner picked', async () => {
    renderModal()
    fireEvent.change(await screen.findByLabelText('Is this for a class?'), { target: { value: 'c1' } })
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Create Quest' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/quests/create', {
      title: 'Minerals in Rocks', big_idea: 'What rocks are made of', class_id: 'c1',
    }))
  })

  it('opens on the class it was started from', async () => {
    renderModal({ initialClassId: 'c1' })
    expect(await screen.findByLabelText('Is this for a class?')).toHaveValue('c1')
  })

  it('sends no class for a quest that is just for the learner', async () => {
    renderModal()
    await screen.findByLabelText('Is this for a class?')
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Create Quest' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/quests/create', {
      title: 'Minerals in Rocks', big_idea: 'What rocks are made of',
    }))
  })
})
