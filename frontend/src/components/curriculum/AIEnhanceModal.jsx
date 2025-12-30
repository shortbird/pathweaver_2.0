import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  XMarkIcon,
  SparklesIcon,
  VideoCameraIcon,
  DocumentTextIcon,
  BookOpenIcon,
  PaperClipIcon,
  LinkIcon,
} from '@heroicons/react/24/outline'

const RESOURCE_OPTIONS = [
  {
    id: 'videos',
    label: 'Videos',
    description: 'YouTube, Vimeo, or educational video suggestions',
    icon: VideoCameraIcon,
  },
  {
    id: 'articles',
    label: 'Articles',
    description: 'Blog posts, news articles, or online resources',
    icon: DocumentTextIcon,
  },
  {
    id: 'books',
    label: 'Books',
    description: 'Book recommendations for deeper learning',
    icon: BookOpenIcon,
  },
  {
    id: 'files',
    label: 'Downloadable Resources',
    description: 'Worksheets, templates, or reference materials',
    icon: PaperClipIcon,
  },
  {
    id: 'links',
    label: 'External Links',
    description: 'Websites, tools, or interactive resources',
    icon: LinkIcon,
  },
]

/**
 * Modal for AI-powered lesson enhancement
 * Allows users to input content and select resource types to suggest
 */
const AIEnhanceModal = ({
  isOpen,
  onClose,
  onSubmit,
  initialContent = '',
  lessonTitle = '',
  isLoading = false,
}) => {
  const [content, setContent] = useState(initialContent)
  const [selectedResources, setSelectedResources] = useState(['videos', 'articles'])

  const toggleResource = (resourceId) => {
    setSelectedResources(prev =>
      prev.includes(resourceId)
        ? prev.filter(id => id !== resourceId)
        : [...prev, resourceId]
    )
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!content.trim()) return

    onSubmit({
      content: content.trim(),
      lessonTitle,
      suggestResources: selectedResources,
    })
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-black/60 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-optio-purple to-optio-pink p-6 text-white">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
              <SparklesIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Enhance with AI</h2>
              <p className="text-sm text-white/80">
                Transform your content into engaging lesson steps
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Instructions */}
            <div className="p-4 bg-optio-purple/5 border border-optio-purple/20 rounded-lg">
              <p className="text-sm text-gray-700">
                AI can create lesson steps and suggest relevant videos, articles, and resources based on your content. Paste or type your lesson material below, and select what types of resources you'd like suggested.
              </p>
            </div>

            {/* Content Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Lesson Content
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste or type your lesson content here. The AI will split it into digestible steps and suggest where to add supporting resources..."
                rows={10}
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple resize-none disabled:bg-gray-50 disabled:text-gray-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Include all the information you want students to learn. The AI will organize it.
              </p>
            </div>

            {/* Resource Suggestions */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Suggest Additional Resources
              </label>
              <p className="text-sm text-gray-500 mb-4">
                Select the types of resources you'd like the AI to suggest integrating into your lesson:
              </p>

              <div className="space-y-3">
                {RESOURCE_OPTIONS.map((option) => {
                  const Icon = option.icon
                  const isSelected = selectedResources.includes(option.id)

                  return (
                    <label
                      key={option.id}
                      className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-optio-purple bg-optio-purple/5'
                          : 'border-gray-200 hover:border-gray-300'
                      } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleResource(option.id)}
                        disabled={isLoading}
                        className="sr-only"
                      />
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-optio-purple text-white' : 'bg-gray-100 text-gray-500'
                      }`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <p className={`font-medium ${isSelected ? 'text-optio-purple' : 'text-gray-900'}`}>
                          {option.label}
                        </p>
                        <p className="text-sm text-gray-500">{option.description}</p>
                      </div>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'border-optio-purple bg-optio-purple' : 'border-gray-300'
                      }`}>
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                            <path d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z" />
                          </svg>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="mx-6 mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">
              <strong>Important:</strong> AI-suggested content and resources should be thoroughly reviewed before publishing.
              Verify all recommended videos, articles, and links for accuracy, appropriateness, and alignment with your educational goals.
            </p>
          </div>

          {/* Footer */}
          <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !content.trim()}
              className="px-6 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Enhancing...
                </>
              ) : (
                <>
                  <SparklesIcon className="w-4 h-4" />
                  Enhance Content
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

export default AIEnhanceModal
