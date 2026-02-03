import React, { useState, useRef } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'

const ImageBlockEditor = ({ block, onChange, questId }) => {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [imageUrl, setImageUrl] = useState(block.content || '')
  const [caption, setCaption] = useState(block.data?.caption || '')
  const [alt, setAlt] = useState(block.data?.alt || '')
  const fileInputRef = useRef(null)

  const handleUrlChange = (e) => {
    const url = e.target.value
    setImageUrl(url)
    updateBlock(url, caption, alt)
  }

  const handleCaptionChange = (e) => {
    const newCaption = e.target.value
    setCaption(newCaption)
    updateBlock(imageUrl, newCaption, alt)
  }

  const handleAltChange = (e) => {
    const newAlt = e.target.value
    setAlt(newAlt)
    updateBlock(imageUrl, caption, newAlt)
  }

  const updateBlock = (url, cap, altText) => {
    onChange({
      ...block,
      content: url,
      data: {
        caption: cap,
        alt: altText
      }
    })
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileUpload(files[0])
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleFileInput = (e) => {
    const files = e.target.files
    if (files.length > 0) {
      handleFileUpload(files[0])
    }
    e.target.value = ''
  }

  const handleFileUpload = async (file) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }

    // Check file size (25MB max)
    if (file.size > 25 * 1024 * 1024) {
      toast.error('File size exceeds 25MB limit')
      return
    }

    // Check allowed extensions
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp']
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !allowedExtensions.includes(extension)) {
      toast.error('Invalid file type. Allowed: jpg, jpeg, png, gif, webp')
      return
    }

    // If we have questId, upload to Supabase storage
    if (questId) {
      try {
        setIsUploading(true)
        const formData = new FormData()
        formData.append('file', file)

        const response = await api.post(
          `/api/quests/${questId}/curriculum/images`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        )

        if (response.data.url) {
          setImageUrl(response.data.url)
          updateBlock(response.data.url, caption, alt)
          toast.success('Image uploaded')
        }
      } catch (error) {
        console.error('Failed to upload image:', error)
        toast.error('Failed to upload image')
      } finally {
        setIsUploading(false)
      }
    } else {
      // Fallback to base64 if no questId (shouldn't happen in normal use)
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target.result
        setImageUrl(dataUrl)
        updateBlock(dataUrl, caption, alt)
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <div className="space-y-4">
      {/* URL Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Image URL
        </label>
        <input
          type="text"
          value={imageUrl}
          onChange={handleUrlChange}
          placeholder="https://example.com/image.jpg or drag & drop"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
        />
      </div>

      {/* Drag and Drop Zone */}
      {!imageUrl && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging
              ? 'border-optio-purple bg-purple-50'
              : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
          } ${isUploading ? 'opacity-60 pointer-events-none' : ''}`}
        >
          {isUploading ? (
            <>
              <div className="mx-auto h-12 w-12 border-4 border-optio-purple border-t-transparent rounded-full animate-spin" />
              <p className="mt-3 text-sm font-medium text-gray-900">Uploading image...</p>
            </>
          ) : (
            <>
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="mt-2 text-sm font-medium text-gray-900">
                {isDragging ? 'Drop image here' : 'Drag and drop an image here'}
              </p>
              <p className="mt-1 text-xs text-gray-500">or</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity"
              >
                Browse Files
              </button>
              <p className="mt-2 text-xs text-gray-400">Max 25MB. Supports jpg, png, gif, webp</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileInput}
            className="hidden"
            disabled={isUploading}
          />
        </div>
      )}

      {/* Image Preview */}
      {imageUrl && (
        <div className="max-w-2xl mx-auto">
          <img
            src={imageUrl}
            alt={alt || 'Preview'}
            className="w-full rounded-lg shadow-lg"
          />
          {caption && (
            <p className="mt-2 text-sm text-gray-600 text-center italic">
              {caption}
            </p>
          )}
        </div>
      )}

      {/* Alt Text */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Alt Text (for accessibility)
        </label>
        <input
          type="text"
          value={alt}
          onChange={handleAltChange}
          placeholder="Describe the image"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
        />
      </div>

      {/* Caption */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Caption (optional)
        </label>
        <input
          type="text"
          value={caption}
          onChange={handleCaptionChange}
          placeholder="Add a caption"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
        />
      </div>
    </div>
  )
}

export default ImageBlockEditor
