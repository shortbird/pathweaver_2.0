/**
 * Extracted from pages/courses/CourseHomepage.jsx on 2026-09-04 (QF-02).
 * That file was 1,654 lines with five components in it; this is one of them,
 * moved verbatim. No behaviour changed -- only the address.
 */

import React, { useState, useEffect, useRef } from 'react'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  XMarkIcon,
  PlusIcon,
  CameraIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import toast from 'react-hot-toast'

import api from '../../../services/api'
import { getPillarData } from '../../../utils/pillarMappings'

/**
 * CourseTaskItem - Expandable task card with evidence and completion
 */
const CourseTaskItem = ({ task, onComplete, onRemove, preview = false }) => {
  const [expanded, setExpanded] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [evidenceBlocks, setEvidenceBlocks] = useState([])
  const [evidenceLoaded, setEvidenceLoaded] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [textEvidence, setTextEvidence] = useState('')
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const pillar = getPillarData(task.pillar)
  const xp = task.xp_value || task.xp_amount || 0

  // Lazy-load evidence when expanded (a preview has no evidence of its own)
  useEffect(() => {
    if (preview) return
    if (expanded && !evidenceLoaded && task.id) {
      (async () => {
        try {
          const { data } = await api.get(`/api/evidence/documents/${task.id}`)
          setEvidenceBlocks(data.blocks || [])
        } catch { /* no evidence yet */ }
        finally { setEvidenceLoaded(true) }
      })()
    }
  }, [expanded, task.id, preview])

  // In a staff preview the student view renders in full, but nothing is written
  // to the previewer's account.
  const blockedInPreview = () => {
    if (!preview) return false
    toast('Preview only - student actions are disabled here')
    return true
  }

  const handleComplete = async () => {
    if (blockedInPreview()) return
    const blocks = [...evidenceBlocks]
    if (textEvidence.trim()) {
      blocks.push({ type: 'text', content: { text: textEvidence.trim() }, order_index: blocks.length })
    }
    if (blocks.length === 0) {
      toast.error('Please add at least one piece of evidence before completing this task.')
      return
    }
    setCompleting(true)
    try {
      await api.post(`/api/evidence/documents/${task.id}`, {
        blocks: blocks.map(b => ({ ...b, type: b.type || b.block_type })),
        status: 'completed',
      })
      onComplete(task.id, xp)
      setTextEvidence('')
    } catch { toast.error('Failed to complete task') }
    finally { setCompleting(false) }
  }

  const handleFileSelect = async (e) => {
    const file = e.target?.files?.[0]
    if (!file) return
    if (blockedInPreview()) return
    const maxSize = file.type.startsWith('video/') ? 50 * 1024 * 1024 : file.type.startsWith('image/') ? 10 * 1024 * 1024 : 25 * 1024 * 1024
    if (file.size > maxSize) {
      toast.error(`File too large (${(file.size / (1024 * 1024)).toFixed(1)}MB)`)
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post(`/api/evidence/documents/${task.id}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const blockType = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'document'
      const newBlock = { type: blockType, content: { url: data.url, filename: data.filename || file.name }, order_index: evidenceBlocks.length }
      const updated = [...evidenceBlocks, newBlock]
      await api.post(`/api/evidence/documents/${task.id}`, { blocks: updated.map(b => ({ ...b, type: b.type || b.block_type })), status: 'draft' })
      setEvidenceBlocks(updated)
      // Students watched the spinner vanish and could not tell whether the
      // photo made it, so they re-uploaded or worried they'd lose credit
      // (Gryffin, 2026-08-28). Say it landed.
      toast.success(blockType === 'image' ? 'Photo uploaded and saved' : 'File uploaded and saved')
    } catch { toast.error('Upload failed') }
    finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (cameraInputRef.current) cameraInputRef.current.value = ''
    }
  }

  const handleAddText = async () => {
    if (!textEvidence.trim()) return
    if (blockedInPreview()) return
    const newBlock = { type: 'text', content: { text: textEvidence.trim() }, order_index: evidenceBlocks.length }
    const updated = [...evidenceBlocks, newBlock]
    try {
      await api.post(`/api/evidence/documents/${task.id}`, { blocks: updated.map(b => ({ ...b, type: b.type || b.block_type })), status: 'draft' })
      setEvidenceBlocks(updated)
      setTextEvidence('')
    } catch { toast.error('Failed to save note') }
  }

  const handleDeleteBlock = async (idx) => {
    if (blockedInPreview()) return
    const updated = evidenceBlocks.filter((_, i) => i !== idx)
    try {
      await api.post(`/api/evidence/documents/${task.id}`, { blocks: updated.map(b => ({ ...b, type: b.type || b.block_type })), status: 'draft' })
      setEvidenceBlocks(updated)
    } catch { /* error */ }
  }

  const handleRemove = async () => {
    if (!onRemove) return
    if (blockedInPreview()) return
    setRemoving(true)
    try {
      await onRemove(task.id)
    } finally {
      setRemoving(false)
      setConfirmingRemove(false)
    }
  }

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-shadow ${expanded ? 'shadow-md border-gray-300' : 'border-gray-200 hover:border-gray-300'} border-l-4 ${pillar?.border || 'border-l-gray-300'}`}>
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-3 p-4 text-left">
        {task.is_completed ? (
          <CheckCircleSolid className="w-5 h-5 text-green-500 flex-shrink-0" />
        ) : (
          <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <h4 className={`font-medium text-sm ${task.is_completed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
            {task.title}
          </h4>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs px-1.5 py-0.5 rounded ${pillar?.bg || 'bg-gray-100'} ${pillar?.text || 'text-gray-600'}`}>
              {pillar?.name || task.pillar}
            </span>
            <span className="text-xs text-gray-500">{xp} XP</span>
            {evidenceBlocks.length > 0 && (
              <span className="text-xs text-gray-400">{evidenceBlocks.length} evidence</span>
            )}
          </div>
        </div>
        {task.is_required && (
          <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded flex-shrink-0">Required</span>
        )}
        {expanded ? (
          <ChevronDownIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {task.description && (
            <p className="text-sm text-gray-600">{task.description}</p>
          )}

          {/* Evidence blocks */}
          {evidenceBlocks.length > 0 && (
            <div className="space-y-2">
              {evidenceBlocks.map((block, idx) => {
                const bType = block.type || block.block_type
                const content = block.content || {}
                return (
                  <div key={block.id || idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-sm">
                    <span className="text-gray-400">
                      {bType === 'image' ? '📷' : bType === 'video' ? '🎬' : bType === 'link' ? '🔗' : bType === 'document' ? '📄' : '📝'}
                    </span>
                    <span className="flex-1 text-gray-600 truncate">
                      {content.caption || content.filename || content.title || content.text?.slice(0, 60) || content.url || 'Evidence'}
                    </span>
                    {!task.is_completed && (
                      <button onClick={() => handleDeleteBlock(idx)} className="text-gray-400 hover:text-red-500 p-0.5">
                        <XMarkIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Evidence input */}
          {!task.is_completed && (
            <div className="space-y-2">
              <textarea
                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm resize-none focus:ring-1 focus:ring-optio-purple focus:border-optio-purple"
                placeholder="What did you do? Describe your work..."
                rows={2}
                value={textEvidence}
                onChange={(e) => setTextEvidence(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-optio-purple bg-optio-purple/5 border border-optio-purple/20 rounded-lg hover:bg-optio-purple/10 transition-colors disabled:opacity-50"
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                    {uploading ? 'Uploading...' : 'Upload File'}
                  </button>
                  {/* capture opens the device camera directly on phones and
                      tablets; desktop browsers fall back to the file picker
                      (Gryffin, 2026-08-28: "I expected it to utilize the
                      camera to take a picture, not upload an image"). */}
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-optio-purple bg-optio-purple/5 border border-optio-purple/20 rounded-lg hover:bg-optio-purple/10 transition-colors disabled:opacity-50"
                  >
                    <CameraIcon className="w-3.5 h-3.5" />
                    Take Photo
                  </button>
                  {textEvidence.trim() && (
                    <button
                      onClick={handleAddText}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-optio-purple rounded-lg hover:opacity-90 transition-opacity"
                    >
                      Save Note
                    </button>
                  )}
                </div>
                <button
                  onClick={handleComplete}
                  disabled={completing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
                >
                  <CheckCircleIcon className="w-4 h-4" />
                  {completing ? 'Saving...' : 'Complete Task'}
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx" onChange={handleFileSelect} className="hidden" />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelect} className="hidden" />
            </div>
          )}

          {/* Completed status */}
          {task.is_completed && task.completed_at && (
            <p className="text-xs text-green-600">
              Completed {new Date(task.completed_at).toLocaleDateString()}
            </p>
          )}

          {/* Remove task */}
          {onRemove && (
            <div className="pt-2 border-t border-gray-100">
              {confirmingRemove ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-gray-600">Remove this task from your project?</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setConfirmingRemove(false)}
                      disabled={removing}
                      className="text-xs px-2 py-1 text-gray-600 hover:text-gray-800 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRemove}
                      disabled={removing}
                      className="text-xs px-2 py-1 font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                    >
                      {removing ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingRemove(true)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                  Remove task
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default CourseTaskItem
