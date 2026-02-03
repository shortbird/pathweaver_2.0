import React, { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { XMarkIcon } from '@heroicons/react/24/outline'

// Helper function to create a cropped image from the crop data
const createCroppedImage = async (imageSrc, pixelCrop) => {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  // Set canvas size to the cropped area
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height

  // Fill with white background (JPEG doesn't support transparency)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Draw the cropped image
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  )

  // Return as blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to create blob'))
        }
      },
      'image/jpeg',
      0.9
    )
  })
}

// Helper to load an image
const createImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (error) => reject(error))
    image.crossOrigin = 'anonymous'
    image.src = url
  })

export default function ImageCropModal({
  isOpen,
  onClose,
  imageSrc,
  onCropComplete,
  aspectRatio = 16 / 9,
  title = 'Crop Image'
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [minZoom, setMinZoom] = useState(0.5)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Calculate min zoom to allow showing entire image
  const onMediaLoaded = useCallback((mediaSize) => {
    const { width, height } = mediaSize
    const imageAspect = width / height

    // Calculate the zoom level that would show the entire image
    let calculatedMinZoom
    if (imageAspect > aspectRatio) {
      // Image is wider than crop area - need to zoom out based on height
      calculatedMinZoom = aspectRatio / imageAspect
    } else {
      // Image is taller than crop area - need to zoom out based on width
      calculatedMinZoom = imageAspect / aspectRatio
    }

    // Allow zooming out to show full image, with some padding
    const newMinZoom = Math.max(0.1, calculatedMinZoom * 0.5)
    setMinZoom(newMinZoom)

    // Start at zoom level 1 or min zoom if image is smaller
    setZoom(Math.max(1, newMinZoom))
    setCrop({ x: 0, y: 0 })
  }, [aspectRatio])

  const onCropChange = useCallback((crop) => {
    setCrop(crop)
  }, [])

  const onZoomChange = useCallback((zoom) => {
    setZoom(zoom)
  }, [])

  const onCropCompleteHandler = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleSave = async () => {
    if (!croppedAreaPixels || !imageSrc) return

    try {
      setIsProcessing(true)
      const croppedBlob = await createCroppedImage(imageSrc, croppedAreaPixels)
      onCropComplete(croppedBlob)
    } catch (error) {
      console.error('Failed to crop image:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Cropper Area */}
        <div className="relative flex-1 min-h-[300px] sm:min-h-[400px] bg-gray-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            minZoom={minZoom}
            maxZoom={3}
            aspect={aspectRatio}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropCompleteHandler}
            onMediaLoaded={onMediaLoaded}
            cropShape="rect"
            showGrid={true}
            objectFit="contain"
            restrictPosition={false}
          />
        </div>

        {/* Controls */}
        <div className="p-4 border-t border-gray-200">
          {/* Zoom Slider */}
          <div className="flex items-center gap-4 mb-4">
            <span className="text-sm text-gray-600 w-12">Zoom</span>
            <input
              type="range"
              min={minZoom}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-optio-purple"
            />
            <span className="text-sm text-gray-500 w-12 text-right">{zoom.toFixed(1)}x</span>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isProcessing}
              className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 font-medium"
            >
              {isProcessing ? 'Processing...' : 'Apply Crop'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
