import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import logger from '../logger'

describe('logger', () => {
  let warnSpy, errSpy, logSpy

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
    errSpy.mockRestore()
    logSpy.mockRestore()
    localStorage.removeItem('debug_logging')
  })

  it('warn always logs to console.warn with [WARN] prefix', () => {
    logger.warn('heads up', 1)
    expect(warnSpy).toHaveBeenCalledWith('[WARN]', 'heads up', 1)
  })

  it('error always logs to console.error with [ERROR] prefix', () => {
    const err = new Error('boom')
    logger.error('oops', err)
    expect(errSpy).toHaveBeenCalledWith('[ERROR]', 'oops', err)
  })

  it('info logs in development via console.log', () => {
    // vitest runs with MODE === 'test', so info should NOT fire
    logger.info('hi')
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('debug is a no-op without the localStorage flag', () => {
    logger.debug('nope')
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('debug still does not fire in non-development even with the flag set', () => {
    localStorage.setItem('debug_logging', 'true')
    logger.debug('still nope')
    expect(logSpy).not.toHaveBeenCalled()
  })
})
