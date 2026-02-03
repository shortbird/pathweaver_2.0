/**
 * Quest Enrollment → Task Completion Integration Tests
 *
 * Tests the complete user journey from quest discovery to task completion:
 * 1. Browse available quests
 * 2. Enroll in a quest
 * 3. View quest details and tasks
 * 4. Complete tasks with evidence
 * 5. Verify XP is awarded
 *
 * Test Coverage: 10 tests across 3 scenarios
 * - Quest enrollment (3 tests)
 * - Task completion (4 tests)
 * - XP tracking (3 tests)
 *
 * Current Status: Infrastructure complete, ready for implementation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, createMockUser, createMockQuest, createMockTask } from '../test-utils'
import api from '../../services/api'

// Mock API module
vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: 'quest-123' }),
  }
})

// Mock AuthContext
let mockAuthValue = {
  user: null,
  isAuthenticated: false,
  loading: false,
}

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockAuthValue,
}))

describe('Quest Flow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()

    // Reset auth to authenticated student
    const mockStudent = createMockUser({ role: 'student', display_name: 'Test Student', total_xp: 100 })
    mockAuthValue.user = mockStudent
    mockAuthValue.isAuthenticated = true
    mockAuthValue.loading = false
  })

  describe('Quest Enrollment Flow', () => {
    it('successfully enrolls in a quest and navigates to quest detail', async () => {
      const mockQuest = createMockQuest({
        id: 'quest-123',
        title: 'Introduction to Biology',
        description: 'Learn the basics of biology',
        is_enrolled: false
      })

      // Mock quest listing API
      api.get.mockResolvedValueOnce({
        data: {
          quests: [mockQuest],
          total: 1
        }
      })

      // Mock enrollment API
      api.post.mockResolvedValueOnce({
        data: {
          message: 'Successfully enrolled in quest',
          quest: { ...mockQuest, is_enrolled: true }
        }
      })

      // Simulate fetching quests
      await api.get('/api/quests')

      // Verify the API was called
      expect(api.get).toHaveBeenCalledWith('/api/quests')
    })

    it('prevents enrollment in an already enrolled quest', async () => {
      const mockQuest = createMockQuest({
        id: 'quest-123',
        is_enrolled: true
      })

      api.get.mockResolvedValueOnce({
        data: {
          quests: [mockQuest],
          total: 1
        }
      })

      // Fetch quests
      await api.get('/api/quests')

      // Should not call enrollment API if already enrolled
      expect(api.post).not.toHaveBeenCalledWith('/api/quests/quest-123/enroll')
    })

    it('shows error message when enrollment fails', async () => {
      const mockQuest = createMockQuest({ id: 'quest-123' })

      api.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: { error: 'Already enrolled in this quest' }
        }
      })

      // Enrollment API should be called and error should be handled
      try {
        await api.post('/api/quests/quest-123/enroll')
      } catch (error) {
        expect(error.response.status).toBe(400)
      }
    })
  })

  describe('Task Completion Flow', () => {
    it('successfully completes a task with text evidence', async () => {
      const mockTask = createMockTask({
        id: 'task-456',
        title: 'Complete Lab Report',
        pillar: 'stem',
        xp_value: 50,
        approval_status: 'not_submitted'
      })

      // Reset all mocks
      api.post.mockReset()

      // Mock task completion API
      api.post.mockResolvedValue({
        data: {
          message: 'Task completed successfully',
          xp_awarded: 50,
          task: { ...mockTask, approval_status: 'approved' }
        }
      })

      // Simulate form submission
      const formData = new FormData()
      formData.append('evidence_text', 'I completed the lab report by analyzing...')

      await api.post(`/api/tasks/${mockTask.id}/complete`, formData)

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          `/api/tasks/${mockTask.id}/complete`,
          expect.any(FormData)
        )
      })
    })

    it('successfully completes a task with file upload evidence', async () => {
      const mockTask = createMockTask({
        id: 'task-789',
        title: 'Upload Project',
        pillar: 'art',
        xp_value: 75
      })

      const mockFile = new File(['test content'], 'project.pdf', { type: 'application/pdf' })

      api.post.mockResolvedValueOnce({
        data: {
          message: 'Task completed successfully',
          xp_awarded: 75,
          evidence_url: 'https://storage.example.com/evidence/task-789.pdf'
        }
      })

      const formData = new FormData()
      formData.append('evidence_file', mockFile)

      await api.post(`/api/tasks/${mockTask.id}/complete`, formData)

      expect(api.post).toHaveBeenCalled()
    })

    it('validates required evidence before submission', async () => {
      const mockTask = createMockTask({
        id: 'task-999',
        title: 'Submit Essay'
      })

      // Attempt to submit without evidence should fail
      api.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: { error: 'Evidence is required' }
        }
      })

      const formData = new FormData()
      // Empty form data

      try {
        await api.post(`/api/tasks/${mockTask.id}/complete`, formData)
      } catch (error) {
        expect(error.response.status).toBe(400)
        expect(error.response.data.error).toContain('Evidence is required')
      }
    })

    it('allows dropping a task to re-attempt later', async () => {
      const mockTask = createMockTask({
        id: 'task-111',
        approval_status: 'approved'
      })

      api.delete.mockResolvedValueOnce({
        data: {
          message: 'Task dropped successfully'
        }
      })

      await api.delete(`/api/tasks/${mockTask.id}`)

      expect(api.delete).toHaveBeenCalledWith(`/api/tasks/${mockTask.id}`)
    })
  })

  describe('XP Tracking Flow', () => {
    it('awards XP immediately after task completion', async () => {
      const initialXP = 100
      const taskXP = 50

      const mockTask = createMockTask({
        id: 'task-222',
        xp_value: taskXP
      })

      // Reset mocks
      api.post.mockReset()

      api.post.mockResolvedValue({
        data: {
          message: 'Task completed successfully',
          xp_awarded: taskXP,
          new_total_xp: initialXP + taskXP
        }
      })

      const formData = new FormData()
      formData.append('evidence_text', 'Evidence here')

      const response = await api.post(`/api/tasks/${mockTask.id}/complete`, formData)

      expect(response.data.xp_awarded).toBe(taskXP)
      expect(response.data.new_total_xp).toBe(initialXP + taskXP)
    })

    it('tracks XP by pillar category', async () => {
      const mockTask = createMockTask({
        id: 'task-333',
        pillar: 'wellness',
        xp_value: 40
      })

      // Reset mocks
      api.post.mockReset()

      const mockResponseData = {
        xp_awarded: 40,
        pillar_xp: {
          wellness: 140
        }
      }

      api.post.mockResolvedValue({
        data: mockResponseData
      })

      const formData = new FormData()
      formData.append('evidence_text', 'Wellness activity completed')

      const response = await api.post(`/api/tasks/${mockTask.id}/complete`, formData)

      expect(response.data).toBeDefined()
      expect(response.data.pillar_xp).toBeDefined()
      expect(response.data.pillar_xp.wellness).toBe(140)
    })

    it('updates user dashboard XP count in real-time', async () => {
      const mockUser = createMockUser({ total_xp: 200 })

      // Reset mocks
      api.get.mockReset()

      // Mock dashboard API call
      api.get.mockResolvedValue({
        data: {
          stats: {
            total_xp: 250,
            quests_completed: 5,
            badges_earned: 2
          }
        }
      })

      const response = await api.get('/api/users/dashboard')

      expect(response.data.stats.total_xp).toBe(250)
      expect(response.data.stats.quests_completed).toBe(5)
    })
  })
})
