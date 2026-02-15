/**
 * Content Utilities for Curriculum
 *
 * Shared utility functions for parsing and processing lesson content.
 */

/**
 * Parse lesson content into steps
 * Handles both legacy (blocks/HTML) and new (steps array) formats
 */
export const parseContentToSteps = (content) => {
  if (!content) return []

  // New format: version 2 with steps array
  if (content.version === 2 && Array.isArray(content.steps)) {
    return content.steps
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(step => ({
        ...step,
        type: step.type || 'text',
      }))
  }

  // Legacy: blocks format
  if (content.blocks && Array.isArray(content.blocks)) {
    const html = content.blocks
      .filter(block => block.type === 'text')
      .map(block => block.content || '')
      .join('')
    if (html) {
      return [{ id: 'legacy', type: 'text', title: 'Content', content: html, order: 0 }]
    }
  }

  // Legacy: raw HTML string
  if (typeof content === 'string' && content.trim()) {
    return [{ id: 'legacy', type: 'text', title: 'Content', content, order: 0 }]
  }

  return []
}

/**
 * Get file type from filename or URL
 */
export const getFileType = (file) => {
  const name = (file.name || file.url || '').toLowerCase()
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|heic|heif)$/i.test(name)) return 'image'
  if (/\.pdf$/i.test(name)) return 'pdf'
  if (/\.(mp4|webm|ogg|mov)$/i.test(name)) return 'video'
  if (/\.(mp3|wav|ogg|m4a)$/i.test(name)) return 'audio'
  return 'other'
}

/**
 * Get video embed URL from various providers
 */
export const getVideoEmbedUrl = (url) => {
  if (!url) return null

  // YouTube
  const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
  const youtubeMatch = url.match(youtubeRegex)
  if (youtubeMatch) {
    return `https://www.youtube-nocookie.com/embed/${youtubeMatch[1]}?rel=0&modestbranding=1`
  }

  // Vimeo
  const vimeoRegex = /vimeo\.com\/(?:video\/)?(\d+)/
  const vimeoMatch = url.match(vimeoRegex)
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`
  }

  // Google Drive
  const driveRegex = /drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/
  const driveMatch = url.match(driveRegex)
  if (driveMatch) {
    return `https://drive.google.com/file/d/${driveMatch[1]}/preview`
  }

  // Loom
  const loomRegex = /loom\.com\/share\/([a-zA-Z0-9]+)/
  const loomMatch = url.match(loomRegex)
  if (loomMatch) {
    return `https://www.loom.com/embed/${loomMatch[1]}`
  }

  return null
}

/**
 * Helper to extract HTML content from lesson content structure
 */
export const getLessonHtmlContent = (content) => {
  if (!content) return ''
  // If content is already a string (legacy or raw HTML), return it
  if (typeof content === 'string') return content
  // If content is an object with blocks array, extract text block content
  if (content.blocks && Array.isArray(content.blocks)) {
    return content.blocks
      .filter(block => block.type === 'text')
      .map(block => block.content || '')
      .join('')
  }
  return ''
}

/**
 * Check if step has meaningful content
 */
export const stepHasContent = (step) => {
  if (!step) return false

  switch (step.type) {
    case 'text':
      return step.content && step.content !== '<p></p>'
    case 'video':
      return !!step.video_url
    case 'file':
      return step.files && step.files.length > 0
    default:
      return false
  }
}
