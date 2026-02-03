/**
 * Tests for logger.js - Environment-gated logging utility
 *
 * Tests:
 * - debug (development only)
 * - info (development only)
 * - warn (all environments)
 * - error (all environments)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('logger.js', () => {
  let consoleLogSpy
  let consoleWarnSpy
  let consoleErrorSpy
  let originalMode

  beforeEach(() => {
    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Store original mode
    originalMode = import.meta.env.MODE
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // Restore original mode
    import.meta.env.MODE = originalMode
  })

  describe('in development mode', () => {
    beforeEach(() => {
      // Set development mode
      import.meta.env.MODE = 'development'

      // Re-import logger to pick up new environment
      vi.resetModules()
    })

    it('debug logs in development', async () => {
      const logger = (await import('./logger')).default

      logger.debug('Debug message', { data: 'test' })

      expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG]', 'Debug message', { data: 'test' })
    })

    it('info logs in development', async () => {
      const logger = (await import('./logger')).default

      logger.info('Info message', 123)

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO]', 'Info message', 123)
    })

    it('warn logs in development', async () => {
      const logger = (await import('./logger')).default

      logger.warn('Warning message')

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN]', 'Warning message')
    })

    it('error logs in development', async () => {
      const logger = (await import('./logger')).default
      const error = new Error('Test error')

      logger.error('Error message', error)

      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'Error message', error)
    })
  })

  describe('in production mode', () => {
    beforeEach(() => {
      // Set production mode
      import.meta.env.MODE = 'production'

      // Re-import logger to pick up new environment
      vi.resetModules()
    })

    it('debug does not log in production', async () => {
      const logger = (await import('./logger')).default

      logger.debug('Debug message')

      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it('info does not log in production', async () => {
      const logger = (await import('./logger')).default

      logger.info('Info message')

      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it('warn logs in production', async () => {
      const logger = (await import('./logger')).default

      logger.warn('Warning message')

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN]', 'Warning message')
    })

    it('error logs in production', async () => {
      const logger = (await import('./logger')).default

      logger.error('Error message')

      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'Error message')
    })
  })

  describe('log message formatting', () => {
    beforeEach(() => {
      import.meta.env.MODE = 'development'
      vi.resetModules()
    })

    it('handles multiple arguments', async () => {
      const logger = (await import('./logger')).default

      logger.debug('Message', 'arg1', 'arg2', 'arg3')

      expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG]', 'Message', 'arg1', 'arg2', 'arg3')
    })

    it('handles objects', async () => {
      const logger = (await import('./logger')).default
      const obj = { key: 'value', nested: { data: 123 } }

      logger.info('Object:', obj)

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO]', 'Object:', obj)
    })

    it('handles arrays', async () => {
      const logger = (await import('./logger')).default
      const arr = [1, 2, 3, 'four', { five: 5 }]

      logger.debug('Array:', arr)

      expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG]', 'Array:', arr)
    })

    it('handles Error objects', async () => {
      const logger = (await import('./logger')).default
      const error = new Error('Test error')
      error.code = 'TEST_ERROR'

      logger.error('Error occurred:', error)

      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'Error occurred:', error)
    })

    it('handles no arguments', async () => {
      const logger = (await import('./logger')).default

      logger.warn()

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN]')
    })
  })
})
