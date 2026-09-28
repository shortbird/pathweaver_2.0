import api from '../../services/api'
import { evidenceDocumentService } from '../../services/evidenceDocumentService'
import { detectMediaType } from '../../utils/mediaUtils'

/**
 * Send one own-curriculum check-in: the parent's photos, files and note become
 * the check-in task's evidence, the task is marked done, and credit is
 * requested -- the same three steps the quest page takes, in one go.
 *
 *   1. upload each file (signed upload, scoped to the child)
 *   2. save the evidence document with status 'completed', KEEPING whatever is
 *      already on it: a check-in sent back for more is added to, not replaced
 *   3. POST /api/tasks/:id/request-credit, which puts it in Optio's review queue
 *
 * Nothing new and nothing kept means nothing to review, so that is refused
 * before anything is written. With no new files or note (a check-in whose
 * credit request never went through) step 2 is skipped and step 3 is retried.
 *
 * Throws with a message fit for a toast.
 */
export async function sendCheckIn({ taskId, files = [], note = '', studentId, onProgress }) {
  const trimmedNote = note.trim()
  const hasNew = files.length > 0 || trimmedNote.length > 0

  if (hasNew) {
    const uploaded = { image: [], video: [], document: [] }
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i]
      const type = detectMediaType(file)
      onProgress?.({ step: 'upload', index: i, total: files.length })
      let result
      try {
        result = await evidenceDocumentService.uploadFile(file, taskId, { studentId, blockType: type })
      } catch (err) {
        throw new Error(err.response?.data?.error || `Could not upload ${file.name}. Please try again.`)
      }
      if (!result?.success || !result.url) {
        throw new Error(result?.error || `Could not upload ${file.name}. Please try again.`)
      }
      uploaded[type].push({ url: result.url, filename: file.name, title: file.name })
    }

    onProgress?.({ step: 'save' })
    const existing = await evidenceDocumentService.getDocument(taskId, { studentId })
    const kept = (existing?.blocks || []).map((b) => ({
      id: b.id,
      type: b.type || b.block_type,
      content: b.content,
      is_private: b.is_private,
    }))
    const added = []
    if (trimmedNote) added.push({ type: 'text', content: { text: trimmedNote } })
    for (const type of ['image', 'video', 'document']) {
      if (uploaded[type].length) added.push({ type, content: { items: uploaded[type] } })
    }

    const saved = await evidenceDocumentService.saveDocument(taskId, [...kept, ...added], 'completed', { studentId })
    if (saved && saved.success === false) {
      throw new Error(saved.error || 'Could not save the check-in. Please try again.')
    }
  }

  onProgress?.({ step: 'request' })
  try {
    const res = await api.post(`/api/tasks/${taskId}/request-credit`, studentId ? { student_id: studentId } : {})
    return res.data?.data || res.data
  } catch (err) {
    // services/api.ts moves a v1 error object to `error_detail` and leaves the
    // message as the string in `error`.
    const code = err.response?.data?.error_detail?.code
    // Already waiting on review is the outcome the parent wanted.
    if (code === 'ALREADY_PENDING') return { diploma_status: 'pending_review' }
    if (code === 'NOT_FOUND' && !hasNew) {
      throw new Error('Add a photo, a file or a note about the work first.')
    }
    const failure = new Error(hasNew
      ? 'Your work was saved, but it could not be sent for review. Press Send again to retry.'
      : 'This check-in could not be sent for review. Please try again.')
    // The evidence is on the task now. The modal clears what it was holding,
    // so pressing Send again retries the request instead of uploading the
    // same photos a second time.
    failure.evidenceSaved = true
    throw failure
  }
}

export default sendCheckIn
