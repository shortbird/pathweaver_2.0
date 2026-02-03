import React, { useState, useEffect, useCallback, useRef } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'

const VALID_EXTENSIONS = ['.imscc', '.zip', '.pdf', '.docx', '.doc']
const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB
const LOCALSTORAGE_KEY = 'currentCurriculumUpload'

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
  // Handle {error: {code, message, timestamp}} structure
  if (data.error?.message) return data.error.message
  // Handle {error: "string"} structure
  if (typeof data.error === 'string') return data.error
  // Handle {message: "string"} structure
  if (typeof data.message === 'string') return data.message
  return fallback
}

const CurriculumUploadPage = () => {
  // Upload state
  const [activeTab, setActiveTab] = useState('file') // 'file' or 'text'
  const [file, setFile] = useState(null)
  const [textContent, setTextContent] = useState('')
  const [textTitle, setTextTitle] = useState('')

  // Options state
  const [learningObjectives, setLearningObjectives] = useState('')
  const [courseTopic, setCourseTopic] = useState('') // For generate mode

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
  const [expandedErrors, setExpandedErrors] = useState({}) // Track which error rows are expanded
  const [selectedUpload, setSelectedUpload] = useState(null) // For detail modal

  // Track max progress to prevent regression in display
  const maxProgressRef = useRef(0)


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

      // Ensure progress never decreases (prevents visual regression)
      const newProgress = data.progress || 0
      if (newProgress > maxProgressRef.current) {
        maxProgressRef.current = newProgress
      }
      // Use max progress to prevent regression
      const displayData = { ...data, progress: Math.max(newProgress, maxProgressRef.current) }

      setProgress(displayData)

      // Check for terminal states
      if (data.status === 'approved') {
        setPollingActive(false)
        localStorage.removeItem(LOCALSTORAGE_KEY)
        maxProgressRef.current = 0 // Reset for next upload
        toast.success('Course created successfully!')
        return true // Terminal state
      } else if (data.status === 'error') {
        setPollingActive(false)
        localStorage.removeItem(LOCALSTORAGE_KEY)
        maxProgressRef.current = 0 // Reset for next upload
        toast.error(data.error || 'Processing failed')
        return true // Terminal state
      }
      return false
    } catch (error) {
      console.error('Progress poll error:', error)
      return false
    }
  }, [])

  // Fetch upload history
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const response = await api.get('/api/admin/curriculum/uploads?limit=20')
      setUploadHistory(response.data.uploads || [])
    } catch (error) {
      console.error('Failed to fetch upload history:', error)
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  // Fetch history on mount and restore from localStorage
  useEffect(() => {
    fetchHistory()

    // Restore active upload from localStorage
    const savedUploadId = localStorage.getItem(LOCALSTORAGE_KEY)
    if (savedUploadId) {
      setUploadId(savedUploadId)
      setUploadStarted(true)
      setPollingActive(true)
    }
  }, [fetchHistory])

  // Start polling when uploadId is set
  useEffect(() => {
    if (!uploadId || !pollingActive) return

    // Initial poll
    const doPoll = async () => {
      const isTerminal = await pollProgress(uploadId)
      if (isTerminal) {
        fetchHistory() // Refresh history on terminal state
      }
    }
    doPoll()

    // Poll every 2 seconds
    const interval = setInterval(async () => {
      const isTerminal = await pollProgress(uploadId)
      if (isTerminal) {
        fetchHistory() // Refresh history on terminal state
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
        // Skip if this is the current upload (already being polled)
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
      // Refresh history if any uploads changed status
      if (hasChanges) {
        fetchHistory()
      }
    }

    const interval = setInterval(pollHistoryUploads, 5000) // Poll every 5 seconds
    return () => clearInterval(interval)
  }, [uploadHistory, uploadId, fetchHistory])

  // Resume a failed upload
  const handleResume = async () => {
    if (!uploadId || !progress?.canResume) return

    try {
      const response = await api.post(`/api/admin/curriculum/upload/${uploadId}/resume`, {
        transformation_level: transformationLevel,
        preserve_structure: preserveStructure
      })

      if (response.data.success) {
        setPollingActive(true)
        toast.success(`Resuming from stage ${response.data.resumeFromStage}`)
      }
    } catch (error) {
      console.error('Resume error:', error)
      toast.error(getErrorMessage(error, 'Failed to resume'))
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

    if (activeTab === 'generate' && !courseTopic.trim()) {
      toast.error('Please enter a course topic')
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

        // Include learning objectives if provided (one per line)
        if (learningObjectives.trim()) {
          formData.append('learning_objectives', learningObjectives.trim())
        }

        // Include selected content types for IMSCC files
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
          preserve_structure: false
        })
      } else if (activeTab === 'generate') {
        // Generate from prompt mode - no source curriculum
        response = await api.post('/api/admin/curriculum/generate', {
          topic: courseTopic.trim(),
          learning_objectives: learningObjectives.trim() || null
        })
      }

      if (response.data.success) {
        const newUploadId = response.data.upload_id
        setUploadId(newUploadId)
        setUploadStarted(true)
        setPollingActive(true) // Start polling for progress
        setProgress({ status: 'processing', progress: 0 })

        // Save to localStorage for page refresh recovery
        localStorage.setItem(LOCALSTORAGE_KEY, newUploadId)

        // Refresh history to show new upload
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
    setCourseTopic('')
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
    // Reset progress tracking
    maxProgressRef.current = 0
    // Clear localStorage
    localStorage.removeItem(LOCALSTORAGE_KEY)
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

  // Debug log state
  const [showDebugLog, setShowDebugLog] = useState(false)

  // Show progress/success state after upload started
  if (uploadStarted) {
    const isComplete = progress?.status === 'approved'
    const isError = progress?.status === 'error'
    const isProcessing = !isComplete && !isError

    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-12">
          {/* Status Icon */}
          <div className="mb-6">
            {isComplete ? (
              <svg className="w-20 h-20 mx-auto text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : isError ? (
              <svg className="w-20 h-20 mx-auto text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : (
              <div className="w-20 h-20 mx-auto">
                <div className="animate-spin rounded-full h-20 w-20 border-4 border-optio-purple border-t-transparent"></div>
              </div>
            )}
          </div>

          {/* Title */}
          <h2 className="text-2xl font-semibold text-gray-900 mb-3">
            {isComplete ? 'Course Created Successfully!' :
             isError ? 'Processing Failed' :
             'Processing Your Curriculum'}
          </h2>

          {/* Description */}
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            {isComplete ? 'Your course is ready to edit in the Course Builder.' :
             isError ? (progress?.error || 'An error occurred during processing.') :
             'AI is analyzing your curriculum. This can take up to 5 minutes.'}
          </p>

          {/* Progress Section */}
          {isProcessing && progress && (
            <div className="max-w-md mx-auto mb-8">
              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">{progress.currentStage || 'Starting...'}</span>
                  <span className="font-medium text-optio-purple">{progress.progress || 0}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-gradient-to-r from-optio-purple to-optio-pink h-3 rounded-full transition-all duration-500"
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
                      <div className={`w-4 h-4 rounded-full mb-1 ${
                        progress.stages[key] ? 'bg-green-500' : 'bg-gray-300'
                      }`} />
                      <span className="text-xs text-gray-500">{label.split(' ')[0]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error with Resume Option */}
          {isError && progress?.canResume && (
            <div className="mb-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg max-w-md mx-auto">
              <p className="text-sm text-yellow-800 mb-3">
                Processing can be resumed from the last checkpoint.
              </p>
              <button
                onClick={handleResume}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg font-medium hover:bg-yellow-700"
              >
                Resume from Stage {progress.resumeFromStage}
              </button>
            </div>
          )}

          {/* Debug Log Section */}
          {isError && progress?.error && (
            <div className="mb-8 max-w-2xl mx-auto text-left">
              <button
                onClick={() => setShowDebugLog(!showDebugLog)}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-2"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${showDebugLog ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Show Debug Details
              </button>
              {showDebugLog && (
                <div className="bg-gray-900 rounded-lg p-4 overflow-hidden">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-400 font-mono">Error Details</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(progress.error)
                        toast.success('Error copied to clipboard')
                      }}
                      className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy
                    </button>
                  </div>
                  <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto">
                    {progress.error}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Info for processing */}
          {isProcessing && (
            <p className="text-sm text-gray-500 mb-8">
              Feel free to continue using the site - you'll receive a notification when complete.
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-center gap-4">
            <button
              onClick={handleReset}
              className="px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
            >
              Upload Another
            </button>
            {isComplete ? (
              <a
                href="/courses"
                className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium"
              >
                View Courses
              </a>
            ) : (
              <a
                href="/admin/curriculum-upload"
                className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium"
              >
                Back to Uploads
              </a>
            )}
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
          <button
            onClick={() => setActiveTab('generate')}
            className={`pb-3 px-1 font-medium ${
              activeTab === 'generate'
                ? 'border-b-2 border-optio-purple text-optio-purple'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Generate from Prompt
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
              <div className="mt-3 flex justify-center gap-3">
                {isImsccFile && (
                  <button
                    onClick={handleDiagnose}
                    disabled={diagnosing}
                    className="px-4 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50 flex items-center gap-2"
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
                  className="px-4 py-1.5 text-sm text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
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

      {/* Generate from Prompt Tab */}
      {activeTab === 'generate' && (
        <div className="space-y-6">
          {/* Plan Mode - Primary Option */}
          <div className="p-6 bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 border border-optio-purple/20 rounded-lg text-center">
            <svg className="w-16 h-16 mx-auto text-optio-purple mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Course Plan Mode</h3>
            <p className="text-gray-600 mb-6 max-w-lg mx-auto">
              Design courses through conversation with AI. Describe what you want to create,
              refine the outline through natural dialogue, then generate the full course.
            </p>
            <a
              href="/course-plan"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Start Plan Mode
            </a>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-white border border-gray-200 rounded-lg">
              <div className="w-10 h-10 mx-auto mb-2 bg-purple-100 text-optio-purple rounded-full flex items-center justify-center">
                <span className="font-bold">1</span>
              </div>
              <h4 className="font-medium text-gray-900 text-sm">Describe Your Course</h4>
              <p className="text-xs text-gray-500 mt-1">Tell AI about the student and what they want to learn</p>
            </div>
            <div className="p-4 bg-white border border-gray-200 rounded-lg">
              <div className="w-10 h-10 mx-auto mb-2 bg-purple-100 text-optio-purple rounded-full flex items-center justify-center">
                <span className="font-bold">2</span>
              </div>
              <h4 className="font-medium text-gray-900 text-sm">Refine Through Chat</h4>
              <p className="text-xs text-gray-500 mt-1">Iterate on the outline until it is perfect</p>
            </div>
            <div className="p-4 bg-white border border-gray-200 rounded-lg">
              <div className="w-10 h-10 mx-auto mb-2 bg-purple-100 text-optio-purple rounded-full flex items-center justify-center">
                <span className="font-bold">3</span>
              </div>
              <h4 className="font-medium text-gray-900 text-sm">Approve & Generate</h4>
              <p className="text-xs text-gray-500 mt-1">Create the full course with lessons and tasks</p>
            </div>
          </div>

          {/* Legacy wizard link */}
          <div className="text-center border-t border-gray-200 pt-6">
            <p className="text-sm text-gray-500 mb-2">Or use the classic wizard:</p>
            <div className="flex items-center justify-center gap-4">
              <a
                href="/admin/generate-course"
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Course Wizard
              </a>
              <a
                href="/admin/course-generation-queue"
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                View Queue
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Diagnostic Results */}
      {diagnosticResults && (
        <div className="mt-6 p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              IMSCC File Diagnostic Report
            </h3>
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
          <div className="mb-4 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-blue-900">Extraction Coverage</span>
              <span className="text-2xl font-bold text-blue-700">{diagnosticResults.coverage_estimate}</span>
            </div>
            <p className="text-xs text-blue-700 mt-1">
              Percentage of content that will be available to AI
            </p>
          </div>

          {/* Content Type Selection */}
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Select Content to Include</h4>
            <p className="text-xs text-gray-500 mb-3">Check the content types you want the AI to process</p>
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
                            <span className={`text-lg font-semibold ${
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
            {/* Selected count */}
            <div className="mt-3 text-xs text-gray-500">
              {Object.entries(selectedContentTypes).filter(([type, selected]) =>
                selected && diagnosticResults.resources?.[type]?.found > 0
              ).length} content type(s) selected for processing
            </div>
          </div>

          {/* Module/Refs Summary */}
          <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-center">
              <div className="text-xl font-semibold text-gray-900">{diagnosticResults.modules_found || 0}</div>
              <div className="text-xs text-gray-500">Modules</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-semibold text-gray-900">{diagnosticResults.assignment_refs_found || 0}</div>
              <div className="text-xs text-gray-500">Assignments</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-semibold text-gray-900">{diagnosticResults.page_refs_found || 0}</div>
              <div className="text-xs text-gray-500">Pages</div>
            </div>
          </div>

          {/* Sample Files */}
          {diagnosticResults.file_sample && diagnosticResults.file_sample.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-gray-600 hover:text-gray-900 font-medium">
                View sample files ({diagnosticResults.file_sample.length} of {diagnosticResults.total_files})
              </summary>
              <div className="mt-2 max-h-40 overflow-y-auto bg-gray-50 rounded p-2">
                {diagnosticResults.file_sample.map((file, i) => (
                  <div key={i} className="text-xs text-gray-600 font-mono truncate py-0.5">
                    {file}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Learning Objectives (shown for file/text uploads) */}
      {(activeTab === 'file' || activeTab === 'text') && (
        <div className="mt-8 p-6 bg-gray-50 rounded-lg">
          <h3 className="font-medium text-gray-900 mb-4">Learning Objectives (Optional)</h3>
          <p className="text-sm text-gray-500 mb-3">
            Enter course learning objectives, one per line. Each objective will become a Project/Quest.
            If left blank, projects will be created from the content structure.
          </p>
          <textarea
            value={learningObjectives}
            onChange={(e) => setLearningObjectives(e.target.value)}
            placeholder="Example:&#10;Understand the fundamentals of web development&#10;Build responsive layouts using CSS&#10;Create interactive web pages with JavaScript"
            rows={5}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple resize-y"
          />
          {learningObjectives.trim() && (
            <p className="text-sm text-gray-500 mt-2">
              {learningObjectives.trim().split('\n').filter(line => line.trim()).length} objective(s) will create {learningObjectives.trim().split('\n').filter(line => line.trim()).length} project(s)
            </p>
          )}
        </div>
      )}

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
          disabled={uploading || (activeTab === 'file' && !file) || (activeTab === 'text' && !textContent.trim()) || (activeTab === 'generate' && !courseTopic.trim())}
          className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {uploading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              Starting...
            </>
          ) : activeTab === 'generate' ? (
            'Generate Course'
          ) : (
            'Process Curriculum'
          )}
        </button>
      </div>

      {/* Recent Uploads Table */}
      <div className="mt-10 pt-8 border-t border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Recent Uploads</h3>
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
          <div className="text-center py-8 text-gray-500">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-optio-purple border-t-transparent mx-auto mb-2"></div>
            Loading uploads...
          </div>
        ) : uploadHistory.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            No uploads yet. Upload your first curriculum above.
          </div>
        ) : (
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
                      className={`${upload.id === uploadId ? 'bg-purple-50' : ''} cursor-pointer hover:bg-gray-50`}
                      onClick={() => setSelectedUpload(upload)}
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
                            onClick={() => setExpandedErrors(prev => ({ ...prev, [upload.id]: !prev[upload.id] }))}
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
                              onClick={async () => {
                                try {
                                  await api.post(`/api/admin/curriculum/upload/${upload.id}/resume`, {})
                                  toast.success('Resuming upload...')
                                  fetchHistory()
                                } catch (err) {
                                  toast.error('Failed to resume')
                                }
                              }}
                              className="text-xs text-yellow-600 hover:underline"
                            >
                              Resume
                            </button>
                          )}
                          {upload.status === 'processing' && (
                            <button
                              onClick={async () => {
                                if (!window.confirm('Cancel this upload? You may be able to resume later.')) return
                                try {
                                  await api.delete(`/api/admin/curriculum/upload/${upload.id}`)
                                  toast.success('Upload cancelled')
                                  if (upload.id === uploadId) {
                                    setPollingActive(false)
                                    setUploadId(null)
                                    setUploadStarted(false)
                                    localStorage.removeItem(LOCALSTORAGE_KEY)
                                  }
                                  fetchHistory()
                                } catch (err) {
                                  toast.error('Failed to cancel')
                                }
                              }}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Cancel
                            </button>
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
        )}
      </div>

      {/* Upload Detail Modal */}
      {selectedUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setSelectedUpload(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Upload Details</h3>
              <button
                onClick={() => setSelectedUpload(null)}
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
                <p className="text-sm text-gray-900 mt-1">{selectedUpload.original_filename || 'Text Upload'}</p>
              </div>

              {/* Status */}
              <div className="mb-4">
                <label className="text-xs font-medium text-gray-500 uppercase">Status</label>
                <div className="mt-1">
                  <StatusBadge status={selectedUpload.status} />
                </div>
              </div>

              {/* Progress */}
              {selectedUpload.status === 'processing' && (
                <div className="mb-4">
                  <label className="text-xs font-medium text-gray-500 uppercase">Progress</label>
                  <div className="mt-2">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">{selectedUpload.current_stage_name || 'Processing...'}</span>
                      <span className="font-medium text-optio-purple">{selectedUpload.progress_percent || 0}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-optio-purple to-optio-pink h-2 rounded-full transition-all duration-300"
                        style={{ width: `${selectedUpload.progress_percent || 0}%` }}
                      />
                    </div>
                    {selectedUpload.current_item && (
                      <p className="text-xs text-gray-500 mt-2">{selectedUpload.current_item}</p>
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
                    const isCompleted = selectedUpload.current_stage >= stageNum ||
                      (selectedUpload[`stage_${stageNum}_completed_at`])
                    const isCurrent = selectedUpload.current_stage_name?.toLowerCase().includes(key)

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
              {selectedUpload.status === 'error' && (
                <div className="mb-4">
                  <label className="text-xs font-medium text-gray-500 uppercase">Error</label>
                  <pre className="mt-2 bg-red-50 border border-red-200 rounded p-3 text-xs text-red-800 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">
                    {selectedUpload.error_message || selectedUpload.error || 'Unknown error'}
                  </pre>
                </div>
              )}

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Started</label>
                  <p className="text-sm text-gray-900 mt-1">
                    {selectedUpload.uploaded_at ? new Date(selectedUpload.uploaded_at).toLocaleString() : '-'}
                  </p>
                </div>
                {selectedUpload.completed_at && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase">Completed</label>
                    <p className="text-sm text-gray-900 mt-1">
                      {new Date(selectedUpload.completed_at).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>

              {/* Resume Info */}
              {selectedUpload.can_resume && selectedUpload.status === 'error' && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    This upload can be resumed from stage {selectedUpload.resume_from_stage || selectedUpload.current_stage}.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              {selectedUpload.status === 'error' && selectedUpload.can_resume && (
                <button
                  onClick={async () => {
                    try {
                      await api.post(`/api/admin/curriculum/upload/${selectedUpload.id}/resume`, {})
                      toast.success('Resuming upload...')
                      setSelectedUpload(null)
                      fetchHistory()
                    } catch (err) {
                      toast.error('Failed to resume')
                    }
                  }}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg font-medium hover:bg-yellow-700"
                >
                  Resume
                </button>
              )}
              <button
                onClick={() => setSelectedUpload(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CurriculumUploadPage
