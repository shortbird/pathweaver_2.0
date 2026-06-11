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

/**
 * Normalize a block from the read API (block_type, content with .url) into
 * the draft-internal shape (type, content, file_url for the preview).
 * Used to seed the editor when editing an existing evidence document.
 */
function normalizeInitialBlock(b) {
  const type = b.type || b.block_type
  const content = b.content || {}
  // For media/file blocks, the URL was persisted inside content.url
  // (hotfix #2). Expose it at the top level too so the preview renders.
  const fileUrl = content.url || b.file_url || null
  const fileName = content.file_name || b.file_name || null
  return {
    type,
    content,
    ...(fileUrl ? { file_url: fileUrl } : {}),
    ...(fileName ? { file_name: fileName } : {}),
  }
}

export default function LtiEvidenceEditor({
  taskId,
  onComplete,
  onCancel,
  initialBlocks,
  submitLabel,
}) {
  const isEdit = Array.isArray(initialBlocks)
  const [blocks, setBlocks] = useState(() =>
    isEdit ? initialBlocks.map(normalizeInitialBlock) : [],
  )
  const [textDraft, setTextDraft] = useState('')
  const [linkDraft, setLinkDraft] = useState('')
  const [busy, setBusy] = useState(null) // null | 'image' | 'video' | 'file'
  const [err, setErr] = useState(null)
  const [notice, setNotice] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const initPath = `/api/evidence/documents/${taskId}/upload-init`
  const finalizePath = `/api/evidence/documents/${taskId}/upload-finalize`

  // Backend errors arrive as a string or as {message}; never render an object.
  const errText = (e, fallback) => {
    const raw = e?.response?.data?.error
    if (typeof raw === 'string') return raw
    return raw?.message || e?.message || fallback
  }

  const add = (b) => setBlocks((prev) => [...prev, b])
  const removeAt = (i) => setBlocks((prev) => prev.filter((_, idx) => idx !== i))

  const addText = () => {
    const t = textDraft.trim()
    if (!t) return
    add({ type: 'text', content: { text: t } })
    setTextDraft('')
  }

  // Students paste bare domains ("example.com") — store a usable URL.
  const normalizeUrl = (u) => (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u) ? u : `https://${u}`)

  const addLink = () => {
    const u = linkDraft.trim()
    if (!u) return
    add({ type: 'link', content: { url: normalizeUrl(u) } })
    setLinkDraft('')
  }

  /**
   * Anything typed but not yet "Add"-ed is included on submit. Without this,
   * pasting a link and clicking Save (instead of "Add link" first) silently
   * dropped the link — the exact failure Williamsburg hit in testing.
   */
  const blocksWithDrafts = () => {
    const out = [...blocks]
    const t = textDraft.trim()
    if (t) out.push({ type: 'text', content: { text: t } })
    const u = linkDraft.trim()
    if (u) out.push({ type: 'link', content: { url: normalizeUrl(u) } })
    return out
  }

  const pendingCount =
    blocks.length + (textDraft.trim() ? 1 : 0) + (linkDraft.trim() ? 1 : 0)

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
      // signedUpload enriches err.message with the backend's explanation
      // (e.g. unsupported format, file too large); read .response directly
      // too in case the error came from elsewhere in the chain.
      setErr(errText(e, 'Upload failed'))
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
                  actually see what they attached. URL lives in content.url
                  on persisted blocks (hotfix #2) and at top-level file_url
                  on freshly-uploaded blocks; check both. */}
              {b.type === 'image' && (b.file_url || b.content?.url) ? (
                <img
                  src={b.file_url || b.content.url}
                  alt={b.file_name || b.content?.file_name || 'image evidence'}
                  className="block w-full max-h-64 rounded object-contain bg-white"
                />
              ) : null}
              {b.type === 'video' && (b.file_url || b.content?.url) ? (
                <video
                  src={b.file_url || b.content.url}
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

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={addLink}
          disabled={!linkDraft.trim()}
          className="text-xs px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          Add link
        </button>
        <div className="flex items-center gap-2">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="text-sm px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            disabled={submitting || busy !== null || pendingCount === 0}
            onClick={async () => {
              setErr(null)
              setSubmitting(true)
              try {
                const finalBlocks = blocksWithDrafts()
                await onComplete(finalBlocks)
                // Drafts are saved now — clear them so a re-render of the
                // editor (edit flow) doesn't double-add them.
                setBlocks(finalBlocks)
                setTextDraft('')
                setLinkDraft('')
              } catch (e) {
                setErr(errText(e, 'Could not submit evidence'))
              } finally {
                setSubmitting(false)
              }
            }}
            className="text-sm px-4 py-2 rounded-md bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium disabled:opacity-50"
          >
            {submitting
              ? 'Saving…'
              : busy !== null
                ? 'Uploading…'
                : `${submitLabel || (isEdit ? 'Save' : 'Mark complete')} (${pendingCount})`}
          </button>
        </div>
      </div>

      {notice && <p className="text-xs text-amber-600">{notice}</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  )
}

LtiEvidenceEditor.propTypes = {
  taskId: PropTypes.string.isRequired,
  onComplete: PropTypes.func.isRequired,
  // When supplied, the editor opens pre-populated with these blocks (Edit
  // flow on a completed task). Each block from the server has shape
  // { block_type, content, ... }.
  initialBlocks: PropTypes.array,
  // When supplied, a Cancel button appears next to Save.
  onCancel: PropTypes.func,
  // Override the primary button label (default: "Mark complete" / "Save").
  submitLabel: PropTypes.string,
}
