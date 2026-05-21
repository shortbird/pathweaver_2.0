/**
 * LtiEvidenceEditor (v1) — multi-format evidence capture for one task in
 * the Canvas iframe.
 *
 * Before this, the LTI quest flow could only submit a single text block.
 * Optio supports text / link / image / video / file everywhere else; this
 * brings the LTI student flow to parity. The backend
 * POST /api/evidence/documents/<task_id> already accepts an arbitrary
 * blocks[] array — this is purely the missing frontend.
 *
 * Upload path uses the proven uploadViaSignedUrl helper from v1's
 * services/signedUpload.js (init → direct-to-Supabase PUT → finalize),
 * never routing the file through the backend. Text/link are inline blocks
 * with no upload.
 *
 * Soft warning above ~100MB video (no LTI-only hard cap — decision §9.4).
 *
 * Slim, ref-less, no auto-save: this collects a draft block list and emits
 * it to `onComplete(blocks)` when the student presses Mark complete. The
 * heavier `MultiFormatEvidenceEditor` is the right choice in the main app
 * (auto-save, draft restore); in the iframe we prefer one explicit submit.
 */

import { useState } from 'react'
import PropTypes from 'prop-types'
import { uploadViaSignedUrl } from '../../services/signedUpload'

const SOFT_VIDEO_WARN_BYTES = 100 * 1024 * 1024 // 100MB — warn, never block

export default function LtiEvidenceEditor({ taskId, onComplete }) {
  const [blocks, setBlocks] = useState([])
  const [textDraft, setTextDraft] = useState('')
  const [linkDraft, setLinkDraft] = useState('')
  const [busy, setBusy] = useState(null) // null | 'image' | 'video' | 'file'
  const [err, setErr] = useState(null)
  const [notice, setNotice] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const initPath = `/api/evidence/documents/${taskId}/upload-init`
  const finalizePath = `/api/evidence/documents/${taskId}/upload-finalize`

  const add = (b) => setBlocks((prev) => [...prev, b])
  const removeAt = (i) => setBlocks((prev) => prev.filter((_, idx) => idx !== i))

  const addText = () => {
    const t = textDraft.trim()
    if (!t) return
    add({ type: 'text', content: { text: t } })
    setTextDraft('')
  }

  const addLink = () => {
    const u = linkDraft.trim()
    if (!u) return
    add({ type: 'link', content: { url: u } })
    setLinkDraft('')
  }

  const uploadAndAdd = async (file, blockType) => {
    setErr(null)
    setNotice(null)
    if (blockType === 'video' && file.size > SOFT_VIDEO_WARN_BYTES) {
      setNotice(
        'Large video — this may upload slowly on a school network. Keeping it under ~100MB is smoother.',
      )
    }
    setBusy(blockType)
    try {
      const result = await uploadViaSignedUrl({
        file,
        initPath,
        finalizePath,
        blockType,
      })
      const fileUrl = result.file_url || result.url
      const fileName = result.file_name || result.filename || file.name
      // The persistence layer (routes/evidence_documents.update_document_blocks)
      // only reads block.content — top-level file_url is silently dropped.
      // Put the URL INSIDE content so the saved row keeps it.
      add({
        type: blockType,
        content: { url: fileUrl, file_name: fileName },
        // Keep top-level too for components reading from there (read-side).
        file_url: fileUrl,
        file_name: fileName,
      })
    } catch (e) {
      setErr(e?.message || 'Upload failed')
    } finally {
      setBusy(null)
    }
  }

  const onMediaPicked = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    const isVideo = file.type.startsWith('video/')
    uploadAndAdd(file, isVideo ? 'video' : 'image')
  }

  const onFilePicked = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    uploadAndAdd(file, 'document')
  }

  return (
    <div className="space-y-3" data-testid="lti-evidence-editor">
      {blocks.length > 0 && (
        <ul className="space-y-2">
          {blocks.map((b, i) => (
            <li
              key={i}
              className="rounded-md bg-gray-50 px-3 py-2 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="inline-flex items-center rounded-full bg-optio-purple/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-optio-purple">
                    {b.type}
                  </span>
                  <span className="text-xs text-gray-700 truncate">
                    {b.type === 'text'
                      ? b.content.text
                      : b.type === 'link'
                        ? b.content.url
                        : b.file_name || 'attached'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="text-xs text-gray-500 hover:text-gray-800 shrink-0"
                >
                  Remove
                </button>
              </div>
              {/* Larger previews for visual evidence so the student can
                  actually see what they attached — the thumbnail in the
                  meta row above is too small to be useful. */}
              {b.type === 'image' && b.file_url ? (
                <img
                  src={b.file_url}
                  alt={b.file_name || 'image evidence'}
                  className="block w-full max-h-64 rounded object-contain bg-white"
                />
              ) : null}
              {b.type === 'video' && b.file_url ? (
                <video
                  src={b.file_url}
                  controls
                  preload="metadata"
                  className="block w-full max-h-64 rounded bg-black"
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <textarea
        rows={2}
        value={textDraft}
        onChange={(e) => setTextDraft(e.target.value)}
        placeholder="Write what you did, learned, or made"
        data-testid="lti-evidence-text"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-optio-purple focus:outline-none focus:ring-1 focus:ring-optio-purple"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addText}
          disabled={!textDraft.trim()}
          className="text-xs px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          Add text
        </button>
        <label className="text-xs px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 cursor-pointer">
          {busy === 'image' || busy === 'video' ? 'Uploading…' : 'Add photo/video'}
          <input
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={onMediaPicked}
            disabled={busy !== null}
          />
        </label>
        <label className="text-xs px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 cursor-pointer">
          {busy === 'file' ? 'Uploading…' : 'Add file'}
          <input
            type="file"
            className="hidden"
            onChange={onFilePicked}
            disabled={busy !== null}
          />
        </label>
      </div>

      <input
        type="url"
        value={linkDraft}
        onChange={(e) => setLinkDraft(e.target.value)}
        placeholder="…or paste a link (https://)"
        data-testid="lti-evidence-link"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-optio-purple focus:outline-none focus:ring-1 focus:ring-optio-purple"
      />

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={addLink}
          disabled={!linkDraft.trim()}
          className="text-xs px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          Add link
        </button>
        <button
          type="button"
          disabled={submitting || blocks.length === 0}
          onClick={async () => {
            setErr(null)
            setSubmitting(true)
            try {
              await onComplete(blocks)
            } catch (e) {
              setErr(e?.message || 'Could not submit evidence')
            } finally {
              setSubmitting(false)
            }
          }}
          className="text-sm px-4 py-2 rounded-md bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : `Mark complete (${blocks.length})`}
        </button>
      </div>

      {notice && <p className="text-xs text-amber-600">{notice}</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  )
}

LtiEvidenceEditor.propTypes = {
  taskId: PropTypes.string.isRequired,
  onComplete: PropTypes.func.isRequired,
}
