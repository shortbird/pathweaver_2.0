import React, { useState, useEffect, useCallback } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'

const VALID_EXTENSIONS = ['.imscc', '.zip', '.pdf', '.docx', '.doc']
const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

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
  const [transformationLevel, setTransformationLevel] = useState('moderate')
  const [preserveStructure, setPreserveStructure] = useState(true)
  const [learningObjectives, setLearningObjectives] = useState('')

  // Processing state
  const [uploading, setUploading] = useState(false)
  const [uploadStarted, setUploadStarted] = useState(false)
  const [uploadId, setUploadId] = useState(null)
  const [dragActive, setDragActive] = useState(false)

  // Progress tracking state
  const [progress, setProgress] = useState(null)
  const [pollingActive, setPollingActive] = useState(false)


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

  // Progress polling
  const pollProgress = useCallback(async (id) => {
    try {
      const response = await api.get(`/api/admin/curriculum/upload/${id}/status`)
      const data = response.data

      setProgress(data)

      // Check for terminal states
      if (data.status === 'approved') {
        setPollingActive(false)
        toast.success('Course created successfully!')
      } else if (data.status === 'error') {
        setPollingActive(false)
        toast.error(data.error || 'Processing failed')
      }
    } catch (error) {
      console.error('Progress poll error:', error)
    }
  }, [])

  // Start polling when uploadId is set
  useEffect(() => {
    if (!uploadId || !pollingActive) return

    // Initial poll
    pollProgress(uploadId)

    // Poll every 2 seconds
    const interval = setInterval(() => {
      pollProgress(uploadId)
    }, 2000)

    return () => clearInterval(interval)
  }, [uploadId, pollingActive, pollProgress])

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

    setUploading(true)

    try {
      let response

      if (activeTab === 'file') {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('transformation_level', transformationLevel)
        formData.append('preserve_structure', preserveStructure.toString())

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
      } else {
        response = await api.post('/api/admin/curriculum/upload', {
          text: textContent,
          title: textTitle || 'Pasted Curriculum',
          transformation_level: transformationLevel,
          preserve_structure: preserveStructure
        })
      }

      if (response.data.success) {
        setUploadId(response.data.upload_id)
        setUploadStarted(true)
        setPollingActive(true) // Start polling for progress
        setProgress({ status: 'processing', progress: 0 })

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
    setUploadStarted(false)
    setUploadId(null)
    setProgress(null)
    setPollingActive(false)
    setShowReviewModal(false)
    setStructureData(null)
    setStructureEdits({})
    setDiagnosticResults(null)
    setSelectedContentTypes({
      assignments: true,
      pages: true,
      discussions: false,
      quizzes: false
    })
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
             'AI is analyzing your curriculum. This usually takes 1-3 minutes.'}
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
                href="/admin/courses"
                className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium"
              >
                View Courses
              </a>
            ) : (
              <a
                href="/admin"
                className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium"
              >
                Go to Admin Panel
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

          {/* Learning Objectives */}
          <div className="pt-4 border-t border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Learning Objectives (Optional)
            </label>
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
