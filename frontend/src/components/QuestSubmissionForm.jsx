import React, { useState } from 'react'
import toast from 'react-hot-toast'

const QuestSubmissionForm = ({ onSubmit, isSubmitting }) => {
  const [evidenceItems, setEvidenceItems] = useState([])
  const [currentInput, setCurrentInput] = useState('')
  const [inputType, setInputType] = useState('text')
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [selectedFiles, setSelectedFiles] = useState([])

  const evidenceTypes = [
    { value: 'text', label: '📝 Text', placeholder: 'Describe your journey and what you created...' },
    { value: 'link', label: '🔗 Link', placeholder: 'Enter a URL (e.g., GitHub, YouTube, website)' },
    { value: 'image', label: '🖼️ Image', placeholder: 'Upload an image file' },
    { value: 'video', label: '🎥 Video', placeholder: 'Upload a video file or paste video link' },
    { value: 'file', label: '📎 File', placeholder: 'Upload any file (PDF, document, etc.)' }
  ]

  const handleAddEvidence = () => {
    if (inputType === 'text' || inputType === 'link') {
      if (!currentInput.trim()) {
        toast.error('Please enter some content')
        return
      }

      if (inputType === 'link' && !isValidUrl(currentInput)) {
        toast.error('Please enter a valid URL')
        return
      }

      setEvidenceItems([...evidenceItems, {
        type: inputType,
        content: currentInput,
        id: Date.now()
      }])
      setCurrentInput('')
    }
  }

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    const maxSize = 50 * 1024 * 1024 // 50MB
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime']
    
    const validFiles = []
    for (const file of files) {
      if (file.size > maxSize) {
        toast.error(`${file.name} is too large. Max size is 50MB`)
        continue
      }

      let fileType = 'file'
      if (allowedImageTypes.includes(file.type)) {
        fileType = 'image'
      } else if (allowedVideoTypes.includes(file.type)) {
        fileType = 'video'
      }

      // Create a preview URL for images
      let preview = null
      if (fileType === 'image') {
        preview = URL.createObjectURL(file)
      }

      validFiles.push({
        type: fileType,
        file: file,
        name: file.name,
        size: formatFileSize(file.size),
        preview: preview
      })
    }

    setSelectedFiles(validFiles)
  }

  const handleAddFiles = () => {
    if (selectedFiles.length === 0) {
      toast.error('Please select files first')
      return
    }

    for (const fileData of selectedFiles) {
      const evidenceItem = {
        ...fileData,
        id: Date.now() + Math.random()
      }
      setEvidenceItems(prev => [...prev, evidenceItem])
      setUploadedFiles(prev => [...prev, fileData.file])
    }

    // Clear selected files and reset file input
    setSelectedFiles([])
    const fileInput = document.getElementById('file-upload')
    if (fileInput) fileInput.value = ''
  }

  const removeEvidence = (id) => {
    setEvidenceItems(evidenceItems.filter(item => item.id !== id))
    // Clean up preview URLs for images
    const item = evidenceItems.find(item => item.id === id)
    if (item?.preview) {
      URL.revokeObjectURL(item.preview)
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const isValidUrl = (string) => {
    try {
      new URL(string)
      return true
    } catch (_) {
      return false
    }
  }

  const handleSubmit = async () => {
    if (evidenceItems.length === 0) {
      toast.error('Please add at least one piece of evidence')
      return
    }

    // Prepare submission data
    const submissionData = {
      evidence_text: '',
      evidence_files: [],
      evidence_links: [],
      evidence_items: []
    }

    // Process evidence items
    for (const item of evidenceItems) {
      if (item.type === 'text') {
        submissionData.evidence_text += (submissionData.evidence_text ? '\n\n' : '') + item.content
      } else if (item.type === 'link') {
        submissionData.evidence_links.push(item.content)
      } else if (item.file) {
        // For files, we'll need to upload them first
        // This will be handled by the parent component
        submissionData.evidence_items.push(item)
      }
    }

    // Combine links into text for now (until backend supports separate link field)
    if (submissionData.evidence_links.length > 0) {
      const linksText = '\n\nLinks:\n' + submissionData.evidence_links.join('\n')
      submissionData.evidence_text += linksText
    }

    await onSubmit(submissionData, uploadedFiles)
  }

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg">Submit Your Quest Evidence</h3>
      
      {/* Evidence Type Selector */}
      <div className="flex flex-wrap gap-2">
        {evidenceTypes.map(type => (
          <button
            key={type.value}
            onClick={() => setInputType(type.value)}
            className={`px-4 py-2 rounded-lg transition ${
              inputType === type.value 
                ? 'bg-primary text-white' 
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            {type.label}
          </button>
        ))}
      </div>

      {/* Input based on selected type */}
      <div className="space-y-2">
        {(inputType === 'text' || inputType === 'link') && (
          <div className="flex gap-2">
            {inputType === 'text' ? (
              <textarea
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                placeholder={evidenceTypes.find(t => t.value === inputType)?.placeholder}
                className="flex-1 p-3 border rounded-lg h-24 resize-none"
              />
            ) : (
              <input
                type="url"
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                placeholder={evidenceTypes.find(t => t.value === inputType)?.placeholder}
                className="flex-1 p-3 border rounded-lg"
              />
            )}
            <button
              onClick={handleAddEvidence}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
            >
              Add
            </button>
          </div>
        )}

        {(inputType === 'image' || inputType === 'video' || inputType === 'file') && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <input
                type="file"
                onChange={handleFileSelect}
                accept={
                  inputType === 'image' ? 'image/*' :
                  inputType === 'video' ? 'video/*' :
                  '*'
                }
                multiple
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <div className="space-y-2">
                  <div className="text-4xl">
                    {inputType === 'image' ? '🖼️' : inputType === 'video' ? '🎥' : '📎'}
                  </div>
                  <p className="text-gray-600">
                    Click to select {inputType === 'image' ? 'images' : inputType === 'video' ? 'videos' : 'files'}
                  </p>
                  <p className="text-sm text-gray-400">Max size: 50MB per file</p>
                </div>
              </label>
            </div>
            
            {/* Show selected files preview */}
            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Selected ({selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''})</p>
                <div className="space-y-1 max-h-32 overflow-y-auto border rounded p-2">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <span className="text-lg">
                        {file.type === 'image' ? '🖼️' : file.type === 'video' ? '🎥' : '📎'}
                      </span>
                      <span className="flex-1 truncate">{file.name}</span>
                      <span className="text-gray-500">{file.size}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleAddFiles}
                  className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                >
                  Add Selected Files
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Evidence Items List */}
      {evidenceItems.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium">Your Evidence ({evidenceItems.length} items)</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-2">
            {evidenceItems.map(item => (
              <div key={item.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl">
                  {item.type === 'text' ? '📝' :
                   item.type === 'link' ? '🔗' :
                   item.type === 'image' ? '🖼️' :
                   item.type === 'video' ? '🎥' : '📎'}
                </div>
                <div className="flex-1">
                  {item.type === 'text' && (
                    <p className="text-sm text-gray-700 line-clamp-2">{item.content}</p>
                  )}
                  {item.type === 'link' && (
                    <a href={item.content} target="_blank" rel="noopener noreferrer" 
                       className="text-sm text-blue-600 hover:underline break-all">
                      {item.content}
                    </a>
                  )}
                  {item.file && (
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.size}</p>
                      {item.preview && (
                        <img src={item.preview} alt={item.name} 
                             className="mt-2 h-20 w-auto rounded" />
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => removeEvidence(item.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={isSubmitting || evidenceItems.length === 0}
        className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Submitting...' : `Submit Quest with ${evidenceItems.length} Evidence Item${evidenceItems.length !== 1 ? 's' : ''}`}
      </button>
    </div>
  )
}

export default QuestSubmissionForm