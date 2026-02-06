import React, { useState } from 'react'
import toast from 'react-hot-toast'
import api from '../../../services/api'
import StatusBadge from './StatusBadge'

// Helper to format relative time
const formatRelativeTime = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

/**
 * Table displaying curriculum upload history.
 */
function UploadHistoryTable({
  uploadHistory,
  historyLoading,
  currentUploadId,
  onRefresh,
  onSelectUpload,
  onCancelUpload,
}) {
  const [expandedErrors, setExpandedErrors] = useState({})

  if (historyLoading) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-optio-purple border-t-transparent mx-auto mb-2"></div>
        Loading uploads...
      </div>
    )
  }

  if (uploadHistory.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        No uploads yet. Upload your first curriculum above.
      </div>
    )
  }

  const handleResume = async (uploadId) => {
    try {
      await api.post(`/api/admin/curriculum/upload/${uploadId}/resume`, {})
      toast.success('Resuming upload...')
      onRefresh()
    } catch (err) {
      toast.error('Failed to resume')
    }
  }

  const handleCancel = async (upload) => {
    if (!window.confirm('Cancel this upload? You may be able to resume later.')) return
    try {
      await api.delete(`/api/admin/curriculum/upload/${upload.id}`)
      toast.success('Upload cancelled')
      if (onCancelUpload) {
        onCancelUpload(upload)
      }
      onRefresh()
    } catch (err) {
      toast.error('Failed to cancel')
    }
  }

  return (
    <div className="overflow-hidden border border-gray-200 rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">File</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Organization</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Started</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {uploadHistory.map((upload) => (
            <React.Fragment key={upload.id}>
              <tr
                className={`${upload.id === currentUploadId ? 'bg-purple-50' : ''} cursor-pointer hover:bg-gray-50`}
                onClick={() => onSelectUpload(upload)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-sm text-gray-900 truncate max-w-[200px]" title={upload.original_filename}>
                      {upload.original_filename || 'Text Upload'}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {upload.organization_name ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {upload.organization_name}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      Platform
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={upload.status} />
                </td>
                <td className="px-4 py-3">
                  {upload.status === 'processing' ? (
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-optio-purple to-optio-pink h-2 rounded-full transition-all duration-300"
                          style={{ width: `${upload.progress_percent || 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{upload.progress_percent || 0}%</span>
                    </div>
                  ) : upload.status === 'approved' ? (
                    <span className="text-xs text-green-600">Complete</span>
                  ) : upload.status === 'error' ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpandedErrors(prev => ({ ...prev, [upload.id]: !prev[upload.id] }))
                      }}
                      className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
                    >
                      {upload.current_stage_name || 'Failed'}
                      <svg
                        className={`w-3 h-3 transition-transform ${expandedErrors[upload.id] ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {formatRelativeTime(upload.uploaded_at)}
                </td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-2">
                    {upload.status === 'approved' && (upload.created_course_id || upload.created_quest_id) && (
                      <a
                        href={upload.created_course_id ? `/courses/${upload.created_course_id}/edit` : `/quests/${upload.created_quest_id}`}
                        className="text-xs text-optio-purple hover:underline"
                      >
                        {upload.created_course_id ? 'Edit Course' : 'View'}
                      </a>
                    )}
                    {upload.status === 'error' && upload.can_resume && (
                      <button
                        onClick={() => handleResume(upload.id)}
                        className="text-xs text-yellow-600 hover:underline"
                      >
                        Resume
                      </button>
                    )}
                    {upload.status === 'processing' && (
                      <button
                        onClick={() => handleCancel(upload)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Cancel
                      </button>
                    )}
                    {upload.id === currentUploadId && upload.status === 'processing' && (
                      <span className="text-xs text-optio-purple font-medium">Active</span>
                    )}
                  </div>
                </td>
              </tr>
              {/* Expandable error details row */}
              {upload.status === 'error' && expandedErrors[upload.id] && (
                <tr className="bg-red-50">
                  <td colSpan={6} className="px-4 py-3">
                    <div className="text-sm">
                      <div className="font-medium text-red-800 mb-2">Error Details</div>
                      <pre className="bg-red-100 border border-red-200 rounded p-3 text-xs text-red-900 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
                        {upload.error_message || upload.error || 'No error details available'}
                      </pre>
                      {upload.current_item && (
                        <div className="mt-2 text-xs text-red-700">
                          <span className="font-medium">Last item:</span> {upload.current_item}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default UploadHistoryTable
