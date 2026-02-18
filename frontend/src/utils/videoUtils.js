/**
 * Video Utilities
 *
 * Shared utility functions for video URL parsing and embedding.
 * Supports YouTube, Vimeo, Google Drive, and Loom.
 */

/**
 * Get video embed URL from various providers.
 * Returns an embeddable iframe src, or null if the URL is not recognized.
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
 * Check if a URL can be embedded as an inline video player.
 */
export const isEmbeddableVideoUrl = (url) => {
  return getVideoEmbedUrl(url) !== null
}

/**
 * Get the video provider name for a URL.
 * YouTube and Vimeo handle aspect ratio internally (letterboxing),
 * so they work well with aspect-video (16:9).
 * Google Drive and Loom stretch to fill, so they need a neutral container.
 */
export const getVideoProvider = (url) => {
  if (!url) return null
  if (/(?:youtube\.com|youtu\.be)/.test(url)) return 'youtube'
  if (/vimeo\.com/.test(url)) return 'vimeo'
  if (/drive\.google\.com/.test(url)) return 'google-drive'
  if (/loom\.com/.test(url)) return 'loom'
  return null
}

/**
 * Get the appropriate CSS aspect ratio class for a video provider.
 * YouTube/Vimeo: 16:9 (they add letterboxing internally)
 * Google Drive/Loom: near-square (they stretch to fill, so a neutral ratio avoids distortion)
 */
export const getVideoAspectClass = (url) => {
  const provider = getVideoProvider(url)
  if (provider === 'youtube' || provider === 'vimeo') return 'aspect-video'
  return 'aspect-square'
}
