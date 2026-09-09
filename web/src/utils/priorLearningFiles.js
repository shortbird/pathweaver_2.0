/**
 * What a prior-learning upload accepts, shared by the two surfaces that upload
 * one: the family page (a parent emptying a shoebox of paperwork) and the SIS
 * Prior Learning page (the office entering a transcript a school sent it).
 *
 * Shared rather than copied because both post to the same pipeline and the same
 * bucket, and the failure mode of two copies is one surface quietly accepting a
 * file type the other refuses — which reads to whoever hit it as the upload
 * being broken, not as a rule.
 *
 * The backend is the real gate (config/constants.py ALLOWED_IMAGE_EXTENSIONS +
 * ALLOWED_DOCUMENT_EXTENSIONS); this exists so an unusable file is named at the
 * door instead of after waiting through an eleven-file upload.
 */

export const MAX_FILES = 25

export const ACCEPTED_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'txt', 'csv',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'tiff', 'tif', 'bmp', 'avif', 'jfif',
]

/** The `accept` attribute for a file input, from the list above. */
export const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(',')

export const extensionOf = (name) => (
  (name || '').includes('.') ? name.split('.').pop().toLowerCase() : ''
)

export const isSupported = (file) => ACCEPTED_EXTENSIONS.includes(extensionOf(file?.name))

// An image gets 'image' evidence so the portfolio can show it inline; everything
// else is a 'document'. Same two kinds a student picks by hand on a task.
export const kindFor = (file) => (file?.type?.startsWith('image/') ? 'image' : 'document')

export const prettySize = (bytes) => (
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
)
