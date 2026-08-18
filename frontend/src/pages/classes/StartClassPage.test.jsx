import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

let authState = { user: { id: 's1', role: 'student', date_of_birth: '2008-01-01' }, refreshUser: vi.fn() }
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState,
}))

const apiPost = vi.fn()
const apiPut = vi.fn()
vi.mock('../../services/api', () => ({
  default: {
    post: (...args) => apiPost(...args),
    put: (...args) => apiPut(...args),
  },
}))

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import StartClassPage from './StartClassPage'

const olderThan = (years) => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10)
}

function renderPage() {
  return render(
    <MemoryRouter>
      <StartClassPage />
    </MemoryRouter>,
  )
}

// Walks steps 1 and 2, leaving the page on the final (details) step.
async function fillToLastStep(user, { title = 'Soccer Conditioning', subject = /^Fine Arts /i } = {}) {
  await user.type(screen.getByLabelText(/name your class/i), title)
  await user.click(screen.getByRole('button', { name: /^next$/i }))
  await user.click(screen.getByRole('button', { name: subject }))
  await user.click(screen.getByRole('button', { name: /^next$/i }))
}

describe('StartClassPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = {
      user: { id: 's1', role: 'student', date_of_birth: olderThan(16) },
      refreshUser: vi.fn(),
    }
    apiPost.mockResolvedValue({ data: { quest_id: 'q-123' } })
    apiPut.mockResolvedValue({ data: {} })
  })

  it('blocks advancing until the class has a name', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled()
    await user.type(screen.getByLabelText(/name your class/i), 'Soccer Conditioning')
    expect(screen.getByRole('button', { name: /^next$/i })).toBeEnabled()
  })

  it('blocks advancing past the subject step until one is picked', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/name your class/i), 'Soccer Conditioning')
    await user.click(screen.getByRole('button', { name: /^next$/i }))

    expect(screen.getByText(/which subject should this count toward/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /^PE / }))
    expect(screen.getByRole('button', { name: /^next$/i })).toBeEnabled()
  })

  it('teaches the credit loop on the first step', () => {
    renderPage()
    expect(screen.getByText(/how a class works/i)).toBeInTheDocument()
    expect(screen.getByText(/1,000 XP earns a credit/i)).toBeInTheDocument()
  })

  it('creates the class with the class quest payload and lands on it', async () => {
    const user = userEvent.setup()
    renderPage()

    await fillToLastStep(user)
    await user.type(screen.getByLabelText(/what are you actually doing/i), 'Running 3x a week')
    await user.click(screen.getByRole('button', { name: /create class/i }))

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1))
    expect(apiPost).toHaveBeenCalledWith('/api/quests/create', {
      title: 'Soccer Conditioning',
      description: 'Running 3x a week',
      quest_type: 'class',
      transcript_subject: 'fine_arts',
    })
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/quests/q-123'))
  })

  it('omits an empty description rather than sending a blank string', async () => {
    const user = userEvent.setup()
    renderPage()

    await fillToLastStep(user)
    await user.click(screen.getByRole('button', { name: /create class/i }))

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1))
    expect(apiPost.mock.calls[0][1].description).toBeUndefined()
  })

  // The class is created empty on purpose: tasks are authored on the class page,
  // where the AI wizard lives, so there is one canonical task-creation surface.
  it('calls no AI endpoints while creating', async () => {
    const user = userEvent.setup()
    renderPage()

    await fillToLastStep(user)
    await user.click(screen.getByRole('button', { name: /create class/i }))

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1))
    const paths = apiPost.mock.calls.map((c) => c[0])
    expect(paths).toEqual(['/api/quests/create'])
  })

  it('stays put when creation fails so the student can retry', async () => {
    apiPost.mockRejectedValue({ response: { data: { error: { message: 'nope' } } } })
    const user = userEvent.setup()
    renderPage()

    await fillToLastStep(user)
    await user.click(screen.getByRole('button', { name: /create class/i }))

    await waitFor(() => expect(apiPost).toHaveBeenCalled())
    expect(navigate).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: /create class/i })).toBeEnabled()
  })

  describe('age gate', () => {
    it('asks for a birthday first when none is on file', async () => {
      authState.user = { id: 's1', role: 'student', date_of_birth: null }
      const user = userEvent.setup()
      renderPage()

      expect(screen.getByLabelText(/date of birth/i)).toBeInTheDocument()
      expect(screen.queryByLabelText(/name your class/i)).not.toBeInTheDocument()

      await user.type(screen.getByLabelText(/date of birth/i), '2008-05-04')
      await user.click(screen.getByRole('button', { name: /save and continue/i }))

      await waitFor(() =>
        expect(apiPut).toHaveBeenCalledWith('/api/users/profile', { date_of_birth: '2008-05-04' }),
      )
      expect(authState.refreshUser).toHaveBeenCalled()
    })

    it('surfaces the backend refusal of an under-13 birthday', async () => {
      authState.user = { id: 's1', role: 'student', date_of_birth: null }
      apiPut.mockRejectedValue({
        response: { data: { error: { message: 'Students must be at least 13' } } },
      })
      const user = userEvent.setup()
      renderPage()

      await user.type(screen.getByLabelText(/date of birth/i), '2018-05-04')
      await user.click(screen.getByRole('button', { name: /save and continue/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent(/at least 13/i)
    })

    it('blocks a student who is known to be under 13', () => {
      authState.user = { id: 's1', role: 'student', date_of_birth: olderThan(11) }
      renderPage()

      expect(screen.getByText(/classes unlock at 13/i)).toBeInTheDocument()
      expect(screen.queryByLabelText(/name your class/i)).not.toBeInTheDocument()
    })
  })
})
