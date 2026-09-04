/**
 * Extracted from admin/CourseGeneratorWizard.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import React, { useState, useEffect, useCallback } from 'react'

const Stage1Outline = ({
  topic,
  setTopic,
  alternatives,
  selectedOutline,
  setSelectedOutline,
  onGenerate,
  onRegenerate,
  onNext,
  loading,
  regenerating
}) => {
  const [editedOutline, setEditedOutline] = useState(null)

  useEffect(() => {
    if (selectedOutline) {
      setEditedOutline({ ...selectedOutline })
    }
  }, [selectedOutline])

  const handleSelectAlternative = (alt) => {
    setSelectedOutline(alt)
    setEditedOutline({ ...alt })
  }

  const handleTitleChange = (value) => {
    setEditedOutline(prev => ({ ...prev, title: value }))
  }

  const handleDescriptionChange = (value) => {
    setEditedOutline(prev => ({ ...prev, description: value }))
  }

  const handleProjectTitleChange = (index, value) => {
    setEditedOutline(prev => ({
      ...prev,
      projects: prev.projects.map((p, i) =>
        i === index ? { ...p, title: value } : p
      )
    }))
  }

  const handleProjectDescriptionChange = (index, value) => {
    setEditedOutline(prev => ({
      ...prev,
      projects: prev.projects.map((p, i) =>
        i === index ? { ...p, description: value } : p
      )
    }))
  }

  return (
    <div className="space-y-6">
      {/* Topic Input */}
      {!alternatives && (
        <div className="max-w-2xl mx-auto">
          <div className="p-6 bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 border border-optio-purple/20 rounded-lg mb-6">
            <h3 className="font-medium text-gray-900 mb-2">Create a Hands-On Course</h3>
            <p className="text-sm text-gray-600">
              Enter a topic and we'll generate action-oriented course ideas. Think about what students will
              <strong> create, build, or make</strong> - not just what they'll learn about.
            </p>
          </div>

          <label className="block text-sm font-medium text-gray-700 mb-2">
            Course Topic
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., Board Games, Cooking, Electronics, Woodworking..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple text-lg"
            disabled={loading}
          />
          <p className="text-sm text-gray-500 mt-2">
            Keep it simple - we'll transform it into an action-oriented course title
          </p>

          <button
            onClick={onGenerate}
            disabled={!topic.trim() || loading}
            className="mt-6 w-full py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                Generating Course Ideas...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate Course Ideas
              </>
            )}
          </button>
        </div>
      )}

      {/* Alternatives Selection */}
      {alternatives && !selectedOutline && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Choose a Course Direction</h3>
            <button
              onClick={onRegenerate}
              disabled={regenerating}
              className="text-optio-purple hover:underline text-sm flex items-center gap-1"
            >
              {regenerating ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-optio-purple border-t-transparent" />
                  Regenerating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Generate New Options
                </>
              )}
            </button>
          </div>

          <div className="grid gap-4">
            {alternatives.map((alt, index) => (
              <div
                key={index}
                onClick={() => handleSelectAlternative(alt)}
                className="p-6 border border-gray-200 rounded-lg cursor-pointer hover:border-optio-purple hover:shadow-md transition-all"
              >
                <h4 className="font-semibold text-gray-900 text-lg mb-2">{alt.title}</h4>
                <p className="text-gray-600 text-sm mb-4">{alt.description}</p>

                <div className="text-sm text-gray-500 mb-3">
                  {alt.projects?.length || 0} Projects:
                </div>
                <div className="space-y-2">
                  {alt.projects?.map((proj, pIndex) => (
                    <div key={pIndex} className="flex items-start gap-2 text-sm">
                      <span className="text-optio-purple font-medium">{pIndex + 1}.</span>
                      <span className="text-gray-700">{proj.title}</span>
                    </div>
                  ))}
                </div>

                {alt.categories && (
                  <div className="flex gap-2 mt-4">
                    {alt.categories.map((cat, cIndex) => (
                      <span key={cIndex} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Selected Outline */}
      {editedOutline && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Edit Course Outline</h3>
            <button
              onClick={() => {
                setSelectedOutline(null)
                setEditedOutline(null)
              }}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              Choose Different Option
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Course Title</label>
            <input
              type="text"
              value={editedOutline.title || ''}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Course Description</label>
            <textarea
              value={editedOutline.description || ''}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Projects</label>
            <div className="space-y-4">
              {editedOutline.projects?.map((proj, index) => (
                <div key={index} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 bg-optio-purple text-white rounded-full flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </span>
                    <input
                      type="text"
                      value={proj.title || ''}
                      onChange={(e) => handleProjectTitleChange(index, e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
                      placeholder="Project title"
                    />
                  </div>
                  <textarea
                    value={proj.description || ''}
                    onChange={(e) => handleProjectDescriptionChange(index, e.target.value)}
                    rows={2}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-optio-purple focus:border-optio-purple text-sm resize-none"
                    placeholder="Brief description of what they'll create"
                  />
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => onNext(editedOutline)}
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                Creating Course...
              </>
            ) : (
              <>
                Save and Continue
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// STAGE 2: LESSONS COMPONENT
// =============================================================================

export default Stage1Outline
