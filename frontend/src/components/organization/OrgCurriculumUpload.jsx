import React, { useState, useEffect, useCallback, useRef } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'

const VALID_EXTENSIONS = ['.imscc', '.zip', '.pdf', '.docx', '.doc']
const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB
const LOCALSTORAGE_KEY_PREFIX = 'orgCurriculumUpload_'

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

// Status badge component
const StatusBadge = ({ status }) => {
  const styles = {
    processing: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    ready_for_review: 'bg-blue-100 text-blue-800 border-blue-200',
    approved: 'bg-green-100 text-green-800 border-green-200',
    error: 'bg-red-100 text-red-800 border-red-200',
    rejected: 'bg-gray-100 text-gray-600 border-gray-200',
    pending: 'bg-gray-100 text-gray-600 border-gray-200'
  }
  const labels = {
    processing: 'Processing',
    ready_for_review: 'Review',
    approved: 'Complete',
    error: 'Failed',
    rejected: 'Rejected',
    pending: 'Pending'
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border ${styles[status] || styles.pending}`}>
      {status === 'processing' && (
        <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse" />
      )}
      {labels[status] || status}
    </span>
  )
}

// Stage labels for progress display
const STAGE_LABELS = {
  parse: 'Parse Document',
  structure: 'Detect Structure',
  align: 'Align Philosophy',
  generate: 'Generate Content'
}

// Helper to extract error message from API responses
const getErrorMessage = (error, fallback = 'An error occurred') => {
  const data = error?.response?.data
  if (!data) return fallback
  if (data.error?.message) return data.error.message
  if (typeof data.error === 'string') return data.error
  if (typeof data.message === 'string') return data.message
  return fallback
}

export default function OrgCurriculumUpload({ orgId }) {
  const localStorageKey = `${LOCALSTORAGE_KEY_PREFIX}${orgId}`

  // Upload state
  const [activeTab, setActiveTab] = useState('file') // 'file' or 'text'
  const [file, setFile] = useState(null)
  const [textContent, setTextContent] = useState('')
  const [textTitle, setTextTitle] = useState('')

  // Options state
  const [learningObjectives, setLearningObjectives] = useState('')

  // Processing state
  const [uploading, setUploading] = useState(false)
  const [uploadStarted, setUploadStarted] = useState(false)
  const [uploadId, setUploadId] = useState(null)
  const [dragActive, setDragActive] = useState(false)

  // Progress tracking state
  const [progress, setProgress] = useState(null)
  const [pollingActive, setPollingActive] = useState(false)

  // Upload history state
  const [uploadHistory, setUploadHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [expandedErrors, setExpandedErrors] = useState({})

  // Track max progress to prevent regression in display
  const maxProgressRef = useRef(0)

  // Prevent duplicate toasts
  const toastShownRef = useRef(false)

  // Diagnostic state
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagnosticResults, setDiagnosticResults] = useState(null)
  const [selectedContentTypes, setSelectedContentTypes] = useState({
    assignments: true,
    pages: true,
    discussions: false,
    quizzes: false
  })

  // Check if file is IMSCC (eligible for diagnosis)
  const isImsccFile = file && (file.name.toLowerCase().endsWith('.imscc') || file.name.toLowerCase().endsWith('.zip'))

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

  // Progress polling - returns true if terminal state reached
  const pollProgress = useCallback(async (id) => {
    try {
      const response = await api.get(`/api/admin/curriculum/upload/${id}/status`)
      const data = response.data

      // Ensure progress never decreases
      const newProgress = data.progress || 0
      if (newProgress > maxProgressRef.current) {
        maxProgressRef.current = newProgress
      }
      const displayData = { ...data, progress: Math.max(newProgress, maxProgressRef.current) }

      setProgress(displayData)

      if (data.status === 'approved') {
        setPollingActive(false)
        localStorage.removeItem(localStorageKey)
        maxProgressRef.current = 0
        // Only show toast once
        if (!toastShownRef.current) {
          toastShownRef.current = true
          toast.success('Course created successfully!')
        }
        return true
      } else if (data.status === 'error') {
        setPollingActive(false)
        localStorage.removeItem(localStorageKey)
        maxProgressRef.current = 0
        // Only show toast once
        if (!toastShownRef.current) {
          toastShownRef.current = true
          toast.error(data.error || 'Processing failed')
        }
        return true
      }
      return false
    } catch (error) {
      console.error('Progress poll error:', error)
      return false
    }
  }, [localStorageKey])

  // Fetch upload history for this organization
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const response = await api.get(`/api/admin/curriculum/uploads?limit=20&organization_id=${orgId}`)
      setUploadHistory(response.data.uploads || [])
    } catch (error) {
      console.error('Failed to fetch upload history:', error)
    } finally {
      setHistoryLoading(false)
    }
  }, [orgId])

  // Fetch history on mount and restore from localStorage
  useEffect(() => {
    fetchHistory()

    const savedUploadId = localStorage.getItem(localStorageKey)
    if (savedUploadId) {
      setUploadId(savedUploadId)
      setUploadStarted(true)
      setPollingActive(true)
    }
  }, [fetchHistory, localStorageKey])

  // Start polling when uploadId is set
  useEffect(() => {
    if (!uploadId || !pollingActive) return

    const doPoll = async () => {
      const isTerminal = await pollProgress(uploadId)
      if (isTerminal) {
        fetchHistory()
      }
    }
    doPoll()

    const interval = setInterval(async () => {
      const isTerminal = await pollProgress(uploadId)
      if (isTerminal) {
        fetchHistory()
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [uploadId, pollingActive, pollProgress, fetchHistory])

  // Poll for processing uploads in history
  useEffect(() => {
    const processingUploads = uploadHistory.filter(u => u.status === 'processing')
    if (processingUploads.length === 0) return

    const pollHistoryUploads = async () => {
      let hasChanges = false
      for (const upload of processingUploads) {
        if (upload.id === uploadId) continue
        try {
          const response = await api.get(`/api/admin/curriculum/upload/${upload.id}/status`)
          const data = response.data
          if (data.status !== upload.status || data.progress !== upload.progress_percent) {
            hasChanges = true
          }
        } catch (error) {
          console.error('History poll error:', error)
        }
      }
      if (hasChanges) {
        fetchHistory()
      }
    }

    const interval = setInterval(pollHistoryUploads, 5000)
    return () => clearInterval(interval)
  }, [uploadHistory, uploadId, fetchHistory])

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
        formData.append('transformation_level', 'full')
        formData.append('preserve_structure', 'false')
        formData.append('organization_id', orgId)

        if (learningObjectives.trim()) {
          formData.append('learning_objectives', learningObjectives.trim())
        }

        if (isImsccFile && diagnosticResults) {
          formData.append('content_types', JSON.stringify(selectedContentTypes))
        }

        response = await api.post('/api/admin/curriculum/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      } else if (activeTab === 'text') {
        response = await api.post('/api/admin/curriculum/upload', {
          text: textContent,
          title: textTitle || 'Pasted Curriculum',
          transformation_level: 'full',
          preserve_structure: false,
          organization_id: orgId
        })
      }

      if (response.data.success) {
        const newUploadId = response.data.upload_id
        setUploadId(newUploadId)
        setUploadStarted(true)
        setPollingActive(true)
        setProgress({ status: 'processing', progress: 0 })
        toastShownRef.current = false  // Reset for new upload

        localStorage.setItem(localStorageKey, newUploadId)
        fetchHistory()

        toast.success('Processing started! You\'ll receive a notification when your course is ready.')
      } else {
        toast.error(response.data.error || 'Failed to start processing')
      }
    } catch (error) {
      console.error('Upload error:', error)
      toast.error(getErrorMessage(error, 'Failed to upload curriculum'))
    } finally {
      setUploading(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setTextContent('')
    setTextTitle('')
    setLearningObjectives('')
    setUploadStarted(false)
    setUploadId(null)
    setProgress(null)
    setPollingActive(false)
    setDiagnosticResults(null)
    setSelectedContentTypes({
      assignments: true,
      pages: true,
      discussions: false,
      quizzes: false
    })
    maxProgressRef.current = 0
    toastShownRef.current = false
    localStorage.removeItem(localStorageKey)
  }

  const handleDiagnose = async () => {
    if (!file || !isImsccFile) {
      toast.error('Select an IMSCC file to diagnose')
      return
    }

    setDiagnosing(true)
    setDiagnosticResults(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await api.post('/api/admin/curriculum/diagnose', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      if (response.data.success) {
        setDiagnosticResults(response.data)
        toast.success('Diagnosis complete')
      } else {
        toast.error(response.data.error || 'Diagnosis failed')
      }
    } catch (error) {
      console.error('Diagnose error:', error)
      toast.error(getErrorMessage(error, 'Failed to diagnose file'))
    } finally {
      setDiagnosing(false)
    }
  }

  // Show progress/success state after upload started
  if (uploadStarted) {
    const isComplete = progress?.status === 'approved'
    const isError = progress?.status === 'error'
    const isProcessing = !isComplete && !isError

    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center py-8">
          {/* Status Icon */}
          <div className="mb-6">
            {isComplete ? (
              <svg className="w-16 h-16 mx-auto text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : isError ? (
              <svg className="w-16 h-16 mx-auto text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : (
              <div className="w-16 h-16 mx-auto">
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-optio-purple border-t-transparent"></div>
              </div>
            )}
          </div>

          {/* Title */}
          <h3 className="text-xl font-semibold text-gray-900 mb-3">
            {isComplete ? 'Course Created Successfully!' :
             isError ? 'Processing Failed' :
             'Processing Your Curriculum'}
          </h3>

          {/* Description */}
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            {isComplete ? 'Your course is ready to edit in the Course Builder.' :
             isError ? (progress?.error || 'An error occurred during processing.') :
             'AI is analyzing your curriculum. This can take up to 5 minutes.'}
          </p>

          {/* Progress Section */}
          {isProcessing && progress && (
            <div className="max-w-md mx-auto mb-6">
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">{progress.currentStage || 'Starting...'}</span>
                  <span className="font-medium text-optio-purple">{progress.progress || 0}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-gradient-to-r from-optio-purple to-optio-pink h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${progress.progress || 0}%` }}
                  />
                </div>
                {progress.currentItem && (
                  <p className="text-sm text-gray-500 mt-2">{progress.currentItem}</p>
                )}
              </div>

              {/* Stage Indicators */}
              {progress.stages && (
                <div className="flex justify-center gap-4">
                  {Object.entries(STAGE_LABELS).map(([key, label]) => (
                    <div key={key} className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full mb-1 ${
                        progress.stages[key] ? 'bg-green-500' : 'bg-gray-300'
                      }`} />
                      <span className="text-xs text-gray-500">{label.split(' ')[0]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error Details */}
          {isError && progress?.error && (
            <div className="mb-6 max-w-lg mx-auto text-left">
              <details className="text-sm">
                <summary className="cursor-pointer text-gray-600 hover:text-gray-900 font-medium">
                  Show error details
                </summary>
                <pre className="mt-2 bg-red-50 border border-red-200 rounded p-3 text-xs text-red-800 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">
                  {progress.error}
                </pre>
              </details>
            </div>
          )}

          {/* Info for processing */}
          {isProcessing && (
            <p className="text-sm text-gray-500 mb-6">
              Feel free to continue using the site - you'll receive a notification when complete.
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-center gap-3">
            <button
              onClick={handleReset}
              className="px-5 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
            >
              Upload Another
            </button>
            {isComplete && progress?.course_id && (
              <a
                href={`/courses/${progress.course_id}/edit`}
                className="px-5 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium"
              >
                Edit Course
              </a>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Upload Curriculum</h3>
        <p className="text-sm text-gray-600 mt-1">
          Upload curriculum files to create courses for your organization. AI will create a draft course with lessons that you can edit.
        </p>
      </div>

      {/* Input Method Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('file')}
            className={`pb-3 px-1 font-medium text-sm ${
              activeTab === 'file'
                ? 'border-b-2 border-optio-purple text-optio-purple'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            File Upload
          </button>
          <button
            onClick={() => setActiveTab('text')}
            className={`pb-3 px-1 font-medium text-sm ${
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
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
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
                <svg className="w-10 h-10 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="font-medium text-gray-900">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              <div className="mt-3 flex justify-center gap-3">
                {isImsccFile && (
                  <button
                    onClick={handleDiagnose}
                    disabled={diagnosing}
                    className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50 flex items-center gap-2"
                  >
                    {diagnosing ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-700 border-t-transparent"></div>
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                        Diagnose File
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={() => { setFile(null); setDiagnosticResults(null); }}
                  className="px-3 py-1.5 text-sm text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div>
              <svg className="w-10 h-10 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent font-mono text-sm"
            />
            <p className="text-sm text-gray-500 mt-1">
              {textContent.length.toLocaleString()} characters
            </p>
          </div>
        </div>
      )}

      {/* Diagnostic Results */}
      {diagnosticResults && (
        <div className="p-5 bg-white border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-gray-900 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              IMSCC File Diagnostic Report
            </h4>
            <button
              onClick={() => setDiagnosticResults(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Course Info */}
          <div className="mb-4 pb-4 border-b border-gray-100">
            <p className="text-sm text-gray-600">
              <span className="font-medium">Course:</span> {diagnosticResults.course_title || 'Unknown'}
            </p>
            <p className="text-sm text-gray-600">
              <span className="font-medium">Total Files:</span> {diagnosticResults.total_files?.toLocaleString()}
            </p>
          </div>

          {/* Coverage Estimate */}
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-blue-900">Extraction Coverage</span>
              <span className="text-xl font-bold text-blue-700">{diagnosticResults.coverage_estimate}</span>
            </div>
            <p className="text-xs text-blue-700 mt-1">
              Percentage of content that will be available to AI
            </p>
          </div>

          {/* Content Type Selection */}
          <div className="mb-4">
            <h5 className="text-sm font-medium text-gray-700 mb-2">Select Content to Include</h5>
            <div className="grid grid-cols-2 gap-2">
              {diagnosticResults.resources && Object.entries(diagnosticResults.resources)
                .filter(([type]) => ['assignments', 'pages', 'discussions', 'quizzes'].includes(type))
                .map(([type, data]) => {
                  const isSelectable = data.extracted || data.found > 0
                  const isSelected = selectedContentTypes[type]
                  const canExtract = data.extracted

                  return (
                    <label
                      key={type}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        !isSelectable
                          ? 'bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed'
                          : isSelected
                          ? 'bg-optio-purple/10 border-optio-purple'
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected && isSelectable}
                          disabled={!isSelectable}
                          onChange={(e) => {
                            setSelectedContentTypes(prev => ({
                              ...prev,
                              [type]: e.target.checked
                            }))
                          }}
                          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple disabled:opacity-50"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium capitalize">{type}</span>
                            <span className={`text-base font-semibold ${
                              data.found > 0 ? 'text-gray-900' : 'text-gray-400'
                            }`}>
                              {data.found}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            {!isSelectable ? (
                              <span className="text-xs text-gray-400">None found</span>
                            ) : canExtract ? (
                              <span className="text-xs text-green-600">Ready to extract</span>
                            ) : (
                              <span className="text-xs text-yellow-600">Coming soon</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </label>
                  )
                })}
            </div>
          </div>

          {/* Module/Refs Summary */}
          <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">{diagnosticResults.modules_found || 0}</div>
              <div className="text-xs text-gray-500">Modules</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">{diagnosticResults.assignment_refs_found || 0}</div>
              <div className="text-xs text-gray-500">Assignments</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">{diagnosticResults.page_refs_found || 0}</div>
              <div className="text-xs text-gray-500">Pages</div>
            </div>
          </div>
        </div>
      )}

      {/* Learning Objectives */}
      <div className="p-5 bg-gray-50 rounded-lg">
        <h4 className="font-medium text-gray-900 mb-3">Learning Objectives (Optional)</h4>
        <p className="text-sm text-gray-500 mb-3">
          Enter course learning objectives, one per line. Each objective will become a Project/Quest.
        </p>
        <textarea
          value={learningObjectives}
          onChange={(e) => setLearningObjectives(e.target.value)}
          placeholder="Example:&#10;Understand the fundamentals of web development&#10;Build responsive layouts using CSS&#10;Create interactive web pages with JavaScript"
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple resize-y text-sm"
        />
        {learningObjectives.trim() && (
          <p className="text-sm text-gray-500 mt-2">
            {learningObjectives.trim().split('\n').filter(line => line.trim()).length} objective(s) will create {learningObjectives.trim().split('\n').filter(line => line.trim()).length} project(s)
          </p>
        )}
      </div>

      {/* Info Box */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">How it works</p>
            <p>
              AI will analyze your curriculum and create a draft course with lessons for your organization.
              You'll receive a notification when it's ready, then you can edit everything
              in the Course Builder before publishing.
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button
          onClick={handleReset}
          className="px-4 py-2 text-gray-700 hover:text-gray-900"
        >
          Reset
        </button>
        <button
          onClick={handleUpload}
          disabled={uploading || (activeTab === 'file' && !file) || (activeTab === 'text' && !textContent.trim())}
          className="px-5 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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

      {/* Recent Uploads Table */}
      <div className="pt-6 border-t border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold text-gray-900">Recent Uploads</h4>
          <button
            onClick={fetchHistory}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {historyLoading ? (
          <div className="text-center py-6 text-gray-500">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-optio-purple border-t-transparent mx-auto mb-2"></div>
            Loading uploads...
          </div>
        ) : uploadHistory.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <svg className="w-10 h-10 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">No uploads yet for this organization.</p>
          </div>
        ) : (
          <div className="overflow-hidden border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">File</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Started</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {uploadHistory.map((upload) => (
                  <React.Fragment key={upload.id}>
                    <tr className={upload.id === uploadId ? 'bg-purple-50' : ''}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="text-sm text-gray-900 truncate max-w-[180px]" title={upload.original_filename}>
                            {upload.original_filename || 'Text Upload'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={upload.status} />
                      </td>
                      <td className="px-4 py-3">
                        {upload.status === 'processing' ? (
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-gray-200 rounded-full h-1.5">
                              <div
                                className="bg-gradient-to-r from-optio-purple to-optio-pink h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${upload.progress_percent || 0}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">{upload.progress_percent || 0}%</span>
                          </div>
                        ) : upload.status === 'approved' ? (
                          <span className="text-xs text-green-600">Complete</span>
                        ) : upload.status === 'error' ? (
                          <button
                            onClick={() => setExpandedErrors(prev => ({ ...prev, [upload.id]: !prev[upload.id] }))}
                            className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
                          >
                            Failed
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
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {upload.status === 'approved' && upload.created_course_id && (
                            <a
                              href={`/courses/${upload.created_course_id}/edit`}
                              className="text-xs text-optio-purple hover:underline"
                            >
                              Edit
                            </a>
                          )}
                          {upload.id === uploadId && upload.status === 'processing' && (
                            <span className="text-xs text-optio-purple font-medium">Active</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* Expandable error details row */}
                    {upload.status === 'error' && expandedErrors[upload.id] && (
                      <tr className="bg-red-50">
                        <td colSpan={5} className="px-4 py-3">
                          <pre className="bg-red-100 border border-red-200 rounded p-2 text-xs text-red-900 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">
                            {upload.error_message || upload.error || 'No error details available'}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
