/**
 * Environment-gated logging utility
 *
 * Usage:
 *   import logger from '@/utils/logger'
 *   logger.debug('Debug message', { data })
 *   logger.info('Info message')
 *   logger.warn('Warning message')
 *   logger.error('Error message', error)
 *
 * To enable verbose debug logging in development, set in browser console:
 *   localStorage.setItem('debug_logging', 'true')
 *
 * To disable:
 *   localStorage.removeItem('debug_logging')
 */

const isDevelopment = import.meta.env.MODE === 'development'

// Check if verbose debug logging is enabled via localStorage
const isVerboseEnabled = () => {
  try {
    return localStorage.getItem('debug_logging') === 'true'
  } catch {
    return false
  }
}

const logger = {
  /**
   * Debug logging - only shows when verbose mode is enabled
   * Enable with: localStorage.setItem('debug_logging', 'true')
   */
  debug: (...args) => {
    if (isDevelopment && isVerboseEnabled()) {
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
