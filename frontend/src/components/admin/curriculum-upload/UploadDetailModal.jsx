import React from 'react'
import toast from 'react-hot-toast'
import api from '../../../services/api'
import StatusBadge from './StatusBadge'

// Stage labels for progress display
const STAGE_LABELS = {
  parse: 'Parse Document',
  structure: 'Detect Structure',
  align: 'Align Philosophy',
  generate: 'Generate Content'
}

/**
 * Modal showing detailed upload information.
 */
function UploadDetailModal({ upload, onClose, onRefresh }) {
  if (!upload) return null

  const handleResume = async () => {
    try {
      await api.post(`/api/admin/curriculum/upload/${upload.id}/resume`, {})
      toast.success('Resuming upload...')
      onClose()
      onRefresh()
    } catch (err) {
      toast.error('Failed to resume')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Upload Details</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
          {/* File Info */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-500 uppercase">File</label>
            <p className="text-sm text-gray-900 mt-1">{upload.original_filename || 'Text Upload'}</p>
          </div>

          {/* Status */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-500 uppercase">Status</label>
            <div className="mt-1">
              <StatusBadge status={upload.status} />
            </div>
          </div>

          {/* Progress */}
          {upload.status === 'processing' && (
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-500 uppercase">Progress</label>
              <div className="mt-2">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{upload.current_stage_name || 'Processing...'}</span>
                  <span className="font-medium text-optio-purple">{upload.progress_percent || 0}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-optio-purple to-optio-pink h-2 rounded-full transition-all duration-300"
                    style={{ width: `${upload.progress_percent || 0}%` }}
                  />
                </div>
                {upload.current_item && (
                  <p className="text-xs text-gray-500 mt-2">{upload.current_item}</p>
                )}
              </div>
            </div>
          )}

          {/* Stage Progress */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-500 uppercase">Stages</label>
            <div className="mt-2 flex justify-between gap-2">
              {Object.entries(STAGE_LABELS).map(([key, label], index) => {
                const stageNum = index + 1
                const isCompleted = upload.current_stage >= stageNum ||
                  (upload[`stage_${stageNum}_completed_at`])
                const isCurrent = upload.current_stage_name?.toLowerCase().includes(key)

                return (
                  <div key={key} className="flex flex-col items-center flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      isCompleted ? 'bg-green-500 text-white' :
                      isCurrent ? 'bg-optio-purple text-white animate-pulse' :
                      'bg-gray-200 text-gray-500'
                    }`}>
                      {isCompleted ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : stageNum}
                    </div>
                    <span className="text-xs text-gray-500 mt-1 text-center">{label.split(' ')[0]}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Error Details */}
          {upload.status === 'error' && (
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-500 uppercase">Error</label>
              <pre className="mt-2 bg-red-50 border border-red-200 rounded p-3 text-xs text-red-800 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">
                {upload.error_message || upload.error || 'Unknown error'}
              </pre>
            </div>
          )}

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Started</label>
              <p className="text-sm text-gray-900 mt-1">
                {upload.uploaded_at ? new Date(upload.uploaded_at).toLocaleString() : '-'}
              </p>
            </div>
            {upload.completed_at && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Completed</label>
                <p className="text-sm text-gray-900 mt-1">
                  {new Date(upload.completed_at).toLocaleString()}
                </p>
              </div>
            )}
          </div>

          {/* Resume Info */}
          {upload.can_resume && upload.status === 'error' && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                This upload can be resumed from stage {upload.resume_from_stage || upload.current_stage}.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          {upload.status === 'error' && upload.can_resume && (
            <button
              onClick={handleResume}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg font-medium hover:bg-yellow-700"
            >
              Resume
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default UploadDetailModal
