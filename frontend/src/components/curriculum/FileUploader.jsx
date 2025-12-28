import React, { useState, useRef } from 'react'
import api from '../../services/api'
import { toast } from 'react-hot-toast'

const FileUploader = ({ questId, attachments, onChange }) => {
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({})
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

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
    formData.append('quest_id', questId)

    try {
      setUploading(true)
      setUploadProgress(prev => ({ ...prev, [file.name]: 0 }))

      const response = await api.post('/api/curriculum/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          setUploadProgress(prev => ({ ...prev, [file.name]: progress }))
        }
      })

      const newAttachment = response.data
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
      await api.delete(`/api/curriculum/attachments/${attachmentId}`, {})
      onChange(attachments.filter(att => att.id !== attachmentId))
      toast.success('Attachment removed')
    } catch (error) {
      console.error('Remove error:', error)
      toast.error('Failed to remove attachment')
    }
  }

  const getFileIcon = (fileType) => {
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

      {/* Existing Attachments */}
      {attachments.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Uploaded Files</h4>
          {attachments.map(attachment => (
            <div key={attachment.id} className="flex items-center justify-between bg-white border border-gray-300 rounded-lg p-3">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                {getFileIcon(attachment.file_type)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{attachment.file_name}</p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(attachment.file_size_bytes)} • Uploaded {new Date(attachment.uploaded_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <a
                  href={attachment.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-optio-purple hover:text-optio-pink transition-colors"
                  aria-label="View file"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </a>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(attachment.id)}
                  className="text-red-600 hover:text-red-800 transition-colors"
                  aria-label="Remove file"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
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
