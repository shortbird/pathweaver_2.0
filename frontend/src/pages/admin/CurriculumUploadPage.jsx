import React, { useState } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'

const VALID_EXTENSIONS = ['.imscc', '.zip', '.pdf', '.docx', '.doc']
const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

const CurriculumUploadPage = () => {
  // Upload state
  const [activeTab, setActiveTab] = useState('file') // 'file' or 'text'
  const [file, setFile] = useState(null)
  const [textContent, setTextContent] = useState('')
  const [textTitle, setTextTitle] = useState('')

  // Options state
  const [transformationLevel, setTransformationLevel] = useState('moderate')
  const [preserveStructure, setPreserveStructure] = useState(true)

  // Processing state
  const [uploading, setUploading] = useState(false)
  const [uploadStarted, setUploadStarted] = useState(false)
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
    const fileName = selectedFile.name.toLowerCase()
    const isValid = VALID_EXTENSIONS.some(ext => fileName.endsWith(ext))

    if (!isValid) {
      toast.error('Invalid file type. Supported: .imscc, .zip, .pdf, .docx')
      return
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      toast.error('File too large. Maximum size is 100MB.')
      return
    }

    setFile(selectedFile)
    setUploadStarted(false)
  }

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0])
    }
  }

  const handleUpload = async () => {
    if (activeTab === 'file' && !file) {
      toast.error('Please select a file first')
      return
    }

    if (activeTab === 'text' && !textContent.trim()) {
      toast.error('Please enter curriculum content')
      return
    }

    setUploading(true)

    try {
      let response

      if (activeTab === 'file') {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('transformation_level', transformationLevel)
        formData.append('preserve_structure', preserveStructure.toString())

        response = await api.post('/api/admin/curriculum/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      } else {
        response = await api.post('/api/admin/curriculum/upload', {
          text: textContent,
          title: textTitle || 'Pasted Curriculum',
          transformation_level: transformationLevel,
          preserve_structure: preserveStructure
        })
      }

      if (response.data.success) {
        setUploadStarted(true)
        toast.success('Processing started! You\'ll receive a notification when your course is ready.')
      } else {
        toast.error(response.data.error || 'Failed to start processing')
      }
    } catch (error) {
      console.error('Upload error:', error)
      toast.error(error.response?.data?.error || 'Failed to upload curriculum')
    } finally {
      setUploading(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setTextContent('')
    setTextTitle('')
    setUploadStarted(false)
  }

  // Show success state after upload started
  if (uploadStarted) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-16">
          <div className="mb-6">
            <svg className="w-20 h-20 mx-auto text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-3">Processing Your Curriculum</h2>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Your curriculum is being processed by AI. This usually takes 1-3 minutes.
            You'll receive a notification when your course is ready to edit.
          </p>
          <p className="text-sm text-gray-500 mb-8">
            Feel free to continue using the site - you don't need to stay on this page.
          </p>
          <div className="flex justify-center gap-4">
            <button
              onClick={handleReset}
              className="px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
            >
              Upload Another
            </button>
            <a
              href="/admin"
              className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium"
            >
              Go to Admin Panel
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">AI Curriculum Upload</h2>
        <p className="text-gray-600 mt-1">
          Upload curriculum from various formats. AI will create a draft course with lessons that you can edit in the Course Builder.
        </p>
      </div>

      {/* Input Method Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('file')}
            className={`pb-3 px-1 font-medium ${
              activeTab === 'file'
                ? 'border-b-2 border-optio-purple text-optio-purple'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            File Upload
          </button>
          <button
            onClick={() => setActiveTab('text')}
            className={`pb-3 px-1 font-medium ${
              activeTab === 'text'
                ? 'border-b-2 border-optio-purple text-optio-purple'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Paste Text
          </button>
        </div>
      </div>

      {/* File Upload Tab */}
      {activeTab === 'file' && (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive
              ? 'border-optio-purple bg-purple-50'
              : file
              ? 'border-green-400 bg-green-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {file ? (
            <div>
              <div className="text-green-600 mb-2">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="font-medium text-gray-900">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              <button
                onClick={() => setFile(null)}
                className="mt-2 text-sm text-red-600 hover:text-red-800"
              >
                Remove
              </button>
            </div>
          ) : (
            <div>
              <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-gray-600 mb-2">
                Drag and drop your curriculum file here, or{' '}
                <label className="text-optio-purple hover:underline cursor-pointer">
                  browse
                  <input
                    type="file"
                    className="hidden"
                    accept=".imscc,.zip,.pdf,.docx,.doc"
                    onChange={handleFileInputChange}
                  />
                </label>
              </p>
              <p className="text-sm text-gray-500">
                Supported formats: Canvas (.imscc), PDF, Word (.docx)
              </p>
            </div>
          )}
        </div>
      )}

      {/* Text Paste Tab */}
      {activeTab === 'text' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title (optional)
            </label>
            <input
              type="text"
              value={textTitle}
              onChange={(e) => setTextTitle(e.target.value)}
              placeholder="e.g., Introduction to Biology"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Curriculum Content
            </label>
            <textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Paste your syllabus, lesson plan, or curriculum outline here..."
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent font-mono text-sm"
            />
            <p className="text-sm text-gray-500 mt-1">
              {textContent.length.toLocaleString()} characters
            </p>
          </div>
        </div>
      )}

      {/* Transformation Options */}
      <div className="mt-8 p-6 bg-gray-50 rounded-lg">
        <h3 className="font-medium text-gray-900 mb-4">Transformation Options</h3>

        <div className="space-y-6">
          {/* Transformation Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Transformation Level
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'light', label: 'Light', desc: 'Keep original voice, only structure' },
                { value: 'moderate', label: 'Moderate', desc: 'Enhance with Optio elements' },
                { value: 'full', label: 'Full', desc: 'Rewrite in Optio voice' }
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => setTransformationLevel(option.value)}
                  className={`p-3 rounded-lg border-2 text-left transition-colors ${
                    transformationLevel === option.value
                      ? 'border-optio-purple bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-gray-900">{option.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{option.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Structure Option */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preserveStructure}
                onChange={(e) => setPreserveStructure(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
              />
              <div>
                <div className="font-medium text-gray-900">Preserve Original Structure</div>
                <div className="text-sm text-gray-500">
                  Keep the original module/lesson order. Uncheck to restructure for just-in-time teaching.
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">How it works</p>
            <p>
              AI will analyze your curriculum and create a draft course with lessons.
              You'll receive a notification when it's ready, then you can edit everything
              in the Course Builder before publishing.
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={handleReset}
          className="px-4 py-2 text-gray-700 hover:text-gray-900"
        >
          Reset
        </button>
        <button
          onClick={handleUpload}
          disabled={uploading || (activeTab === 'file' && !file) || (activeTab === 'text' && !textContent.trim())}
          className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {uploading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              Starting...
            </>
          ) : (
            'Process Curriculum'
          )}
        </button>
      </div>
    </div>
  )
}

export default CurriculumUploadPage
