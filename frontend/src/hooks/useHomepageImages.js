/**
 * Hook for fetching and caching homepage images from Pexels.
 * Images are fetched once and cached in localStorage for 24 hours.
 */
import { useState, useEffect } from 'react'
import api from '../services/api'
import logger from '../utils/logger'

const CACHE_KEY = 'optio_homepage_images'
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

/**
 * Custom hook to fetch homepage images with caching
 * @param {Object} options - Configuration options
 * @param {string} options.section - Optional filter by section (features, process, philosophy, cta)
 * @param {string[]} options.keys - Optional array of specific image keys to fetch
 * @returns {Object} - { images, loading, error, refetch }
 */
export const useHomepageImages = (options = {}) => {
  const [images, setImages] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchImages = async (skipCache = false) => {
    try {
      setLoading(true)
      setError(null)

      // Check cache first (unless skipCache is true)
      if (!skipCache) {
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) {
          const { data, timestamp } = JSON.parse(cached)
          const now = Date.now()

          // Check if cache is still valid
          if (now - timestamp < CACHE_DURATION) {
            logger.debug('[Homepage Images] Using cached images')
            setImages(data)
            setLoading(false)
            return
          } else {
            logger.debug('[Homepage Images] Cache expired, fetching fresh images')
          }
        }
      }

      // Fetch from API
      logger.debug('[Homepage Images] Fetching images from API')

      const params = {}
      if (options.section) params.section = options.section
      if (options.keys && options.keys.length > 0) params.keys = options.keys.join(',')

      const response = await api.get('/api/homepage/images', { params })

      if (response.data.success) {
        const imageData = response.data.images

        // Cache the results
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          data: imageData,
          timestamp: Date.now()
        }))

        logger.debug(`[Homepage Images] Fetched ${response.data.total_found}/${response.data.total_requested} images`)

        if (response.data.errors && response.data.errors.length > 0) {
          logger.warn('[Homepage Images] Some images failed to fetch:', response.data.errors)
        }

        setImages(imageData)
      } else {
        throw new Error(response.data.error || 'Failed to fetch homepage images')
      }
    } catch (err) {
      logger.error('[Homepage Images] Error fetching images:', err)
      setError(err.message || 'Failed to load images')

      // Try to use cached images as fallback even if expired
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const { data } = JSON.parse(cached)
        logger.debug('[Homepage Images] Using stale cache as fallback')
        setImages(data)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchImages()
  }, [options.section, options.keys?.join(',')])

  // Refetch function to manually refresh images
  const refetch = () => fetchImages(true)

  // Clear cache function
  const clearCache = () => {
    localStorage.removeItem(CACHE_KEY)
    console.log('[Homepage Images] Cache cleared')
  }

  return { images, loading, error, refetch, clearCache }
}

/**
 * Get a specific image URL by key
 * @param {Object} images - Images object from useHomepageImages
 * @param {string} key - Image key (e.g., 'portfolio', 'journaling')
 * @param {string} fallback - Optional fallback URL
 * @returns {string|null} - Image URL or fallback
 */
export const getImageUrl = (images, key, fallback = null) => {
  return images[key]?.url || fallback
}

/**
 * Preload images to improve performance
 * @param {Object} images - Images object from useHomepageImages
 */
export const preloadImages = (images) => {
  Object.values(images).forEach(image => {
    if (image.url) {
      const img = new Image()
      img.src = image.url
    }
  })
  logger.debug(`[Homepage Images] Preloading ${Object.keys(images).length} images`)
}
