/**
 * Signed-upload helper: uploads files directly to Supabase Storage via a
 * pre-signed URL issued by the backend, then calls the backend to finalize.
 *
 * Flow:
 *   1. POST {initPath} with { filename, file_size, content_type, block_type? }
 *      -> backend returns { signed_url, token, storage_path, bucket, ... }
 *   2. PUT file to signed_url directly (bypasses the backend, avoiding OOM
 *      on large videos)
 *   3. POST {finalizePath} with { storage_path, bucket, block_type? }
 *      -> backend verifies and runs post-processing; returns the final URL
 *      and metadata (same shape as the legacy /upload endpoint)
 *
 * Retry policy: init + finalize are idempotent on network failure. The PUT
 * to Supabase is single-shot — if it fails partway, we request a fresh
 * signed URL and start over, up to `maxAttempts`.
 */

import api from './api'
import logger from '../utils/logger'

const DEFAULT_MAX_ATTEMPTS = 3

/**
 * Upload a file via the signed-upload flow.
 *
 * @param {Object} params
 * @param {File|Blob} params.file - The file to upload.
 * @param {string} params.initPath - Backend init endpoint, e.g. `/api/evidence/documents/task-1/upload-init`.
 * @param {string} params.finalizePath - Backend finalize endpoint.
 * @param {string} [params.blockType] - Hint for the backend ('image'|'video'|'document').
 * @param {Object} [params.extraInitBody] - Extra body fields merged into the init request.
 * @param {Object} [params.extraFinalizeBody] - Extra body fields merged into the finalize request.
 * @param {(percent: number) => void} [params.onProgress] - Upload progress callback (0-100).
 * @param {number} [params.maxAttempts=3] - How many times to retry the PUT leg on failure.
 * @returns {Promise<Object>} The finalize response (url, filename, file_size, etc.)
 */
export async function uploadViaSignedUrl({
  file,
  initPath,
  finalizePath,
  blockType,
  extraInitBody,
  extraFinalizeBody,
  onProgress,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
}) {
  if (!file) throw new Error('file required')
  if (!initPath) throw new Error('initPath required')
  if (!finalizePath) throw new Error('finalizePath required')

  let lastError
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const initBody = {
        filename: file.name,
        file_size: file.size,
        content_type: file.type || undefined,
        block_type: blockType || undefined,
        ...(extraInitBody || {}),
      }
      const initResp = await api.post(initPath, initBody)
      const upload = initResp.data?.upload
      if (!upload?.signed_url || !upload?.storage_path || !upload?.bucket) {
        throw new Error('Invalid upload session response')
      }

      await putToSignedUrl({
        signedUrl: upload.signed_url,
        file,
        contentType: file.type || upload.content_type || 'application/octet-stream',
        onProgress,
      })

      const finalizeBody = {
        storage_path: upload.storage_path,
        bucket: upload.bucket,
        block_type: blockType || upload.media_type || undefined,
        ...(extraFinalizeBody || {}),
      }
      const finalizeResp = await api.post(finalizePath, finalizeBody)
      return finalizeResp.data
    } catch (err) {
      lastError = err
      const status = err?.response?.status

      // Pre-flight or auth rejection — no point retrying; bubble up.
      if (status && status >= 400 && status < 500 && status !== 408) {
        throw err
      }

      logger.warn(
        `[signedUpload] attempt ${attempt}/${maxAttempts} failed`,
        err?.message || err,
      )
      if (attempt === maxAttempts) throw err
      // Brief backoff before retry; signed URL is single-use so we'll request a new one.
      await new Promise((r) => setTimeout(r, 300 * attempt))
    }
  }
  throw lastError
}

/**
 * PUT the file body to a Supabase pre-signed upload URL using multipart form.
 * Uses XHR for upload-progress reporting (fetch doesn't expose it).
 */
function putToSignedUrl({ signedUrl, file, contentType, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    // Supabase signed upload expects a multipart form with a "file" field.
    formData.append('file', file, file.name)

    xhr.open('PUT', signedUrl, true)
    // Supabase reads content-type from the file part; no need to set globally.

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded * 100) / e.total)
          onProgress(pct)
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        const err = new Error(
          `Storage upload failed (HTTP ${xhr.status}): ${xhr.responseText?.slice(0, 200) || ''}`,
        )
        err.status = xhr.status
        reject(err)
      }
    }
    xhr.onerror = () => reject(new Error('Network error during storage upload'))
    xhr.ontimeout = () => reject(new Error('Storage upload timed out'))
    xhr.timeout = 10 * 60 * 1000 // 10 minutes for large videos

    xhr.send(formData)
  })
}

export default uploadViaSignedUrl
