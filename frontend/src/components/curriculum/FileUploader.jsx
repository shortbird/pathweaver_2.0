import React, { useState, useRef } from 'react'
import api from '../../services/api'
import { toast } from 'react-hot-toast'

const FileUploader = ({ questId, attachments, onChange }) => {
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({})
  const [isDragging, setIsDragging] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const fileInputRef = useRef(null)

  const startEditing = (attachment) => {
    setEditingId(attachment.id)
    setEditingName(attachment.file_name || '')
  }

  const handleRename = async (attachmentId) => {
    if (!editingName.trim()) {
      toast.error('File name cannot be empty')
      return
    }

    try {
      await api.patch(`/api/quests/${questId}/curriculum/attachments/${attachmentId}`, {
        file_name: editingName.trim()
      })

      // Update local state
      onChange(attachments.map(att =>
        att.id === attachmentId ? { ...att, file_name: editingName.trim() } : att
      ))

      setEditingId(null)
      toast.success('File renamed')
    } catch (error) {
      console.error('Rename error:', error)
      toast.error('Failed to rename file')
    }
  }

  const allowedFileTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'text/plain',
    'application/zip'
  ]

  const maxFileSize = 25 * 1024 * 1024 // 25 MB

  const validateFile = (file) => {
    if (!allowedFileTypes.includes(file.type)) {
      toast.error(`File type not supported: ${file.type}`)
      return false
    }

    if (file.size > maxFileSize) {
      toast.error(`File too large. Maximum size is 25MB. Your file: ${(file.size / 1024 / 1024).toFixed(2)}MB`)
      return false
    }

    return true
  }

  const uploadFile = async (file) => {
    if (!validateFile(file)) return

    const formData = new FormData()
    formData.append('file', file)

    try {
      setUploading(true)
      setUploadProgress(prev => ({ ...prev, [file.name]: 0 }))

      const response = await api.post(`/api/quests/${questId}/curriculum/attachments`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          setUploadProgress(prev => ({ ...prev, [file.name]: progress }))
        }
      })

      const newAttachment = response.data.attachment
      onChange([...attachments, newAttachment])
      toast.success(`Uploaded ${file.name}`)

      // Clear progress
      setUploadProgress(prev => {
        const { [file.name]: _, ...rest } = prev
        return rest
      })
    } catch (error) {
      console.error('Upload error:', error)
      toast.error(error.response?.data?.error || `Failed to upload ${file.name}`)
    } finally {
      setUploading(false)
    }
  }

  const handleFiles = (files) => {
    Array.from(files).forEach(file => uploadFile(file))
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleFileInput = (e) => {
    handleFiles(e.target.files)
    e.target.value = '' // Reset input
  }

  const handleRemoveAttachment = async (attachmentId) => {
    try {
      await api.delete(`/api/quests/${questId}/curriculum/attachments/${attachmentId}`, {})
      onChange(attachments.filter(att => att.id !== attachmentId))
      toast.success('Attachment removed')
    } catch (error) {
      console.error('Remove error:', error)
      toast.error('Failed to remove attachment')
    }
  }

  const getFileIcon = (fileType) => {
    if (!fileType) {
      // Default icon for unknown file type
      return (
        <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    }
    if (fileType.startsWith('image/')) {
      return (
        <svg className="w-8 h-8 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )
    } else if (fileType === 'application/pdf') {
      return (
        <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      )
    } else {
      return (
        <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">File Attachments</h3>
      </div>

      {/* Drag and Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? 'border-optio-purple bg-purple-50'
            : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
        }`}
      >
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="mt-2 text-sm font-medium text-gray-900">
          {isDragging ? 'Drop files here' : 'Drag and drop files here'}
        </p>
        <p className="mt-1 text-xs text-gray-500">or</p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="mt-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          Browse Files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInput}
          className="hidden"
          accept={allowedFileTypes.join(',')}
        />
        <p className="mt-2 text-xs text-gray-500">
          PDF, Word, PowerPoint, Images (max 25MB each)
        </p>
      </div>

      {/* Upload Progress */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="space-y-2">
          {Object.entries(uploadProgress).map(([fileName, progress]) => (
            <div key={fileName} className="bg-white border border-gray-300 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900 truncate">{fileName}</span>
                <span className="text-sm text-gray-600">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-optio-purple to-optio-pink h-2 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Existing Attachments - Grid View */}
      {attachments.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-700">Uploaded Files ({attachments.length})</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {attachments.map(attachment => (
              <div key={attachment.id} className="group relative bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                {/* Preview Area */}
                <a
                  href={attachment.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-square bg-gray-50 flex items-center justify-center cursor-pointer"
                >
                  {attachment.file_type?.startsWith('image/') ? (
                    <img
                      src={attachment.file_url}
                      alt={attachment.file_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-4">
                      {getFileIcon(attachment.file_type)}
                      <span className="mt-2 text-xs text-gray-500 uppercase font-medium">
                        {attachment.file_name?.split('.').pop() || 'FILE'}
                      </span>
                    </div>
                  )}
                  {/* Hover overlay with view icon */}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center">
                    <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </div>
                </a>

                {/* File Info */}
                <div className="p-2">
                  {editingId === attachment.id ? (
                    <form onSubmit={(e) => { e.preventDefault(); handleRename(attachment.id) }} className="flex gap-1">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-optio-purple"
                        autoFocus
                      />
                      <button type="submit" className="text-green-600 hover:text-green-800">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="text-gray-500 hover:text-gray-700">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </form>
                  ) : (
                    <p
                      className="text-xs font-medium text-gray-900 truncate cursor-pointer hover:text-optio-purple"
                      onClick={() => startEditing(attachment)}
                      title="Click to rename"
                    >
                      {attachment.file_name}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatFileSize(attachment.file_size_bytes)}
                  </p>
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(attachment.id)}
                  className="absolute top-2 right-2 p-1 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-800 hover:bg-red-50"
                  aria-label="Remove file"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-6 border border-dashed border-gray-300 rounded-lg">
          <p className="text-sm text-gray-600">No files uploaded yet</p>
        </div>
      )}
    </div>
  )
}

export default FileUploader
