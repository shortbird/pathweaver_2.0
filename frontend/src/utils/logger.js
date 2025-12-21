/**
 * Environment-gated logging utility
 *
 * Usage:
 *   import logger from '@/utils/logger'
 *   logger.debug('Debug message', { data })
 *   logger.info('Info message')
 *   logger.warn('Warning message')
 *   logger.error('Error message', error)
 */

const isDevelopment = import.meta.env.MODE === 'development'

const logger = {
  /**
   * Debug logging - only shows in development
   */
  debug: (...args) => {
    if (isDevelopment) {
      console.log('[DEBUG]', ...args)
    }
  },

  /**
   * Info logging - only shows in development
   */
  info: (...args) => {
    if (isDevelopment) {
      console.log('[INFO]', ...args)
    }
  },

  /**
   * Warning logging - shows in all environments
   */
  warn: (...args) => {
    console.warn('[WARN]', ...args)
  },

  /**
   * Error logging - shows in all environments
   */
  error: (...args) => {
    console.error('[ERROR]', ...args)
  }
}

export default logger
