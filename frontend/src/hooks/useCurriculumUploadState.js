import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'

const VALID_EXTENSIONS = ['.imscc', '.zip', '.pdf', '.docx', '.doc']
const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB
const LOCALSTORAGE_KEY = 'currentCurriculumUpload'

// Helper to extract error message from API responses
const getErrorMessage = (error, fallback = 'An error occurred') => {
  const data = error?.response?.data
  if (!data) return fallback
  if (data.error?.message) return data.error.message
  if (typeof data.error === 'string') return data.error
  if (typeof data.message === 'string') return data.message
  return fallback
}

/**
 * Custom hook managing all state and handlers for curriculum upload.
 */
export function useCurriculumUploadState() {
  // Upload state
  const [activeTab, setActiveTab] = useState('file') // 'file' or 'text'
  const [file, setFile] = useState(null)
  const [textContent, setTextContent] = useState('')
  const [textTitle, setTextTitle] = useState('')

  // Options state
  const [learningObjectives, setLearningObjectives] = useState('')
  const [courseTopic, setCourseTopic] = useState('')

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
  const [selectedUpload, setSelectedUpload] = useState(null)

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

  // Drag handlers
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

      const newProgress = data.progress || 0
      if (newProgress > maxProgressRef.current) {
        maxProgressRef.current = newProgress
      }
      const displayData = { ...data, progress: Math.max(newProgress, maxProgressRef.current) }

      setProgress(displayData)

      if (data.status === 'approved') {
        setPollingActive(false)
        localStorage.removeItem(LOCALSTORAGE_KEY)
        maxProgressRef.current = 0
        toast.success('Course created successfully!')
        return true
      } else if (data.status === 'error') {
        setPollingActive(false)
        localStorage.removeItem(LOCALSTORAGE_KEY)
        maxProgressRef.current = 0
        toast.error(data.error || 'Processing failed')
        return true
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

  // Resume a failed upload
  const handleResume = async () => {
    if (!uploadId || !progress?.canResume) return

    try {
      const response = await api.post(`/api/admin/curriculum/upload/${uploadId}/resume`, {
        transformation_level: 'full',
        preserve_structure: false
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

  // Main upload handler
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
          preserve_structure: false
        })
      } else if (activeTab === 'generate') {
        response = await api.post('/api/admin/curriculum/generate', {
          topic: courseTopic.trim(),
          learning_objectives: learningObjectives.trim() || null
        })
      }

      if (response.data.success) {
        const newUploadId = response.data.upload_id
        setUploadId(newUploadId)
        setUploadStarted(true)
        setPollingActive(true)
        setProgress({ status: 'processing', progress: 0 })

        localStorage.setItem(LOCALSTORAGE_KEY, newUploadId)
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

  // Reset state
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
    maxProgressRef.current = 0
    localStorage.removeItem(LOCALSTORAGE_KEY)
  }

  // Diagnose IMSCC file
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

  // Handle cancel from history table
  const handleCancelUpload = (upload) => {
    if (upload.id === uploadId) {
      setPollingActive(false)
      setUploadId(null)
      setUploadStarted(false)
      localStorage.removeItem(LOCALSTORAGE_KEY)
    }
  }

  return {
    // Tab state
    activeTab,
    setActiveTab,

    // File upload state
    file,
    setFile,
    textContent,
    setTextContent,
    textTitle,
    setTextTitle,
    dragActive,
    isImsccFile,

    // Options
    learningObjectives,
    setLearningObjectives,
    courseTopic,
    setCourseTopic,

    // Processing state
    uploading,
    uploadStarted,
    uploadId,
    progress,

    // History state
    uploadHistory,
    historyLoading,
    selectedUpload,
    setSelectedUpload,

    // Diagnostic state
    diagnosing,
    diagnosticResults,
    setDiagnosticResults,
    selectedContentTypes,
    setSelectedContentTypes,

    // Handlers
    handleDrag,
    handleDrop,
    handleFileInputChange,
    handleUpload,
    handleReset,
    handleResume,
    handleDiagnose,
    fetchHistory,
    handleCancelUpload,
  }
}

export default useCurriculumUploadState
