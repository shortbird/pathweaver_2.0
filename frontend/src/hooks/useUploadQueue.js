/**
 * useUploadQueue Hook
 *
 * React hook for managing file upload queue with offline support and automatic retries.
 * Persists queue to localStorage and auto-retries failed uploads when back online.
 *
 * Usage:
 * ```jsx
 * const {
 *   queue,
 *   addToQueue,
 *   retryUpload,
 *   cancelUpload,
 *   clearCompleted,
 *   isOnline,
 *   pendingCount,
 *   failedCount
 * } = useUploadQueue(taskId)
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react'

const MAX_RETRY_ATTEMPTS = 3
const INITIAL_RETRY_DELAY = 1000 // 1 second
const RETRY_BACKOFF_MULTIPLIER = 2

/**
 * Get localStorage key for task-specific upload queue
 */
const getQueueKey = (taskId) => `evidence_upload_queue_${taskId}`

/**
 * Load queue from localStorage
 */
const loadQueueFromStorage = (taskId) => {
  try {
    const stored = localStorage.getItem(getQueueKey(taskId))
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('[useUploadQueue] Failed to load queue from storage:', error)
    return []
  }
}

/**
 * Save queue to localStorage
 */
const saveQueueToStorage = (taskId, queue) => {
  try {
    localStorage.setItem(getQueueKey(taskId), JSON.stringify(queue))
  } catch (error) {
    console.error('[useUploadQueue] Failed to save queue to storage:', error)
  }
}

/**
 * Hook for managing upload queue with offline support
 * @param {string} taskId - Task ID for scoping the upload queue
 * @returns {object} Upload queue state and methods
 */
export const useUploadQueue = (taskId) => {
  const [queue, setQueue] = useState(() => loadQueueFromStorage(taskId))
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const retryTimersRef = useRef({})

  // Calculate pending and failed counts
  const pendingCount = queue.filter(item =>
    item.status === 'queued' || item.status === 'uploading'
  ).length

  const failedCount = queue.filter(item => item.status === 'failed').length

  // Persist queue to localStorage whenever it changes
  useEffect(() => {
    saveQueueToStorage(taskId, queue)
  }, [taskId, queue])

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      // Auto-retry failed uploads when back online
      queue.forEach(item => {
        if (item.status === 'failed' && item.retryCount < MAX_RETRY_ATTEMPTS) {
          scheduleRetry(item.id)
        }
      })
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      // Clear all retry timers
      Object.values(retryTimersRef.current).forEach(clearTimeout)
    }
  }, [queue])

  /**
   * Schedule a retry with exponential backoff
   */
  const scheduleRetry = useCallback((itemId) => {
    const item = queue.find(q => q.id === itemId)
    if (!item) return

    const delay = INITIAL_RETRY_DELAY * Math.pow(RETRY_BACKOFF_MULTIPLIER, item.retryCount)

    // Clear existing timer if any
    if (retryTimersRef.current[itemId]) {
      clearTimeout(retryTimersRef.current[itemId])
    }

    retryTimersRef.current[itemId] = setTimeout(() => {
      retryUpload(itemId)
      delete retryTimersRef.current[itemId]
    }, delay)
  }, [queue])

  /**
   * Add item to upload queue
   */
  const addToQueue = useCallback((file, blockId) => {
    const uploadItem = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      blockId,
      file,
      filename: file.name,
      status: 'queued',
      progress: 0,
      error: null,
      retryCount: 0,
      createdAt: new Date().toISOString()
    }

    setQueue(prev => [...prev, uploadItem])
    return uploadItem.id
  }, [])

  /**
   * Update upload item status and progress
   */
  const updateItem = useCallback((itemId, updates) => {
    setQueue(prev => prev.map(item =>
      item.id === itemId ? { ...item, ...updates } : item
    ))
  }, [])

  /**
   * Retry failed upload
   */
  const retryUpload = useCallback((itemId) => {
    setQueue(prev => prev.map(item => {
      if (item.id === itemId && item.status === 'failed') {
        return {
          ...item,
          status: 'queued',
          error: null,
          retryCount: item.retryCount + 1
        }
      }
      return item
    }))
  }, [])

  /**
   * Cancel upload and remove from queue
   */
  const cancelUpload = useCallback((itemId) => {
    // Clear retry timer if exists
    if (retryTimersRef.current[itemId]) {
      clearTimeout(retryTimersRef.current[itemId])
      delete retryTimersRef.current[itemId]
    }

    setQueue(prev => prev.filter(item => item.id !== itemId))
  }, [])

  /**
   * Clear all completed uploads from queue
   */
  const clearCompleted = useCallback(() => {
    setQueue(prev => prev.filter(item => item.status !== 'complete'))
  }, [])

  /**
   * Mark upload as complete
   */
  const markComplete = useCallback((itemId) => {
    updateItem(itemId, { status: 'complete', progress: 100 })
  }, [updateItem])

  /**
   * Mark upload as failed
   */
  const markFailed = useCallback((itemId, error) => {
    const item = queue.find(q => q.id === itemId)
    if (!item) return

    updateItem(itemId, {
      status: 'failed',
      error: error.message || 'Upload failed'
    })

    // Auto-schedule retry if attempts remaining and online
    if (item.retryCount < MAX_RETRY_ATTEMPTS && isOnline) {
      scheduleRetry(itemId)
    }
  }, [queue, isOnline, updateItem, scheduleRetry])

  /**
   * Update upload progress
   */
  const updateProgress = useCallback((itemId, progress) => {
    updateItem(itemId, { status: 'uploading', progress })
  }, [updateItem])

  return {
    queue,
    addToQueue,
    retryUpload,
    cancelUpload,
    clearCompleted,
    updateItem,
    markComplete,
    markFailed,
    updateProgress,
    isOnline,
    pendingCount,
    failedCount
  }
}
