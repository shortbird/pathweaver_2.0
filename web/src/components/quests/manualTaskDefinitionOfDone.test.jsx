/**
 * The Definition of Done on a family-written task, and the optional AI help.
 *
 * Where the child's school requires a Definition of Done, a task without one
 * is refused at the form (not after a round trip). "Help me finish this" fills
 * only the gaps the family left, and keeps what they typed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ManualTaskCreator from './ManualTaskCreator'
import api from '../../services/api'
import FamilyScopeContext from '../../contexts/FamilyScopeContext'

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../hooks/useHidePillars', () => ({ default: () => false }))

const QUEST = 'quest-dod'

const rulesResponse = (overrides = {}) => ({
  data: { success: true, requires_success_criteria: false, can_edit_xp: true, ...overrides },
})

const renderCreator = () =>
  render(
    <ManualTaskCreator questId={QUEST} sessionId="s" onTasksCreated={vi.fn()} onCancel={vi.fn()} />
  )

const fillBasics = (title = 'Play chess', description = 'Play games against people') => {
  fireEvent.change(screen.getByLabelText(/Task Title/i), { target: { value: title } })
  if (description !== null) {
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: description } })
  }
  fireEvent.change(screen.getByLabelText(/^Pillar/i), { target: { value: 'stem' } })
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('Definition of Done on manual tasks', () => {
  it('blocks adding a task without one where the school requires it', async () => {
    api.get.mockResolvedValue(rulesResponse({ requires_success_criteria: true }))
    renderCreator()
    await waitFor(() => expect(screen.getByText(/Definition of Done \*/)).toBeInTheDocument())

    fillBasics()
    fireEvent.click(screen.getByRole('button', { name: /Add This Task/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/asks for a Definition of Done/i)
    expect(screen.queryByText(/Your Tasks/)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Definition of Done line 1'), {
      target: { value: 'You played 5 games' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Add This Task/i }))
    expect(screen.getByText(/Your Tasks \(1\)/)).toBeInTheDocument()
  })

  it('sends the lines with the batch, trimmed and without blanks', async () => {
    api.get.mockResolvedValue(rulesResponse())
    api.post.mockResolvedValue({ data: { success: true, tasks: [] } })
    renderCreator()

    fillBasics()
    fireEvent.change(screen.getByLabelText('Definition of Done line 1'), {
      target: { value: '  You played 5 games ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Add a line/i }))
    fireEvent.click(screen.getByRole('button', { name: /Add This Task/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Finish/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe(`/api/quests/${QUEST}/add-manual-tasks`)
    expect(body.tasks[0].success_criteria).toEqual(['You played 5 games'])
  })

  it('keeps the lines in the local draft', async () => {
    api.get.mockResolvedValue(rulesResponse())
    const { unmount } = renderCreator()
    fireEvent.change(screen.getByLabelText('Definition of Done line 1'), {
      target: { value: 'You played 5 games' },
    })
    unmount()

    renderCreator()
    expect(screen.getByLabelText('Definition of Done line 1')).toHaveValue('You played 5 games')
  })
})

describe('Help me finish this', () => {
  it('fills the gaps and keeps what the family typed', async () => {
    api.get.mockResolvedValue(rulesResponse())
    api.post.mockResolvedValue({
      data: {
        success: true,
        description: 'AI description',
        success_criteria: ['You played 5 games', 'You wrote down one mistake per game'],
        suggested_xp: 75,
        xp_rationale: 'About two hours of play.',
        suggested_pillar: 'wellness',
        diploma_subjects: { Math: 60, Electives: 40 },
        suggestions: [],
      },
    })
    renderCreator()

    const aiButton = screen.getByRole('button', { name: /Help me finish this/i })
    expect(aiButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Task Title/i), { target: { value: 'Play chess' } })
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: 'My own words' } })
    fireEvent.change(screen.getByLabelText('Definition of Done line 1'), {
      target: { value: 'You played 5 games' },
    })
    fireEvent.click(aiButton)

    await waitFor(() => expect(screen.getByLabelText('Definition of Done line 2')).toHaveValue(
      'You wrote down one mistake per game'
    ))
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe(`/api/quests/${QUEST}/analyze-manual-task`)
    expect(body).toMatchObject({
      title: 'Play chess', description: 'My own words', success_criteria: ['You played 5 games'],
    })

    // Their description stays; the empty choices are filled.
    expect(screen.getByLabelText(/Description/i)).toHaveValue('My own words')
    expect(screen.getByLabelText(/Task Size/i)).toHaveValue('75')
    expect(screen.getByLabelText(/Counts toward credit/i)).toHaveValue('Math')
    expect(screen.getByLabelText(/^Pillar/i)).toHaveValue('wellness')
    expect(screen.getByTestId('xp-rationale')).toHaveTextContent('About two hours of play.')
  })

  it("shows the server's message when AI help is turned off", async () => {
    api.get.mockResolvedValue(rulesResponse())
    api.post.mockRejectedValue({
      response: { status: 403, data: { error: 'AI help is turned off for this student.' } },
    })
    renderCreator()
    fireEvent.change(screen.getByLabelText(/Task Title/i), { target: { value: 'Play chess' } })
    fireEvent.click(screen.getByRole('button', { name: /Help me finish this/i }))

    expect(await screen.findByText('AI help is turned off for this student.')).toBeInTheDocument()
  })

  it("leaves XP alone where the child's school does not let the family set it", async () => {
    api.get.mockResolvedValue(rulesResponse({ can_edit_xp: false }))
    api.post.mockResolvedValue({
      data: {
        success: true, description: 'd', success_criteria: ['You did it'], suggested_xp: 200,
        xp_rationale: 'Big.', suggested_pillar: 'stem', diploma_subjects: {}, suggestions: [],
      },
    })
    // A parent working as their child: XP is the child's school's call.
    render(
      <FamilyScopeContext.Provider value={{
        selectedChildId: 'child-1', selectedChild: { id: 'child-1', firstName: 'Kid' },
      }}>
        <ManualTaskCreator questId={QUEST} sessionId="s" onTasksCreated={vi.fn()} onCancel={vi.fn()} />
      </FamilyScopeContext.Provider>
    )
    await waitFor(() => expect(screen.queryByLabelText(/Task Size/i)).not.toBeInTheDocument())
    expect(api.get).toHaveBeenCalledWith('/api/tasks/authoring-rules', { params: { student_id: 'child-1' } })
    fireEvent.change(screen.getByLabelText(/Task Title/i), { target: { value: 'Play chess' } })
    fireEvent.click(screen.getByRole('button', { name: /Help me finish this/i }))

    await waitFor(() => expect(screen.getByLabelText('Definition of Done line 1')).toHaveValue('You did it'))
    expect(api.post.mock.calls[0][1].student_id).toBe('child-1')
    expect(screen.queryByLabelText(/Task Size/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('xp-rationale')).not.toBeInTheDocument()
  })
})

describe('13 and older write against diploma subjects only', () => {
  it('hides the pillar picker and sends no pillar when the server says so', async () => {
    api.get.mockResolvedValue(rulesResponse({ hide_pillars: true }))
    api.post.mockResolvedValue({ data: { success: true, tasks: [] } })
    renderCreator()
    await waitFor(() => expect(screen.queryByLabelText(/^Pillar/i)).not.toBeInTheDocument())
    expect(screen.getByLabelText(/Counts toward credit \*/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Task Title/i), { target: { value: 'Play chess' } })
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: 'Play games' } })
    fireEvent.change(screen.getByLabelText('Definition of Done line 1'), {
      target: { value: 'You played 5 games' },
    })
    fireEvent.change(screen.getByLabelText(/Counts toward credit/), { target: { value: 'Math' } })
    fireEvent.click(screen.getByRole('button', { name: /Add This Task/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Finish/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const task = api.post.mock.calls[0][1].tasks[0]
    expect(task.pillar).toBeUndefined()
    expect(task.diploma_subjects).toBeTruthy()
  })

  it('keeps the pillar picker for younger learners', async () => {
    api.get.mockResolvedValue(rulesResponse({ hide_pillars: false }))
    renderCreator()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.getByLabelText(/^Pillar/i)).toBeInTheDocument()
  })
})
