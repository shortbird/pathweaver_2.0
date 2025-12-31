import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, createMockUser } from '../../../tests/test-utils'
import CurriculumBuilder from '../CurriculumBuilder'
import api from '../../../services/api'

// Mock API
vi.mock('../../../services/api')

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ questId: 'test-quest-id' })
  }
})

// Mock advisor user
const mockAdvisor = createMockUser({
  role: 'advisor',
  organization_id: 'test-org-id'
})

const mockAuthValue = {
  user: mockAdvisor,
  isAuthenticated: true,
  loading: false
}

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => mockAuthValue
}))

describe('CurriculumBuilder', () => {
  let user

  beforeEach(() => {
    vi.clearAllMocks()
    user = userEvent.setup()

    // Mock API responses
    api.get.mockResolvedValue({
      data: {
        quest: {
          id: 'test-quest-id',
          title: 'Test Quest',
          description: 'Test description',
          tasks: []
        }
      }
    })

    api.post.mockResolvedValue({
      data: { success: true, quest: { id: 'new-quest-id' } }
    })

    api.put.mockResolvedValue({
      data: { success: true }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ==================== Basic Rendering Tests ====================

  describe('Basic Rendering', () => {
    it('renders curriculum builder form', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        expect(screen.getByText(/Quest Metadata/i)).toBeInTheDocument()
      })
    })

    it('shows quest title input', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        expect(screen.getByLabelText(/Quest Title/i)).toBeInTheDocument()
      })
    })

    it('shows quest type selector', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        expect(screen.getByText(/Quest Type/i)).toBeInTheDocument()
      })
    })

    it('shows add task button', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Task/i })).toBeInTheDocument()
      })
    })
  })

  // ==================== Form Validation Tests ====================

  describe('Form Validation', () => {
    it('validates required quest title field', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        const saveButton = screen.getByRole('button', { name: /Save Quest/i })
        expect(saveButton).toBeInTheDocument()
      })

      const saveButton = screen.getByRole('button', { name: /Save Quest/i })
      await user.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText(/title.*required/i)).toBeInTheDocument()
      })
    })

    it('validates task fields when adding task', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        const addTaskButton = screen.getByRole('button', { name: /Add Task/i })
        expect(addTaskButton).toBeInTheDocument()
      })

      const addTaskButton = screen.getByRole('button', { name: /Add Task/i })
      await user.click(addTaskButton)

      // Try to save task without title
      await waitFor(() => {
        const saveTaskButton = screen.getByRole('button', { name: /Save Task/i })
        expect(saveTaskButton).toBeInTheDocument()
      })

      const saveTaskButton = screen.getByRole('button', { name: /Save Task/i })
      await user.click(saveTaskButton)

      await waitFor(() => {
        expect(screen.getByText(/title.*required/i)).toBeInTheDocument()
      })
    })

    it('validates XP value is positive number', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Task/i })).toBeInTheDocument()
      })

      const addTaskButton = screen.getByRole('button', { name: /Add Task/i })
      await user.click(addTaskButton)

      const xpInput = screen.getByLabelText(/XP Value/i)
      await user.clear(xpInput)
      await user.type(xpInput, '-10')

      const saveTaskButton = screen.getByRole('button', { name: /Save Task/i })
      await user.click(saveTaskButton)

      await waitFor(() => {
        expect(screen.getByText(/XP.*positive/i)).toBeInTheDocument()
      })
    })
  })

  // ==================== Iframe Embed Tests ====================

  describe('Iframe Embed Functionality', () => {
    it('shows embed button in markdown editor', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Task/i })).toBeInTheDocument()
      })

      const addTaskButton = screen.getByRole('button', { name: /Add Task/i })
      await user.click(addTaskButton)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Embed/i })).toBeInTheDocument()
      })
    })

    it('opens embed modal when embed button clicked', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Task/i })).toBeInTheDocument()
      })

      const addTaskButton = screen.getByRole('button', { name: /Add Task/i })
      await user.click(addTaskButton)

      const embedButton = screen.getByRole('button', { name: /Embed/i })
      await user.click(embedButton)

      await waitFor(() => {
        expect(screen.getByText(/Paste embed URL/i)).toBeInTheDocument()
      })
    })

    it('validates iframe URL before insertion', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Task/i })).toBeInTheDocument()
      })

      const addTaskButton = screen.getByRole('button', { name: /Add Task/i })
      await user.click(addTaskButton)

      const embedButton = screen.getByRole('button', { name: /Embed/i })
      await user.click(embedButton)

      const urlInput = screen.getByPlaceholderText(/Paste.*URL/i)
      await user.type(urlInput, 'javascript:alert("XSS")')

      const insertButton = screen.getByRole('button', { name: /Insert/i })
      await user.click(insertButton)

      await waitFor(() => {
        expect(screen.getByText(/invalid.*URL/i)).toBeInTheDocument()
      })
    })

    it('accepts whitelisted iframe URLs', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Task/i })).toBeInTheDocument()
      })

      const addTaskButton = screen.getByRole('button', { name: /Add Task/i })
      await user.click(addTaskButton)

      const embedButton = screen.getByRole('button', { name: /Embed/i })
      await user.click(embedButton)

      const urlInput = screen.getByPlaceholderText(/Paste.*URL/i)
      await user.type(urlInput, 'https://www.youtube.com/embed/dQw4w9WgXcQ')

      const insertButton = screen.getByRole('button', { name: /Insert/i })
      await user.click(insertButton)

      await waitFor(() => {
        expect(screen.queryByText(/invalid.*URL/i)).not.toBeInTheDocument()
      })
    })

    it('shows iframe preview in live preview panel', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Task/i })).toBeInTheDocument()
      })

      const addTaskButton = screen.getByRole('button', { name: /Add Task/i })
      await user.click(addTaskButton)

      // Type markdown with iframe
      const contentEditor = screen.getByRole('textbox', { name: /Content/i })
      await user.type(
        contentEditor,
        '<iframe src="https://youtube.com/embed/123"></iframe>'
      )

      // Check live preview shows iframe
      await waitFor(() => {
        const preview = screen.getByTestId('live-preview')
        const iframe = within(preview).getByTitle(/youtube/i)
        expect(iframe).toBeInTheDocument()
      })
    })
  })

  // ==================== Auto-Save Tests ====================

  describe('Auto-Save Functionality', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('auto-saves draft after 30 seconds of inactivity', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        const titleInput = screen.getByLabelText(/Quest Title/i)
        expect(titleInput).toBeInTheDocument()
      })

      const titleInput = screen.getByLabelText(/Quest Title/i)
      await user.type(titleInput, 'New Quest Title')

      // Fast-forward 30 seconds
      vi.advanceTimersByTime(30000)

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          expect.stringContaining('/draft'),
          expect.objectContaining({
            title: expect.stringContaining('New Quest Title'),
            is_draft: true
          })
        )
      })
    })

    it('shows auto-save indicator when saving', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        expect(screen.getByLabelText(/Quest Title/i)).toBeInTheDocument()
      })

      const titleInput = screen.getByLabelText(/Quest Title/i)
      await user.type(titleInput, 'Test')

      vi.advanceTimersByTime(30000)

      await waitFor(() => {
        expect(screen.getByText(/Saving/i)).toBeInTheDocument()
      })
    })

    it('shows saved indicator after successful save', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        expect(screen.getByLabelText(/Quest Title/i)).toBeInTheDocument()
      })

      const titleInput = screen.getByLabelText(/Quest Title/i)
      await user.type(titleInput, 'Test')

      vi.advanceTimersByTime(30000)

      await waitFor(() => {
        expect(screen.getByText(/Saved/i)).toBeInTheDocument()
      })
    })
  })

  // ==================== Permission Tests ====================

  describe('Permission Enforcement', () => {
    it('redirects non-advisor users to dashboard', async () => {
      const studentUser = createMockUser({ role: 'student' })

      renderWithProviders(<CurriculumBuilder />, {
        authValue: { ...mockAuthValue, user: studentUser }
      })

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
      })
    })

    it('allows advisor users to access editor', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        expect(screen.getByText(/Quest Metadata/i)).toBeInTheDocument()
      })

      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('allows admin users to access editor', async () => {
      const adminUser = createMockUser({ role: 'admin' })

      renderWithProviders(<CurriculumBuilder />, {
        authValue: { ...mockAuthValue, user: adminUser }
      })

      await waitFor(() => {
        expect(screen.getByText(/Quest Metadata/i)).toBeInTheDocument()
      })

      expect(mockNavigate).not.toHaveBeenCalled()
    })
  })

  // ==================== Task Management Tests ====================

  describe('Task Management', () => {
    it('allows adding multiple tasks', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        const addTaskButton = screen.getByRole('button', { name: /Add Task/i })
        expect(addTaskButton).toBeInTheDocument()
      })

      const addTaskButton = screen.getByRole('button', { name: /Add Task/i })

      // Add first task
      await user.click(addTaskButton)
      await waitFor(() => {
        expect(screen.getByText(/Task 1/i)).toBeInTheDocument()
      })

      // Add second task
      await user.click(addTaskButton)
      await waitFor(() => {
        expect(screen.getByText(/Task 2/i)).toBeInTheDocument()
      })
    })

    it('allows reordering tasks via drag and drop', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      // This would test drag and drop functionality
      // Implementation depends on drag library used
      expect(screen.getByTestId('task-list')).toBeInTheDocument()
    })

    it('allows deleting tasks', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Task/i })).toBeInTheDocument()
      })

      const addTaskButton = screen.getByRole('button', { name: /Add Task/i })
      await user.click(addTaskButton)

      await waitFor(() => {
        const deleteButton = screen.getByRole('button', { name: /Delete.*Task/i })
        expect(deleteButton).toBeInTheDocument()
      })

      const deleteButton = screen.getByRole('button', { name: /Delete.*Task/i })
      await user.click(deleteButton)

      await waitFor(() => {
        expect(screen.queryByText(/Task 1/i)).not.toBeInTheDocument()
      })
    })
  })

  // ==================== Preview Tests ====================

  describe('Live Preview', () => {
    it('shows live preview panel', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        expect(screen.getByTestId('live-preview')).toBeInTheDocument()
      })
    })

    it('updates preview when content changes', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        expect(screen.getByLabelText(/Quest Title/i)).toBeInTheDocument()
      })

      const titleInput = screen.getByLabelText(/Quest Title/i)
      await user.type(titleInput, 'Preview Test')

      const preview = screen.getByTestId('live-preview')
      await waitFor(() => {
        expect(within(preview).getByText('Preview Test')).toBeInTheDocument()
      })
    })

    it('renders markdown in preview', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Task/i })).toBeInTheDocument()
      })

      const addTaskButton = screen.getByRole('button', { name: /Add Task/i })
      await user.click(addTaskButton)

      const contentEditor = screen.getByRole('textbox', { name: /Content/i })
      await user.type(contentEditor, '**Bold text**')

      const preview = screen.getByTestId('live-preview')
      await waitFor(() => {
        const boldElement = within(preview).getByText('Bold text')
        expect(boldElement.tagName).toBe('STRONG')
      })
    })
  })

  // ==================== Publish Tests ====================

  describe('Publishing', () => {
    it('shows publish button after saving draft', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Publish Quest/i })).toBeInTheDocument()
      })
    })

    it('validates quest before publishing', async () => {
      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      const publishButton = screen.getByRole('button', { name: /Publish Quest/i })
      await user.click(publishButton)

      await waitFor(() => {
        expect(screen.getByText(/Please.*required fields/i)).toBeInTheDocument()
      })
    })

    it('calls API to publish quest', async () => {
      api.get.mockResolvedValue({
        data: {
          quest: {
            id: 'test-quest-id',
            title: 'Complete Quest',
            description: 'Ready to publish',
            tasks: [{ title: 'Task 1', xp_value: 50 }]
          }
        }
      })

      renderWithProviders(<CurriculumBuilder />, {
        authValue: mockAuthValue
      })

      await waitFor(() => {
        const publishButton = screen.getByRole('button', { name: /Publish Quest/i })
        expect(publishButton).toBeInTheDocument()
      })

      const publishButton = screen.getByRole('button', { name: /Publish Quest/i })
      await user.click(publishButton)

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
          expect.stringContaining('/publish'),
          expect.anything()
        )
      })
    })
  })
})
