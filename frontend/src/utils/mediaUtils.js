/**
 * Shared media utility functions and constants.
 * Single import path for all media-related helpers across evidence,
 * parent, advisor, and learning-event components.
 */

// Re-export everything from EvidenceMediaHandlers so consumers
// can import from one place.
export {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_DOCUMENT_EXTENSIONS,
  ALLOWED_DOCUMENT_MIME_TYPES,
  ALLOWED_VIDEO_EXTENSIONS,
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_VIDEO_DURATION_SECONDS,
  IMAGE_ACCEPT_STRING,
  DOCUMENT_ACCEPT_STRING,
  VIDEO_ACCEPT_STRING,
  IMAGE_FORMAT_LABEL,
  DOCUMENT_FORMAT_LABEL,
  VIDEO_FORMAT_LABEL,
  validateFileType,
  validateVideoDuration,
} from '../components/evidence/EvidenceMediaHandlers';

/**
 * Camera input accept string: images + video/mp4 + video/quicktime.
 * Composed once so every file-input that offers "Camera" uses the
 * same set of accepted types.
 */
export const CAMERA_ACCEPT_STRING =
  'image/*,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,video/mp4,video/quicktime,.mp4,.mov';

/**
 * Format byte count into a human-readable string.
 * Replaces 4+ identical copies across the codebase.
 */
export function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Check whether a string is a valid URL.
 * Replaces identical helpers in Parent and Advisor modals.
 */
export function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Detect media type from a File object.
 * Returns 'video' | 'image' | 'document'.
 */
export function detectMediaType(file) {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  return 'document';
}

/**
 * Validate file size against per-type limits.
 * Returns { valid: true } or { valid: false, error: string }.
 *
 * Limits:
 *   image    - 10 MB
 *   video    - 100 MB
 *   document - 25 MB
 */
export function validateFileSize(file, mediaType) {
  const limits = {
    image: 10 * 1024 * 1024,
    video: 250 * 1024 * 1024, // Server compresses videos >50MB
    document: 25 * 1024 * 1024,
  };
  const maxBytes = limits[mediaType] || limits.document;
  const maxMB = maxBytes / (1024 * 1024);

  if (file.size > maxBytes) {
    const fileMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `"${file.name}" is too large (${fileMB}MB). Maximum size for ${mediaType}s is ${maxMB}MB.`,
    };
  }
  return { valid: true };
}
