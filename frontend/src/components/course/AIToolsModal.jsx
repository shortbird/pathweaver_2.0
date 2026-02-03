import React, { useState } from 'react'
import { SparklesIcon, XMarkIcon, DocumentTextIcon, ListBulletIcon, PencilSquareIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline'

/**
 * AIToolsModal - Central hub for AI-powered course editing tools
 *
 * Options:
 * - Generate Tasks: Bulk generate tasks for lessons without tasks
 * - Generate Lessons: Generate lessons for projects without lessons
 * - Generate Lesson Content: Generate content/steps for empty lessons
 * - AI Refine: Course-wide refinements using natural language
 */
const AIToolsModal = ({
  isOpen,
  onClose,
  onSelectTool,
  hasLessonsWithoutTasks = false,
  hasProjectsWithoutLessons = false,
  hasLessonsWithoutContent = false
}) => {
  if (!isOpen) return null

  const tools = [
    {
      id: 'generate-tasks',
      title: 'Generate Tasks',
      description: 'Create hands-on task suggestions for lessons that don\'t have any tasks yet.',
      icon: ListBulletIcon,
      available: hasLessonsWithoutTasks,
      unavailableReason: 'All lessons already have tasks',
      gradient: false
    },
    {
      id: 'generate-lessons',
      title: 'Generate Lessons',
      description: 'Create lesson outlines for projects that don\'t have any lessons yet.',
      icon: DocumentTextIcon,
      available: hasProjectsWithoutLessons,
      unavailableReason: 'All projects already have lessons',
      gradient: false
    },
    {
      id: 'generate-content',
      title: 'Generate Lesson Content',
      description: 'Fill in lesson steps and content for lessons that are empty.',
      icon: PencilSquareIcon,
      available: hasLessonsWithoutContent,
      unavailableReason: 'All lessons already have content',
      gradient: false
    },
    {
      id: 'ai-refine',
      title: 'AI Refine',
      description: 'Make bulk changes across the entire course using natural language.',
      icon: WrenchScrewdriverIcon,
      available: true,
      gradient: true
    }
  ]

  const handleToolClick = (toolId) => {
    onSelectTool(toolId)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-lg w-full shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-optio-purple to-optio-pink p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SparklesIcon className="w-6 h-6" />
              <h2 className="text-xl font-semibold">AI Tools</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/20 rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
          <p className="text-white/80 text-sm mt-1">
            Choose an AI-powered tool to help build your course
          </p>
        </div>

        {/* Tool Options */}
        <div className="p-4 space-y-3">
          {tools.map((tool) => {
            const Icon = tool.icon
            const isDisabled = !tool.available

            return (
              <button
                key={tool.id}
                onClick={() => !isDisabled && handleToolClick(tool.id)}
                disabled={isDisabled}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                  isDisabled
                    ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                    : tool.gradient
                    ? 'border-optio-purple/30 hover:border-optio-purple hover:bg-gradient-to-r hover:from-optio-purple/5 hover:to-optio-pink/5'
                    : 'border-gray-200 hover:border-optio-purple hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${
                    isDisabled
                      ? 'bg-gray-200 text-gray-400'
                      : tool.gradient
                      ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
                      : 'bg-optio-purple/10 text-optio-purple'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className={`font-medium ${isDisabled ? 'text-gray-400' : 'text-gray-900'}`}>
                        {tool.title}
                      </h3>
                    </div>
                    <p className={`text-sm mt-0.5 ${isDisabled ? 'text-gray-400' : 'text-gray-600'}`}>
                      {isDisabled ? tool.unavailableReason : tool.description}
                    </p>
                  </div>
                  {!isDisabled && (
                    <div className="text-gray-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-500 text-center">
            AI-generated content should be reviewed before publishing
          </p>
        </div>
      </div>
    </div>
  )
}

export default AIToolsModal
