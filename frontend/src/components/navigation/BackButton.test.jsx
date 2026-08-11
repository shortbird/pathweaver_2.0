import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BackButton from './BackButton'

const mockNavigate = vi.fn()
let authState = {}

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BackButton />
    </MemoryRouter>
  )
}

// With no in-app history entry to pop (deep link / external referrer), the
// button falls back by URL segment; from a single-segment page it goes "home".
// Home must be the signed-in user's app home, not the marketing homepage.
describe('BackButton deep-link fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = { user: { id: 'u1', role: 'parent' }, effectiveRole: 'parent' }
  })

  it('sends a signed-in user to their role home from a single-segment page', () => {
    renderAt('/absences')
    fireEvent.click(screen.getByLabelText('Go back'))
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('sends an anonymous visitor to the homepage', () => {
    authState = { user: null, effectiveRole: null }
    renderAt('/absences')
    fireEvent.click(screen.getByLabelText('Go back'))
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('still steps up one segment on nested paths', () => {
    authState = { user: { id: 'u1', role: 'student' }, effectiveRole: 'student' }
    renderAt('/quests/abc123')
    fireEvent.click(screen.getByLabelText('Go back'))
    expect(mockNavigate).toHaveBeenCalledWith('/quests')
  })

  it('renders nothing on tab roots', () => {
    const { container } = renderAt('/dashboard')
    expect(container.firstChild).toBeNull()
  })
})
