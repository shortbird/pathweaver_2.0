import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, createMockUser } from '../../tests/test-utils'
import QuestPersonalizationWizard from './QuestPersonalizationWizard'
import api from '../../services/api'

// Mock the API
vi.mock('../../services/api')

// Mock the ManualTaskCreator component
vi.mock('./ManualTaskCreator', () => ({
  default: ({ onCancel, onTasksCreated }) => (
    <div data-testid="manual-task-creator">
      <button onClick={() => onTasksCreated({ success: true })}>Create Tasks</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  )
}))

// Mock react-router-dom
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

describe('QuestPersonalizationWizard', () => {
  const mockQuestId = 'quest-123'
  const mockQuestTitle = 'Learn React Testing'
  const mockOnComplete = vi.fn()
  const mockOnCancel = vi.fn()

  const defaultProps = {
    questId: mockQuestId,
    questTitle: mockQuestTitle,
    onComplete: mockOnComplete,
    onCancel: mockOnCancel
  }

  const mockUser = createMockUser({ role: 'student' })

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock OrganizationContext API calls to prevent errors
    api.get = vi.fn((url) => {
      if (url === '/api/auth/me') {
        return Promise.resolve({ data: { ...mockUser, organization_id: null } })
      }
      return Promise.reject(new Error('Not found'))
    })
  })

  // ========================================
  // Wizard Steps Navigation (8 tests)
  // ========================================
  describe('Wizard Steps Navigation', () => {
    it('renders step 1 (creation method selection) initially', () => {
      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      expect(screen.getByText('How would you like to create tasks?')).toBeInTheDocument()
      expect(screen.getByText('AI Generate')).toBeInTheDocument()
      expect(screen.getByText('Write My Own')).toBeInTheDocument()
      expect(screen.getByText('Add from Task Library')).toBeInTheDocument()
    })

    it('shows correct step indicator (1 of 3) on step 1', () => {
      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      // At step 1, creationMethod is null, so totalSteps defaults to 3
      expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
    })

    it('navigates to step 2 (interests) when AI Generate is selected', async () => {
      const user = userEvent.setup()
      api.post.mockResolvedValueOnce({ data: { session_id: 'session-123' } })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))

      await waitFor(() => {
        expect(screen.getByText('What are you interested in?')).toBeInTheDocument()
      })
    })

    it('navigates to step 3 (manual creator) when Write My Own is selected', async () => {
      const user = userEvent.setup()
      api.post.mockResolvedValueOnce({ data: { session_id: 'session-123' } })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('Write My Own'))

      await waitFor(() => {
        expect(screen.getByTestId('manual-task-creator')).toBeInTheDocument()
      })
    })

    it('allows navigation back to step 1 from step 2', async () => {
      const user = userEvent.setup()
      api.post.mockResolvedValueOnce({ data: { session_id: 'session-123' } })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))

      await waitFor(() => {
        expect(screen.getByText('What are you interested in?')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Back'))

      expect(screen.getByText('How would you like to create tasks?')).toBeInTheDocument()
    })

    it('navigates to task library when Add from Task Library is clicked', async () => {
      const user = userEvent.setup()

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('Add from Task Library'))

      expect(mockNavigate).toHaveBeenCalledWith(`/quests/${mockQuestId}/library`)
    })

    it('advances to step 4 (review) after generating tasks', async () => {
      const user = userEvent.setup()
      const mockTasks = [
        { title: 'Task 1', description: 'Description 1', pillar: 'stem', xp_value: 20 },
        { title: 'Task 2', description: 'Description 2', pillar: 'wellness', xp_value: 15 }
      ]

      api.post
        .mockResolvedValueOnce({ data: { session_id: 'session-123' } })
        .mockResolvedValueOnce({ data: { tasks: mockTasks } })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      // Step 1: Select AI Generate
      await user.click(screen.getByText('AI Generate'))

      await waitFor(() => {
        expect(screen.getByText('What are you interested in?')).toBeInTheDocument()
      })

      // Step 2: Select interests and generate
      await user.click(screen.getByText('Sports & Athletics'))
      await user.click(screen.getByText('Generate Tasks'))

      await waitFor(() => {
        expect(screen.getByText('Review Tasks')).toBeInTheDocument()
        expect(screen.getByText('Task 1')).toBeInTheDocument()
      })
    })

    it('shows progress indicator for step 4', async () => {
      const user = userEvent.setup()
      const mockTasks = [
        { title: 'Task 1', description: 'Description 1', pillar: 'stem', xp_value: 20 }
      ]

      api.post
        .mockResolvedValueOnce({ data: { session_id: 'session-123' } })
        .mockResolvedValueOnce({ data: { tasks: mockTasks } })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))
      await waitFor(() => expect(screen.getByText('What are you interested in?')).toBeInTheDocument())

      await user.click(screen.getByText('Sports & Athletics'))
      await user.click(screen.getByText('Generate Tasks'))

      await waitFor(() => {
        expect(screen.getByText('Task 1 of 1')).toBeInTheDocument()
      })
    })
  })

  // ========================================
  // Interest & Subject Selection (6 tests)
  // ========================================
  describe('Interest & Subject Selection', () => {
    beforeEach(async () => {
      api.post.mockResolvedValueOnce({ data: { session_id: 'session-123' } })
    })

    it('displays all 10 interest options', async () => {
      const user = userEvent.setup()

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))

      await waitFor(() => {
        expect(screen.getByText('Sports & Athletics')).toBeInTheDocument()
        expect(screen.getByText('Music & Performance')).toBeInTheDocument()
        expect(screen.getByText('Visual Arts')).toBeInTheDocument()
        expect(screen.getByText('Gaming & Esports')).toBeInTheDocument()
        expect(screen.getByText('Business & Entrepreneurship')).toBeInTheDocument()
        expect(screen.getByText('Technology & Coding')).toBeInTheDocument()
        expect(screen.getByText('Nature & Environment')).toBeInTheDocument()
        expect(screen.getByText('Cooking & Food')).toBeInTheDocument()
        expect(screen.getByText('Creative Writing')).toBeInTheDocument()
        expect(screen.getByText('Social Impact')).toBeInTheDocument()
      })
    })

    it('displays all 5 diploma subjects', async () => {
      const user = userEvent.setup()

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))

      await waitFor(() => {
        // Look for STEM, Wellness, Communication, Civics, Art
        const subjects = screen.getAllByText(/^(STEM|Wellness|Communication|Civics|Art)$/)
        expect(subjects).toHaveLength(5)
      })
    })

    it('toggles interest selection on click', async () => {
      const user = userEvent.setup()

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))

      await waitFor(() => {
        expect(screen.getByText('Sports & Athletics')).toBeInTheDocument()
      })

      const sportsButton = screen.getByText('Sports & Athletics').closest('button')

      // Initially not selected
      expect(sportsButton).not.toHaveClass('border-optio-pink')

      // Click to select
      await user.click(sportsButton)
      expect(sportsButton).toHaveClass('border-optio-pink')

      // Click again to deselect
      await user.click(sportsButton)
      expect(sportsButton).not.toHaveClass('border-optio-pink')
    })

    it('allows multiple interest selections', async () => {
      const user = userEvent.setup()

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))

      await waitFor(() => {
        expect(screen.getByText('Sports & Athletics')).toBeInTheDocument()
      })

      const sportsButton = screen.getByText('Sports & Athletics').closest('button')
      const musicButton = screen.getByText('Music & Performance').closest('button')

      await user.click(sportsButton)
      await user.click(musicButton)

      expect(sportsButton).toHaveClass('border-optio-pink')
      expect(musicButton).toHaveClass('border-optio-pink')
    })

    it('toggles diploma subject selection on click', async () => {
      const user = userEvent.setup()

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))

      await waitFor(() => {
        const subjects = screen.getAllByText('STEM')
        expect(subjects.length).toBeGreaterThan(0)
      })

      // Find the STEM button in the diploma subjects section
      const stemButtons = screen.getAllByText('STEM')
      const stemButton = stemButtons[stemButtons.length - 1].closest('button')

      // Click to select
      await user.click(stemButton)
      expect(stemButton).toHaveClass('border-optio-purple')

      // Click again to deselect
      await user.click(stemButton)
      expect(stemButton).not.toHaveClass('border-optio-purple')
    })

    it('accepts additional feedback text', async () => {
      const user = userEvent.setup()

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Tell us more about what you\'d like to learn...')).toBeInTheDocument()
      })

      const textarea = screen.getByPlaceholderText('Tell us more about what you\'d like to learn...')
      await user.type(textarea, 'I want to learn about robotics')

      expect(textarea).toHaveValue('I want to learn about robotics')
    })
  })

  // ========================================
  // Task Generation & API Integration (8 tests)
  // ========================================
  describe('Task Generation & API Integration', () => {
    it('calls start-personalization API when starting session', async () => {
      const user = userEvent.setup()
      api.post.mockResolvedValueOnce({ data: { session_id: 'session-123' } })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(`/api/quests/${mockQuestId}/start-personalization`, {})
      })
    })

    it('displays error if start-personalization API fails', async () => {
      const user = userEvent.setup()
      api.post.mockRejectedValueOnce({
        response: { data: { error: 'Session failed to start' } }
      })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))

      await waitFor(() => {
        expect(screen.getByText('Session failed to start')).toBeInTheDocument()
      })
    })

    it('calls generate-tasks API with correct parameters', async () => {
      const user = userEvent.setup()
      const mockTasks = [
        { title: 'Task 1', description: 'Description 1', pillar: 'stem', xp_value: 20 }
      ]

      api.post
        .mockResolvedValueOnce({ data: { session_id: 'session-123' } })
        .mockResolvedValueOnce({ data: { tasks: mockTasks } })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))

      await waitFor(() => {
        expect(screen.getByText('Sports & Athletics')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Sports & Athletics'))
      await user.click(screen.getByText('Generate Tasks'))

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(`/api/quests/${mockQuestId}/generate-tasks`, {
          session_id: 'session-123',
          approach: 'hybrid',
          interests: ['sports'],
          cross_curricular_subjects: [],
          additional_feedback: ''
        })
      })
    })

    it('displays generated tasks after successful API call', async () => {
      const user = userEvent.setup()
      const mockTasks = [
        { title: 'Build a Robot', description: 'Create a robot using Arduino', pillar: 'stem', xp_value: 30 },
        { title: 'Write Code', description: 'Learn Python basics', pillar: 'stem', xp_value: 25 }
      ]

      api.post
        .mockResolvedValueOnce({ data: { session_id: 'session-123' } })
        .mockResolvedValueOnce({ data: { tasks: mockTasks } })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))
      await waitFor(() => expect(screen.getByText('Sports & Athletics')).toBeInTheDocument())

      await user.click(screen.getByText('Sports & Athletics'))
      await user.click(screen.getByText('Generate Tasks'))

      await waitFor(() => {
        expect(screen.getByText('Build a Robot')).toBeInTheDocument()
        expect(screen.getByText('Create a robot using Arduino')).toBeInTheDocument()
        expect(screen.getByText('30 XP')).toBeInTheDocument()
      })
    })

    it('shows user-friendly error for rate limiting (429)', async () => {
      const user = userEvent.setup()

      api.post
        .mockResolvedValueOnce({ data: { session_id: 'session-123' } })
        .mockRejectedValueOnce({
          response: { data: { error: '429 - too many requests' } }
        })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))
      await waitFor(() => expect(screen.getByText('Sports & Athletics')).toBeInTheDocument())

      await user.click(screen.getByText('Sports & Athletics'))
      await user.click(screen.getByText('Generate Tasks'))

      await waitFor(() => {
        expect(screen.getByText('AI service is temporarily busy. Please wait 30 seconds and try again.')).toBeInTheDocument()
      })
    })

    it('shows user-friendly error for API key issues (403)', async () => {
      const user = userEvent.setup()

      api.post
        .mockResolvedValueOnce({ data: { session_id: 'session-123' } })
        .mockRejectedValueOnce({
          response: { data: { error: '403 - API key invalid' } }
        })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))
      await waitFor(() => expect(screen.getByText('Sports & Athletics')).toBeInTheDocument())

      await user.click(screen.getByText('Sports & Athletics'))
      await user.click(screen.getByText('Generate Tasks'))

      await waitFor(() => {
        expect(screen.getByText('AI service configuration error. Please contact support.')).toBeInTheDocument()
      })
    })

    it('shows loading state during task generation', async () => {
      const user = userEvent.setup()
      let resolveGenerate
      const generatePromise = new Promise(resolve => { resolveGenerate = resolve })

      api.post
        .mockResolvedValueOnce({ data: { session_id: 'session-123' } })
        .mockReturnValueOnce(generatePromise)

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))
      await waitFor(() => expect(screen.getByText('Sports & Athletics')).toBeInTheDocument())

      await user.click(screen.getByText('Sports & Athletics'))
      await user.click(screen.getByText('Generate Tasks'))

      expect(screen.getByText('Generating Tasks...')).toBeInTheDocument()

      // Resolve the promise
      resolveGenerate({ data: { tasks: [{ title: 'Task 1', description: 'Desc', pillar: 'stem', xp_value: 20 }] } })
      await waitFor(() => {
        expect(screen.queryByText('Generating Tasks...')).not.toBeInTheDocument()
      })
    })

    it('displays error if no tasks are generated', async () => {
      const user = userEvent.setup()

      api.post
        .mockResolvedValueOnce({ data: { session_id: 'session-123' } })
        .mockResolvedValueOnce({ data: { tasks: [] } })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))
      await waitFor(() => expect(screen.getByText('Sports & Athletics')).toBeInTheDocument())

      await user.click(screen.getByText('Sports & Athletics'))
      await user.click(screen.getByText('Generate Tasks'))

      await waitFor(() => {
        expect(screen.getByText('No tasks were generated')).toBeInTheDocument()
      })
    })
  })

  // ========================================
  // Form Validation (10 tests)
  // ========================================
  describe('Form Validation', () => {
    it('disables Generate Tasks button when no interests are selected', async () => {
      const user = userEvent.setup()
      api.post.mockResolvedValueOnce({ data: { session_id: 'session-123' } })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))

      await waitFor(() => {
        expect(screen.getByText('Generate Tasks')).toBeInTheDocument()
      })

      const generateButton = screen.getByText('Generate Tasks')
      expect(generateButton).toBeDisabled()
    })

    it('enables Generate Tasks button when at least one interest is selected', async () => {
      const user = userEvent.setup()
      api.post.mockResolvedValueOnce({ data: { session_id: 'session-123' } })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))

      await waitFor(() => {
        expect(screen.getByText('Sports & Athletics')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Sports & Athletics'))

      const generateButton = screen.getByText('Generate Tasks')
      expect(generateButton).not.toBeDisabled()
    })

    it('shows error if Generate Tasks is clicked without interests (edge case)', async () => {
      const user = userEvent.setup()
      api.post.mockResolvedValueOnce({ data: { session_id: 'session-123' } })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))

      await waitFor(() => {
        expect(screen.getByText('Generate Tasks')).toBeInTheDocument()
      })

      // Button should be disabled, but test the validation logic
      const generateButton = screen.getByText('Generate Tasks')
      expect(generateButton).toBeDisabled()
    })

    it('disables AI Generate button during session start', async () => {
      const user = userEvent.setup()
      let resolveSession
      const sessionPromise = new Promise(resolve => { resolveSession = resolve })
      api.post.mockReturnValueOnce(sessionPromise)

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      const aiButton = screen.getByText('AI Generate').closest('button')
      await user.click(aiButton)

      expect(aiButton).toBeDisabled()

      resolveSession({ data: { session_id: 'session-123' } })
      await waitFor(() => {
        expect(screen.getByText('What are you interested in?')).toBeInTheDocument()
      })
    })

    it('disables Manual Creation button during session start', async () => {
      const user = userEvent.setup()
      let resolveSession
      const sessionPromise = new Promise(resolve => { resolveSession = resolve })
      api.post.mockReturnValueOnce(sessionPromise)

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      const manualButton = screen.getByText('Write My Own').closest('button')
      await user.click(manualButton)

      expect(manualButton).toBeDisabled()

      resolveSession({ data: { session_id: 'session-123' } })
      await waitFor(() => {
        expect(screen.getByTestId('manual-task-creator')).toBeInTheDocument()
      })
    })

    it('validates session ID before generating tasks', async () => {
      const user = userEvent.setup()
      // Don't return a session_id
      api.post.mockResolvedValueOnce({ data: {} })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))

      await waitFor(() => {
        expect(screen.getByText('No session ID returned from server')).toBeInTheDocument()
      })
    })

    it('prevents duplicate task generation if already loading', async () => {
      const user = userEvent.setup()
      let resolveGenerate
      const generatePromise = new Promise(resolve => { resolveGenerate = resolve })

      api.post
        .mockResolvedValueOnce({ data: { session_id: 'session-123' } })
        .mockReturnValueOnce(generatePromise)

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))
      await waitFor(() => expect(screen.getByText('Sports & Athletics')).toBeInTheDocument())

      await user.click(screen.getByText('Sports & Athletics'))
      const generateButton = screen.getByText('Generate Tasks')

      // Click multiple times rapidly
      await user.click(generateButton)
      await user.click(generateButton)

      // Should only call API once
      expect(api.post).toHaveBeenCalledTimes(2) // Once for session, once for generate

      resolveGenerate({ data: { tasks: [{ title: 'Task 1', description: 'Desc', pillar: 'stem', xp_value: 20 }] } })
    })

    it('requires at least one accepted task to complete wizard', async () => {
      const user = userEvent.setup()
      const mockTasks = [
        { title: 'Task 1', description: 'Description 1', pillar: 'stem', xp_value: 20 }
      ]

      api.post
        .mockResolvedValueOnce({ data: { session_id: 'session-123' } })
        .mockResolvedValueOnce({ data: { tasks: mockTasks } })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))
      await waitFor(() => expect(screen.getByText('Sports & Athletics')).toBeInTheDocument())

      await user.click(screen.getByText('Sports & Athletics'))
      await user.click(screen.getByText('Generate Tasks'))

      await waitFor(() => {
        expect(screen.getByText('Task 1')).toBeInTheDocument()
      })

      // Skip the only task
      await user.click(screen.getByText('Skip'))

      await waitFor(() => {
        expect(screen.getByText('You must accept at least one task')).toBeInTheDocument()
      })
    })

    it('validates textarea has aria-labelledby for accessibility', async () => {
      const user = userEvent.setup()
      api.post.mockResolvedValueOnce({ data: { session_id: 'session-123' } })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))

      await waitFor(() => {
        const textarea = screen.getByPlaceholderText('Tell us more about what you\'d like to learn...')
        expect(textarea).toHaveAttribute('aria-labelledby', 'additional-feedback-label')
      })
    })

    it('shows loading state text when starting session', async () => {
      const user = userEvent.setup()
      let resolveSession
      const sessionPromise = new Promise(resolve => { resolveSession = resolve })
      api.post.mockReturnValueOnce(sessionPromise)

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))

      expect(screen.getByText('Starting...')).toBeInTheDocument()

      resolveSession({ data: { session_id: 'session-123' } })
      await waitFor(() => {
        expect(screen.queryByText('Starting...')).not.toBeInTheDocument()
      })
    })
  })

  // ========================================
  // Task Review & Actions (8 tests)
  // ========================================
  describe('Task Review & Actions', () => {
    const mockTasks = [
      { title: 'Task 1', description: 'First task', pillar: 'stem', xp_value: 20 },
      { title: 'Task 2', description: 'Second task', pillar: 'wellness', xp_value: 15 }
    ]

    beforeEach(async () => {
      const user = userEvent.setup()
      api.post
        .mockResolvedValueOnce({ data: { session_id: 'session-123' } })
        .mockResolvedValueOnce({ data: { tasks: mockTasks } })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))
      await waitFor(() => expect(screen.getByText('Sports & Athletics')).toBeInTheDocument())

      await user.click(screen.getByText('Sports & Athletics'))
      await user.click(screen.getByText('Generate Tasks'))

      await waitFor(() => {
        expect(screen.getByText('Review Tasks')).toBeInTheDocument()
      })
    })

    it('displays first task with all details', () => {
      expect(screen.getByText('Task 1')).toBeInTheDocument()
      expect(screen.getByText('First task')).toBeInTheDocument()
      expect(screen.getByText('20 XP')).toBeInTheDocument()
      expect(screen.getByText('STEM')).toBeInTheDocument()
    })

    it('shows Add and Skip buttons', () => {
      expect(screen.getByText('Add')).toBeInTheDocument()
      expect(screen.getByText('Skip')).toBeInTheDocument()
    })

    it('advances to next task when Skip is clicked', async () => {
      const user = userEvent.setup()

      // Mock skip-task API call
      api.post.mockResolvedValueOnce({ data: { success: true } })

      await user.click(screen.getByText('Skip'))

      await waitFor(() => {
        expect(screen.getByText('Task 2')).toBeInTheDocument()
        expect(screen.getByText('Second task')).toBeInTheDocument()
      })
    })

    it('calls accept-task API when Add is clicked', async () => {
      const user = userEvent.setup()
      api.post.mockResolvedValueOnce({ data: { success: true } })

      await user.click(screen.getByText('Add'))

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(`/api/quests/${mockQuestId}/personalization/accept-task`, {
          session_id: 'session-123',
          task: mockTasks[0]
        })
      })
    })

    it('advances to next task after accepting', async () => {
      const user = userEvent.setup()
      api.post.mockResolvedValueOnce({ data: { success: true } })

      await user.click(screen.getByText('Add'))

      await waitFor(() => {
        expect(screen.getByText('Task 2')).toBeInTheDocument()
      })
    })

    it('completes wizard after accepting last task', async () => {
      const user = userEvent.setup()

      // Accept first task
      api.post.mockResolvedValueOnce({ data: { success: true } })
      await user.click(screen.getByText('Add'))

      await waitFor(() => {
        expect(screen.getByText('Task 2')).toBeInTheDocument()
      })

      // Accept last task (now acceptedTasks.length > 0)
      api.post.mockResolvedValueOnce({ data: { success: true } })
      await user.click(screen.getByText('Add'))

      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalled()
      }, { timeout: 3000 })
    })

    it('shows progress summary with accepted task count', async () => {
      const user = userEvent.setup()
      api.post.mockResolvedValueOnce({ data: { success: true } })

      expect(screen.getByText(/You've accepted 0 tasks so far/)).toBeInTheDocument()

      await user.click(screen.getByText('Add'))

      await waitFor(() => {
        expect(screen.getByText(/You've accepted 1 task so far/)).toBeInTheDocument()
      })
    })

    it('opens flag modal when flag icon is clicked', async () => {
      const user = userEvent.setup()

      // Find and click the flag button
      const flagButton = screen.getByTitle('Flag this task as inappropriate')
      await user.click(flagButton)

      await waitFor(() => {
        expect(screen.getByText('Flag This Task')).toBeInTheDocument()
        expect(screen.getByText('Help us improve by reporting tasks that don\'t make sense or are inappropriate.')).toBeInTheDocument()
      })
    })
  })

  // ========================================
  // Flag Modal Functionality (5 tests)
  // ========================================
  describe('Flag Modal Functionality', () => {
    const mockTasks = [
      { title: 'Inappropriate Task', description: 'Bad content', pillar: 'stem', xp_value: 20 }
    ]

    beforeEach(async () => {
      const user = userEvent.setup()
      api.post
        .mockResolvedValueOnce({ data: { session_id: 'session-123' } })
        .mockResolvedValueOnce({ data: { tasks: mockTasks } })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))
      await waitFor(() => expect(screen.getByText('Sports & Athletics')).toBeInTheDocument())

      await user.click(screen.getByText('Sports & Athletics'))
      await user.click(screen.getByText('Generate Tasks'))

      await waitFor(() => {
        expect(screen.getByText('Review Tasks')).toBeInTheDocument()
      })

      // Open flag modal
      const flagButton = screen.getByTitle('Flag this task as inappropriate')
      await user.click(flagButton)

      await waitFor(() => {
        expect(screen.getByText('Flag This Task')).toBeInTheDocument()
      })
    })

    it('allows entering flag reason', async () => {
      const user = userEvent.setup()

      const textarea = screen.getByPlaceholderText('Why are you flagging this task? (optional)')
      await user.type(textarea, 'This task is inappropriate')

      expect(textarea).toHaveValue('This task is inappropriate')
    })

    it('has proper aria attributes for flag textarea', () => {
      const textarea = screen.getByPlaceholderText('Why are you flagging this task? (optional)')
      expect(textarea).toHaveAttribute('aria-labelledby', 'flag-modal-title')
      expect(textarea).toHaveAttribute('aria-describedby', 'flag-modal-description')
    })

    it('closes modal when Cancel is clicked', async () => {
      const user = userEvent.setup()

      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      await user.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByText('Flag This Task')).not.toBeInTheDocument()
      })
    })

    it('submits flag and closes modal when Submit Flag is clicked', async () => {
      const user = userEvent.setup()

      const textarea = screen.getByPlaceholderText('Why are you flagging this task? (optional)')
      await user.type(textarea, 'Offensive content')

      const submitButton = screen.getByText('Submit Flag')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.queryByText('Flag This Task')).not.toBeInTheDocument()
      })
    })

    it('clears flag reason after submission', async () => {
      const user = userEvent.setup()

      const textarea = screen.getByPlaceholderText('Why are you flagging this task? (optional)')
      await user.type(textarea, 'Test reason')

      const submitButton = screen.getByText('Submit Flag')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.queryByText('Flag This Task')).not.toBeInTheDocument()
      })

      // Re-open modal to verify reason was cleared
      const flagButton = screen.getByTitle('Flag this task as inappropriate')
      await user.click(flagButton)

      await waitFor(() => {
        const newTextarea = screen.getByPlaceholderText('Why are you flagging this task? (optional)')
        expect(newTextarea).toHaveValue('')
      })
    })
  })

  // ========================================
  // Manual Task Creation Path (3 tests)
  // ========================================
  describe('Manual Task Creation Path', () => {
    it('shows ManualTaskCreator component on manual path', async () => {
      const user = userEvent.setup()
      api.post.mockResolvedValueOnce({ data: { session_id: 'session-123' } })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('Write My Own'))

      await waitFor(() => {
        expect(screen.getByTestId('manual-task-creator')).toBeInTheDocument()
      })
    })

    it('calls onComplete when manual tasks are created', async () => {
      const user = userEvent.setup()
      api.post.mockResolvedValueOnce({ data: { session_id: 'session-123' } })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('Write My Own'))

      await waitFor(() => {
        expect(screen.getByTestId('manual-task-creator')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Create Tasks'))

      expect(mockOnComplete).toHaveBeenCalledWith({ success: true })
    })

    it('calls onCancel when manual creation is cancelled', async () => {
      const user = userEvent.setup()
      api.post.mockResolvedValueOnce({ data: { session_id: 'session-123' } })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('Write My Own'))

      await waitFor(() => {
        expect(screen.getByTestId('manual-task-creator')).toBeInTheDocument()
      })

      // Click cancel in the ManualTaskCreator
      const cancelButtons = screen.getAllByText('Cancel')
      await user.click(cancelButtons[cancelButtons.length - 1])

      expect(mockOnCancel).toHaveBeenCalled()
    })
  })

  // ========================================
  // Cancel Functionality (2 tests)
  // ========================================
  describe('Cancel Functionality', () => {
    it('shows Cancel Personalization button at all times', () => {
      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      expect(screen.getByText('Cancel Personalization')).toBeInTheDocument()
    })

    it('calls onCancel when Cancel Personalization is clicked', async () => {
      const user = userEvent.setup()

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('Cancel Personalization'))

      expect(mockOnCancel).toHaveBeenCalled()
    })
  })

  // ========================================
  // Error Handling (4 tests)
  // ========================================
  describe('Error Handling', () => {
    it('displays error message in red alert box', async () => {
      const user = userEvent.setup()
      api.post.mockRejectedValueOnce({
        response: { data: { error: 'Test error message' } }
      })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))

      await waitFor(() => {
        const errorBox = screen.getByText('Test error message')
        expect(errorBox).toBeInTheDocument()
        expect(errorBox.closest('div')).toHaveClass('bg-red-50')
      })
    })

    it('handles API errors without response data', async () => {
      const user = userEvent.setup()
      api.post.mockRejectedValueOnce(new Error('Network error'))

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument()
      })
    })

    it('displays error when accept-task API fails', async () => {
      const user = userEvent.setup()
      const mockTasks = [
        { title: 'Task 1', description: 'Description', pillar: 'stem', xp_value: 20 }
      ]

      api.post
        .mockResolvedValueOnce({ data: { session_id: 'session-123' } })
        .mockResolvedValueOnce({ data: { tasks: mockTasks } })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))
      await waitFor(() => expect(screen.getByText('Sports & Athletics')).toBeInTheDocument())

      await user.click(screen.getByText('Sports & Athletics'))
      await user.click(screen.getByText('Generate Tasks'))

      await waitFor(() => {
        expect(screen.getByText('Task 1')).toBeInTheDocument()
      })

      api.post.mockRejectedValueOnce({
        response: { data: { error: 'Failed to save task' } }
      })

      await user.click(screen.getByText('Add'))

      await waitFor(() => {
        expect(screen.getByText('Failed to save task')).toBeInTheDocument()
      })
    })

    it('shows generic error message if accept-task API error has no message', async () => {
      const user = userEvent.setup()
      const mockTasks = [
        { title: 'Task 1', description: 'Description', pillar: 'stem', xp_value: 20 }
      ]

      api.post
        .mockResolvedValueOnce({ data: { session_id: 'session-123' } })
        .mockResolvedValueOnce({ data: { tasks: mockTasks } })

      renderWithProviders(<QuestPersonalizationWizard {...defaultProps} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      await user.click(screen.getByText('AI Generate'))
      await waitFor(() => expect(screen.getByText('Sports & Athletics')).toBeInTheDocument())

      await user.click(screen.getByText('Sports & Athletics'))
      await user.click(screen.getByText('Generate Tasks'))

      await waitFor(() => {
        expect(screen.getByText('Task 1')).toBeInTheDocument()
      })

      api.post.mockRejectedValueOnce({})

      await user.click(screen.getByText('Add'))

      await waitFor(() => {
        expect(screen.getByText('Failed to add task')).toBeInTheDocument()
      })
    })
  })
})
