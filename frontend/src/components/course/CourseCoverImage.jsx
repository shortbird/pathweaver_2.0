import React, { useState, useRef } from 'react'
import { toast } from 'react-hot-toast'
import {
  PhotoIcon,
  SparklesIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import ImageCropModal from '../ImageCropModal'

/**
 * Cover image component with Pexels search and upload functionality.
 * Allows users to either generate a cover image using AI or upload their own.
 */
const CourseCoverImage = ({
  coverUrl,
  onUpdate,
  courseId,
  courseTitle,
  courseDescription,
  isSaving
}) => {
  const [isSearching, setIsSearching] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [showCropModal, setShowCropModal] = useState(false)
  const [imageToCrop, setImageToCrop] = useState(null)
  const fileInputRef = useRef(null)

  const handleSearchPexels = async () => {
    if (!courseTitle?.trim()) {
      toast.error('Please enter a course title first')
      return
    }

    try {
      setIsSearching(true)
      const response = await api.post('/api/images/search-quest', {
        quest_title: courseTitle,
        quest_description: courseDescription || ''
      })

      if (response.data.success && response.data.image_url) {
        onUpdate(response.data.image_url)
        toast.success('Cover image updated')
      } else {
        toast.error('No suitable image found')
      }
    } catch (error) {
      console.error('Failed to search for cover image:', error)
      toast.error('Failed to find cover image')
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
    const imageUrl = URL.createObjectURL(file)
    setImageToCrop(imageUrl)
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

    try {
      setIsUploading(true)
      const formData = new FormData()
      formData.append('image', croppedBlob, 'cover-image.jpg')

      const response = await api.post(`/api/courses/${courseId}/cover-image`, formData)

      if (response.data.success && response.data.url) {
        onUpdate(response.data.url)
        toast.success('Cover image uploaded')
      } else {
        toast.error(response.data.error || 'Failed to upload image')
      }
    } catch (error) {
      console.error('Failed to upload cover image:', error)
      const errorMsg = error.response?.data?.error || error.message || 'Failed to upload image'
      console.error('Server error:', errorMsg)
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

  const isLoading = isSearching || isUploading || isSaving

  return (
    <div className="relative group">
      {/* Cover Image Display */}
      <div className="relative h-64 rounded-xl overflow-hidden bg-gradient-to-r from-optio-purple/20 to-optio-pink/20">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt="Course cover"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <PhotoIcon className="w-16 h-16 text-gray-300" />
          </div>
        )}

        {/* Overlay with buttons */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
          <button
            onClick={handleSearchPexels}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg text-sm font-medium text-gray-900 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSearching ? (
              <div className="w-4 h-4 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
            ) : (
              <SparklesIcon className="w-4 h-4" />
            )}
            Generate Cover
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg text-sm font-medium text-gray-900 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isUploading ? (
              <div className="w-4 h-4 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
            ) : (
              <ArrowUpTrayIcon className="w-4 h-4" />
            )}
            Upload
          </button>
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
        aspectRatio={16 / 9}
        title="Crop Cover Image"
      />
    </div>
  )
}

export default CourseCoverImage
