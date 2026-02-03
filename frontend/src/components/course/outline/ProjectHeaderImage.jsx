import React, { useState, useRef } from 'react'
import { toast } from 'react-hot-toast'
import {
  PhotoIcon,
  SparklesIcon,
  ArrowUpTrayIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import api from '../../../services/api'
import ImageCropModal from '../../ImageCropModal'

/**
 * ProjectHeaderImage - Header image component for projects/quests
 * Allows users to generate an image using AI or upload their own.
 */
const ProjectHeaderImage = ({
  imageUrl,
  onUpdate,
  onAutoSave,
  questId,
  projectTitle,
  projectDescription,
}) => {
  const [isSearching, setIsSearching] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [showCropModal, setShowCropModal] = useState(false)
  const [imageToCrop, setImageToCrop] = useState(null)
  const fileInputRef = useRef(null)

  const handleSearchPexels = async () => {
    if (!projectTitle?.trim()) {
      toast.error('Please enter a project title first')
      return
    }

    try {
      setIsSearching(true)
      const response = await api.post('/api/images/search-quest', {
        quest_title: projectTitle,
        quest_description: projectDescription || ''
      })

      if (response.data.success && response.data.image_url) {
        onUpdate(response.data.image_url)
        toast.success('Header image updated')
        // Auto-save after image is generated
        if (onAutoSave) {
          onAutoSave(response.data.image_url)
        }
      } else {
        toast.error('No suitable image found')
      }
    } catch (error) {
      console.error('Failed to search for header image:', error)
      toast.error('Failed to find header image')
    } finally {
      setIsSearching(false)
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be less than 10MB')
      return
    }

    // Create a URL for the image and show crop modal
    const imageUrlObj = URL.createObjectURL(file)
    setImageToCrop(imageUrlObj)
    setShowCropModal(true)

    // Clear the input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCropComplete = async (croppedBlob) => {
    setShowCropModal(false)

    // Clean up the object URL
    if (imageToCrop) {
      URL.revokeObjectURL(imageToCrop)
      setImageToCrop(null)
    }

    if (!questId) {
      toast.error('Please save the project first before uploading an image')
      return
    }

    try {
      setIsUploading(true)
      const formData = new FormData()
      formData.append('image', croppedBlob, 'header-image.jpg')

      const response = await api.post(`/api/courses/quests/${questId}/header-image`, formData)

      if (response.data.success && response.data.url) {
        onUpdate(response.data.url)
        toast.success('Header image uploaded')
        // Auto-save after image is uploaded
        if (onAutoSave) {
          onAutoSave(response.data.url)
        }
      } else {
        toast.error(response.data.error || 'Failed to upload image')
      }
    } catch (error) {
      console.error('Failed to upload header image:', error)
      const errorMsg = error.response?.data?.error || error.message || 'Failed to upload image'
      toast.error(errorMsg)
    } finally {
      setIsUploading(false)
    }
  }

  const handleCropCancel = () => {
    setShowCropModal(false)
    if (imageToCrop) {
      URL.revokeObjectURL(imageToCrop)
      setImageToCrop(null)
    }
  }

  const handleRemoveImage = () => {
    onUpdate(null)
    toast.success('Header image removed')
  }

  const isLoading = isSearching || isUploading

  return (
    <div className="relative group">
      {/* Header Image Display */}
      <div className="relative h-64 rounded-xl overflow-hidden bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 border border-gray-200">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="Project header"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
            <PhotoIcon className="w-10 h-10 mb-2" />
            <span className="text-sm">No header image</span>
          </div>
        )}

        {/* Overlay with buttons - visible on hover */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            onClick={handleSearchPexels}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg text-xs font-medium text-gray-900 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSearching ? (
              <div className="w-3 h-3 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
            ) : (
              <SparklesIcon className="w-3.5 h-3.5" />
            )}
            Generate
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg text-xs font-medium text-gray-900 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isUploading ? (
              <div className="w-3 h-3 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
            ) : (
              <ArrowUpTrayIcon className="w-3.5 h-3.5" />
            )}
            Upload
          </button>

          {imageUrl && (
            <button
              onClick={handleRemoveImage}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 rounded-lg text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <TrashIcon className="w-3.5 h-3.5" />
              Remove
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Image Crop Modal */}
      <ImageCropModal
        isOpen={showCropModal}
        onClose={handleCropCancel}
        imageSrc={imageToCrop}
        onCropComplete={handleCropComplete}
        aspectRatio={16 / 5}
        title="Crop Header Image"
      />
    </div>
  )
}

export default ProjectHeaderImage
