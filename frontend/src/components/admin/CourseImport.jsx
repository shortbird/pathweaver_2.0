import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import toast from 'react-hot-toast'
import CourseImportEditor from './CourseImportEditor'

const CourseImport = () => {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [showEditor, setShowEditor] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  const handleFileSelect = (selectedFile) => {
    // Validate file type
    const validExtensions = ['.imscc', '.zip']
    const fileExtension = selectedFile.name.toLowerCase().slice(selectedFile.name.lastIndexOf('.'))

    if (!validExtensions.includes(fileExtension)) {
      toast.error('Invalid file type. Please upload a .imscc or .zip file.')
      return
    }

    // Validate file size (100MB max)
    const maxSize = 100 * 1024 * 1024
    if (selectedFile.size > maxSize) {
      toast.error('File too large. Maximum size is 100MB.')
      return
    }

    setFile(selectedFile)
    setPreviewData(null)
  }

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0])
    }
  }

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a file first')
      return
    }

    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('imscc_file', file)

      const response = await api.post('/api/admin/courses/import/preview', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      if (response.data.success) {
        setPreviewData(response.data)
        setShowEditor(true)
        toast.success('File parsed successfully!')
      } else {
        toast.error(response.data.error || 'Failed to parse file')
      }
    } catch (error) {
      console.error('Upload error:', error)
      toast.error(error.response?.data?.error || 'Failed to upload file')
    } finally {
      setUploading(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setPreviewData(null)
    setShowEditor(false)
  }

  const handleImportComplete = (questId) => {
    // Navigate to quest management or show success
    navigate(`/admin/quest-management`)
  }

  // Show editor if preview data is loaded
  if (showEditor && previewData) {
    return (
      <CourseImportEditor
        previewData={previewData}
        onBack={handleReset}
        onImportComplete={handleImportComplete}
      />
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Import Canvas Course</h1>
        <p className="text-gray-600">
          Upload an IMSCC file exported from Canvas to preview how it will be mapped to badges and quests.
        </p>
      </div>

      {!previewData ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              dragActive
                ? 'border-optio-purple bg-purple-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center">
              <svg
                className="w-16 h-16 text-gray-400 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>

              <p className="text-lg font-medium text-gray-900 mb-2">
                {file ? file.name : 'Drop your IMSCC file here'}
              </p>
              <p className="text-sm text-gray-500 mb-4">
                or click to browse
              </p>

              <input
                type="file"
                id="file-upload"
                className="hidden"
                accept=".imscc,.zip"
                onChange={handleFileInputChange}
              />

              <label
                htmlFor="file-upload"
                className="px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg cursor-pointer hover:shadow-lg transition-shadow"
              >
                Select File
              </label>

              {file && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{file.name}</p>
                      <p className="text-sm text-gray-500">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                    <button
                      onClick={handleReset}
                      className="text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {file && (
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="px-8 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:shadow-lg transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? 'Parsing...' : 'Parse & Preview'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-900">Import Preview</h2>
              <button
                onClick={handleReset}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Upload New File
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-600 font-medium">Total Assignments</p>
                <p className="text-3xl font-bold text-blue-900">
                  {previewData.stats.total_assignments}
                </p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-green-600 font-medium">Total Modules</p>
                <p className="text-3xl font-bold text-green-900">
                  {previewData.stats.total_modules}
                </p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <p className="text-sm text-purple-600 font-medium">File Size</p>
                <p className="text-3xl font-bold text-purple-900">
                  {previewData.upload_info.file_size_mb} MB
                </p>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm text-gray-500">
                Uploaded: {previewData.upload_info.filename}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Badge Preview</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Name</label>
                <p className="text-lg text-gray-900">{previewData.badge_preview.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Description</label>
                <p className="text-gray-900">
                  {previewData.badge_preview.description || 'No description provided'}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Course Code</label>
                  <p className="text-gray-900">
                    {previewData.badge_preview.course_code || 'N/A'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Primary Pillar</label>
                  <p className="text-gray-900 capitalize">
                    {previewData.badge_preview.pillar_primary}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Required XP</label>
                  <p className="text-gray-900">{previewData.badge_preview.min_xp} XP</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Total Tasks</label>
                <p className="text-gray-900">
                  {previewData.badge_preview.metadata.total_assignments} assignments
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Badge requires {previewData.badge_preview.min_xp} XP from completing tasks (1 Canvas point = 1 XP)
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Quest Preview</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Title</label>
                <p className="text-lg text-gray-900">{previewData.quest_preview.title}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Description</label>
                <p className="text-gray-900">
                  {previewData.quest_preview.description || 'No description provided'}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Type</label>
                  <p className="text-gray-900 capitalize">{previewData.quest_preview.quest_type}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Platform</label>
                  <p className="text-gray-900 capitalize">{previewData.quest_preview.lms_platform}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Total Tasks</label>
                  <p className="text-gray-900">{previewData.tasks_preview.length}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Tasks Preview ({previewData.tasks_preview.length})
            </h3>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {previewData.tasks_preview.map((task, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg p-4 hover:border-optio-purple transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-500">
                          #{task.order_index}
                        </span>
                        <h4 className="text-lg font-semibold text-gray-900">{task.title}</h4>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {task.description || 'No description'}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-lg font-bold text-optio-purple">
                        {task.xp_value} XP
                      </p>
                      <p className="text-xs text-gray-500">
                        {task.metadata.canvas_points} Canvas pts
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                    <span className="bg-gray-100 px-2 py-1 rounded capitalize">
                      {task.pillar}
                    </span>
                    {task.metadata.submission_types && (
                      <span>
                        Submission: {task.metadata.submission_types.join(', ')}
                      </span>
                    )}
                    {task.metadata.due_date && (
                      <span>Due: {new Date(task.metadata.due_date).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <svg
                className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <h4 className="font-semibold text-yellow-900 mb-1">Preview Only</h4>
                <p className="text-sm text-yellow-800">
                  This is a preview of what would be created. No database records have been created yet.
                  The actual import functionality (Phase 2) will allow you to confirm and customize these
                  settings before creating the badge and quests.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CourseImport
