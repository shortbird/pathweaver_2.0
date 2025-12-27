import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getMyDependents,
  createDependent,
  getDependent,
  updateDependent,
  deleteDependent,
  promoteDependent
} from './dependentAPI'
import api from './api'

// Mock the api module
vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}))

describe('dependentAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getMyDependents', () => {
    it('calls GET /api/dependents/my-dependents', async () => {
      const mockResponse = {
        data: {
          dependents: [
            { id: 'dep-1', display_name: 'Child One' },
            { id: 'dep-2', display_name: 'Child Two' }
          ]
        }
      }
      api.get.mockResolvedValue(mockResponse)

      const result = await getMyDependents()

      expect(api.get).toHaveBeenCalledWith('/api/dependents/my-dependents')
      expect(result).toEqual(mockResponse.data)
    })

    it('handles empty dependents list', async () => {
      api.get.mockResolvedValue({ data: { dependents: [] } })

      const result = await getMyDependents()

      expect(result.dependents).toEqual([])
    })

    it('throws error on API failure', async () => {
      api.get.mockRejectedValue(new Error('Network error'))

      await expect(getMyDependents()).rejects.toThrow('Network error')
    })
  })

  describe('createDependent', () => {
    it('calls POST /api/dependents/create with display_name and date_of_birth', async () => {
      const mockResponse = {
        data: {
          success: true,
          dependent: { id: 'new-dep', display_name: 'New Child' },
          message: 'Dependent created successfully'
        }
      }
      api.post.mockResolvedValue(mockResponse)

      const dependentData = {
        display_name: 'New Child',
        date_of_birth: '2015-06-15'
      }
      const result = await createDependent(dependentData)

      expect(api.post).toHaveBeenCalledWith('/api/dependents/create', dependentData)
      expect(result).toEqual(mockResponse.data)
    })

    it('returns dependent data on success', async () => {
      const mockDependent = { id: 'dep-1', display_name: 'Test Child' }
      api.post.mockResolvedValue({
        data: { success: true, dependent: mockDependent }
      })

      const result = await createDependent('Test Child', '2015-01-01')

      expect(result.dependent).toEqual(mockDependent)
    })

    it('throws error for invalid date format', async () => {
      api.post.mockRejectedValue({
        response: { data: { error: 'Invalid date format' } }
      })

      await expect(createDependent('Child', 'invalid-date')).rejects.toBeTruthy()
    })

    it('throws error for child 13 or older', async () => {
      api.post.mockRejectedValue({
        response: { data: { error: 'Child must be under 13 years old' } }
      })

      await expect(createDependent('Teen', '2010-01-01')).rejects.toBeTruthy()
    })
  })

  describe('getDependent', () => {
    it('calls GET /api/dependents/:id', async () => {
      const mockDependent = {
        id: 'dep-1',
        display_name: 'Child One',
        date_of_birth: '2015-06-15',
        total_xp: 500
      }
      api.get.mockResolvedValue({ data: { dependent: mockDependent } })

      const result = await getDependent('dep-1')

      expect(api.get).toHaveBeenCalledWith('/api/dependents/dep-1')
      expect(result.dependent).toEqual(mockDependent)
    })

    it('throws error for non-existent dependent', async () => {
      api.get.mockRejectedValue({
        response: { status: 404, data: { error: 'Dependent not found' } }
      })

      await expect(getDependent('non-existent')).rejects.toBeTruthy()
    })

    it('throws error for unauthorized access', async () => {
      api.get.mockRejectedValue({
        response: { status: 403, data: { error: 'Not authorized' } }
      })

      await expect(getDependent('other-parent-child')).rejects.toBeTruthy()
    })
  })

  describe('updateDependent', () => {
    it('calls PUT /api/dependents/:id with updates', async () => {
      const updates = { display_name: 'Updated Name', bio: 'New bio' }
      api.put.mockResolvedValue({
        data: { success: true, dependent: { id: 'dep-1', ...updates } }
      })

      const result = await updateDependent('dep-1', updates)

      expect(api.put).toHaveBeenCalledWith('/api/dependents/dep-1', updates)
      expect(result.dependent.display_name).toBe('Updated Name')
    })

    it('only allows whitelisted fields', async () => {
      const updates = {
        display_name: 'Valid',
        avatar_url: 'https://example.com/avatar.jpg',
        bio: 'Valid bio',
        email: 'invalid@field.com' // Should be ignored by backend
      }
      api.put.mockResolvedValue({ data: { success: true } })

      await updateDependent('dep-1', updates)

      expect(api.put).toHaveBeenCalledWith('/api/dependents/dep-1', updates)
    })

    it('throws error for invalid updates', async () => {
      api.put.mockRejectedValue({
        response: { data: { error: 'Invalid field' } }
      })

      await expect(updateDependent('dep-1', { invalid: 'field' })).rejects.toBeTruthy()
    })
  })

  describe('deleteDependent', () => {
    it('calls DELETE /api/dependents/:id', async () => {
      api.delete.mockResolvedValue({ data: { success: true } })

      const result = await deleteDependent('dep-1')

      expect(api.delete).toHaveBeenCalledWith('/api/dependents/dep-1')
      expect(result.success).toBe(true)
    })

    it('throws error for non-existent dependent', async () => {
      api.delete.mockRejectedValue({
        response: { status: 404 }
      })

      await expect(deleteDependent('non-existent')).rejects.toBeTruthy()
    })

    it('throws error for unauthorized deletion', async () => {
      api.delete.mockRejectedValue({
        response: { status: 403 }
      })

      await expect(deleteDependent('other-parent-child')).rejects.toBeTruthy()
    })
  })

  describe('promoteDependent', () => {
    it('calls POST /api/dependents/:id/promote with email and password', async () => {
      const mockResponse = {
        data: {
          success: true,
          message: 'Dependent promoted to independent account'
        }
      }
      api.post.mockResolvedValue(mockResponse)

      const credentials = {
        email: 'child@example.com',
        password: 'SecurePass123!'
      }
      const result = await promoteDependent('dep-1', credentials)

      expect(api.post).toHaveBeenCalledWith('/api/dependents/dep-1/promote', credentials)
      expect(result.success).toBe(true)
    })

    it('throws error for child under 13', async () => {
      api.post.mockRejectedValue({
        response: { data: { error: 'Child must be 13 or older to promote' } }
      })

      await expect(promoteDependent('dep-1', { email: 'email@test.com', password: 'pass' })).rejects.toBeTruthy()
    })

    it('throws error for weak password', async () => {
      api.post.mockRejectedValue({
        response: { data: { error: 'Password does not meet requirements' } }
      })

      await expect(promoteDependent('dep-1', { email: 'email@test.com', password: 'weak' })).rejects.toBeTruthy()
    })

    it('throws error for invalid email', async () => {
      api.post.mockRejectedValue({
        response: { data: { error: 'Invalid email format' } }
      })

      await expect(promoteDependent('dep-1', { email: 'not-an-email', password: 'SecurePass123!' })).rejects.toBeTruthy()
    })
  })

})
