/**
 * Extracted from admin/CourseGeneratorWizard.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import React, { useState, useEffect, useCallback } from 'react'

const GenerationModeModal = ({
  isOpen,
  onClose,
  onQueueGeneration,
  onManualGeneration,
  courseTitle,
  projectCount,
  loading
}) => {
  const [autoPublish, setAutoPublish] = useState(false)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
        <div className="p-6 border-b">
          <h3 className="text-xl font-semibold text-gray-900">Course Structure Approved</h3>
          <p className="text-gray-600 mt-1">
            "{courseTitle}" with {projectCount} projects is ready for content generation.
          </p>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Choose how you want to generate lessons and tasks:
          </p>

          <div className="grid gap-4">
            {/* Queue Option */}
            <button
              onClick={() => onQueueGeneration(autoPublish)}
              disabled={loading}
              className="p-4 border-2 border-optio-purple rounded-lg text-left hover:bg-optio-purple/5 transition-colors disabled:opacity-50"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-gray-900">Generate & Queue</h4>
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">Recommended</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Queue for background processing. You can monitor progress in the queue dashboard
                    and create more courses while this one generates.
                  </p>
                </div>
              </div>
            </button>

            {/* Manual Option */}
            <button
              onClick={onManualGeneration}
              disabled={loading}
              className="p-4 border border-gray-200 rounded-lg text-left hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">Generate Manually</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    Continue with the step-by-step wizard. Review and edit lessons
                    and tasks at each stage before publishing.
                  </p>
                </div>
              </div>
            </button>
          </div>

          {/* Auto-publish checkbox */}
          <label className="flex items-center gap-2 mt-4 pt-4 border-t cursor-pointer">
            <input
              type="checkbox"
              checked={autoPublish}
              onChange={(e) => setAutoPublish(e.target.checked)}
              className="w-4 h-4 text-optio-purple rounded border-gray-300 focus:ring-optio-purple"
            />
            <span className="text-sm text-gray-600">
              Auto-publish when generation completes
            </span>
          </label>
        </div>

        <div className="p-4 bg-gray-50 border-t rounded-b-xl">
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// MAIN WIZARD COMPONENT
// =============================================================================

export default GenerationModeModal
