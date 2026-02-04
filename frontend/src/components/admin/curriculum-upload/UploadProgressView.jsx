import React, { useState } from 'react'
import toast from 'react-hot-toast'

// Stage labels for progress display
const STAGE_LABELS = {
  parse: 'Parse Document',
  structure: 'Detect Structure',
  align: 'Align Philosophy',
  generate: 'Generate Content'
}

/**
 * Shows upload progress, success, or error state.
 */
function UploadProgressView({ progress, onResume, onReset }) {
  const [showDebugLog, setShowDebugLog] = useState(false)

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
           'AI is analyzing your curriculum. This can take up to 5 minutes.'}
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
              onClick={onResume}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg font-medium hover:bg-yellow-700"
            >
              Resume from Stage {progress.resumeFromStage}
            </button>
          </div>
        )}

        {/* Debug Log Section */}
        {isError && progress?.error && (
          <div className="mb-8 max-w-2xl mx-auto text-left">
            <button
              onClick={() => setShowDebugLog(!showDebugLog)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-2"
            >
              <svg
                className={`w-4 h-4 transition-transform ${showDebugLog ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Show Debug Details
            </button>
            {showDebugLog && (
              <div className="bg-gray-900 rounded-lg p-4 overflow-hidden">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-gray-400 font-mono">Error Details</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(progress.error)
                      toast.success('Error copied to clipboard')
                    }}
                    className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </button>
                </div>
                <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto">
                  {progress.error}
                </pre>
              </div>
            )}
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
            onClick={onReset}
            className="px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
          >
            Upload Another
          </button>
          {isComplete ? (
            <a
              href="/courses"
              className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium"
            >
              View Courses
            </a>
          ) : (
            <a
              href="/admin/curriculum-upload"
              className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium"
            >
              Back to Uploads
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export default UploadProgressView
