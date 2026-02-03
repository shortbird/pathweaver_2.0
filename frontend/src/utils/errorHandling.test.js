/**
 * Tests for errorHandling.js - API error handling utilities
 *
 * Tests:
 * - extractErrorMessage (different error formats)
 * - handleApiResponse (throwing errors on failed responses)
 * - fetchWithErrorHandling (integrated fetch with error handling)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractErrorMessage, handleApiResponse, fetchWithErrorHandling } from './errorHandling'

describe('errorHandling.js', () => {
  describe('extractErrorMessage', () => {
    it('extracts message from structured error object', () => {
      const data = {
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
        },
      }

      const message = extractErrorMessage(data)
      expect(message).toBe('Validation failed')
    })

    it('extracts message from direct error string', () => {
      const data = {
        error: 'Invalid credentials',
      }

      const message = extractErrorMessage(data)
      expect(message).toBe('Invalid credentials')
    })

    it('falls back to message field when no error field', () => {
      const data = {
        message: 'Request was successful',
      }

      const message = extractErrorMessage(data)
      expect(message).toBe('Request was successful')
    })

    it('returns fallback message when no error info found', () => {
      const data = {}

      const message = extractErrorMessage(data)
      expect(message).toBe('An error occurred')
    })

    it('uses custom fallback message when provided', () => {
      const data = {}

      const message = extractErrorMessage(data, 'Custom error message')
      expect(message).toBe('Custom error message')
    })

    it('handles error object without message field', () => {
      const data = {
        error: {
          code: 'UNKNOWN_ERROR',
        },
      }

      const message = extractErrorMessage(data)
      expect(message).toBe('An error occurred')
    })

    it('prefers error field over message field', () => {
      const data = {
        error: 'Primary error',
        message: 'Secondary message',
      }

      const message = extractErrorMessage(data)
      expect(message).toBe('Primary error')
    })
  })

  describe('handleApiResponse', () => {
    it('does not throw when response is ok', () => {
      const response = { ok: true, status: 200 }
      const data = { success: true }

      expect(() => handleApiResponse(response, data)).not.toThrow()
    })

    it('throws error when response is not ok', () => {
      const response = { ok: false, status: 400 }
      const data = { error: 'Bad request' }

      expect(() => handleApiResponse(response, data)).toThrow('Bad request')
    })

    it('throws error with structured error message', () => {
      const response = { ok: false, status: 422 }
      const data = {
        error: {
          message: 'Validation failed: Email already exists',
          code: 'DUPLICATE_EMAIL',
        },
      }

      expect(() => handleApiResponse(response, data)).toThrow(
        'Validation failed: Email already exists'
      )
    })

    it('throws error with fallback message when no error details', () => {
      const response = { ok: false, status: 500 }
      const data = {}

      expect(() => handleApiResponse(response, data)).toThrow('Request failed')
    })

    it('throws error with custom fallback message', () => {
      const response = { ok: false, status: 500 }
      const data = {}

      expect(() => handleApiResponse(response, data, 'Server error')).toThrow('Server error')
    })

    it('handles 404 errors gracefully', () => {
      const response = { ok: false, status: 404 }
      const data = { error: 'Resource not found' }

      expect(() => handleApiResponse(response, data)).toThrow('Resource not found')
    })

    it('handles 401 unauthorized errors', () => {
      const response = { ok: false, status: 401 }
      const data = { error: 'Unauthorized' }

      expect(() => handleApiResponse(response, data)).toThrow('Unauthorized')
    })

    it('handles 403 forbidden errors', () => {
      const response = { ok: false, status: 403 }
      const data = { message: 'Access denied' }

      expect(() => handleApiResponse(response, data)).toThrow('Access denied')
    })
  })

  describe('fetchWithErrorHandling', () => {
    beforeEach(() => {
      // Mock global fetch
      global.fetch = vi.fn()
    })

    it('returns data on successful request', async () => {
      const mockData = { id: '123', name: 'Test User' }
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockData),
      })

      const result = await fetchWithErrorHandling('/api/users/123')

      expect(result).toEqual(mockData)
      expect(global.fetch).toHaveBeenCalledWith('/api/users/123', {})
    })

    it('passes fetch options correctly', async () => {
      const mockData = { success: true }
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockData),
      })

      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
      }

      await fetchWithErrorHandling('/api/auth/login', options)

      expect(global.fetch).toHaveBeenCalledWith('/api/auth/login', options)
    })

    it('throws error on failed request', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({ error: 'Invalid input' }),
      })

      await expect(fetchWithErrorHandling('/api/users')).rejects.toThrow('Invalid input')
    })

    it('throws error with structured error response', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 422,
        json: vi.fn().mockResolvedValue({
          error: {
            message: 'Email already registered',
            code: 'DUPLICATE_EMAIL',
          },
        }),
      })

      await expect(fetchWithErrorHandling('/api/auth/register')).rejects.toThrow(
        'Email already registered'
      )
    })

    it('uses fallback message when no error details', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({}),
      })

      await expect(fetchWithErrorHandling('/api/something')).rejects.toThrow('Request failed')
    })

    it('uses custom fallback message', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({}),
      })

      await expect(
        fetchWithErrorHandling('/api/something', {}, 'Custom error')
      ).rejects.toThrow('Custom error')
    })

    it('handles network errors', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'))

      await expect(fetchWithErrorHandling('/api/users')).rejects.toThrow('Network error')
    })

    it('handles JSON parsing errors gracefully', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      })

      await expect(fetchWithErrorHandling('/api/users')).rejects.toThrow('Invalid JSON')
    })
  })
})
