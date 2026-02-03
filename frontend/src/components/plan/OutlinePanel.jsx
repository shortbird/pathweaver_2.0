import React, { useState } from 'react'

/**
 * OutlinePanel - Displays and allows editing of the course outline
 *
 * Features:
 * - Editable title and description
 * - Collapsible project sections
 * - Change highlighting ([NEW], [MODIFIED])
 * - Target audience display
 */
const OutlinePanel = ({ outline, changes = [], onOutlineChange }) => {
  const [expandedProjects, setExpandedProjects] = useState({})
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingDescription, setEditingDescription] = useState(false)

  if (!outline) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>No outline yet. Start a conversation to create one.</p>
      </div>
    )
  }

  // Build a set of changed IDs for quick lookup
  const changedIds = new Set()
  const newIds = new Set()
  changes.forEach(change => {
    const ids = change.affected_ids || []
    ids.forEach(id => {
      if (change.type === 'added') {
        newIds.add(id)
      } else {
        changedIds.add(id)
      }
    })
  })

  // Check if an item was recently changed
  const isNew = (id) => newIds.has(id)
  const isModified = (id) => changedIds.has(id)

  // Toggle project expansion
  const toggleProject = (projectId) => {
    setExpandedProjects(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }))
  }

  // Handle title edit
  const handleTitleChange = (newTitle) => {
    if (onOutlineChange) {
      onOutlineChange({ ...outline, title: newTitle })
    }
    setEditingTitle(false)
  }

  // Handle description edit
  const handleDescriptionChange = (newDescription) => {
    if (onOutlineChange) {
      onOutlineChange({ ...outline, description: newDescription })
    }
    setEditingDescription(false)
  }

  return (
    <div className="p-6">
      {/* Course Title */}
      <div className="mb-4">
        {editingTitle ? (
          <input
            type="text"
            defaultValue={outline.title}
            onBlur={(e) => handleTitleChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTitleChange(e.target.value)}
            className="w-full text-2xl font-bold text-gray-900 border-b-2 border-optio-purple focus:outline-none"
            autoFocus
          />
        ) : (
          <h2
            className="text-2xl font-bold text-gray-900 cursor-text hover:bg-gray-50 px-1 -mx-1 rounded"
            onClick={() => setEditingTitle(true)}
            title="Click to edit"
          >
            {outline.title}
          </h2>
        )}
      </div>

      {/* Course Description */}
      <div className="mb-6">
        {editingDescription ? (
          <textarea
            defaultValue={outline.description}
            onBlur={(e) => handleDescriptionChange(e.target.value)}
            className="w-full text-gray-600 border border-gray-300 rounded p-2 focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
            rows={3}
            autoFocus
          />
        ) : (
          <p
            className="text-gray-600 cursor-text hover:bg-gray-50 px-1 -mx-1 rounded"
            onClick={() => setEditingDescription(true)}
            title="Click to edit"
          >
            {outline.description}
          </p>
        )}
      </div>

      {/* Target Audience */}
      {outline.target_audience && (
        <div className="mb-6 bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Target Audience</h3>
          <div className="flex flex-wrap gap-2 text-sm">
            {outline.target_audience.age_range && (
              <span className="px-2 py-1 bg-white border border-gray-200 rounded">
                Age: {outline.target_audience.age_range}
              </span>
            )}
            {outline.target_audience.interests?.map((interest, i) => (
              <span key={i} className="px-2 py-1 bg-white border border-gray-200 rounded">
                {interest}
              </span>
            ))}
            {outline.target_audience.learning_style && (
              <span className="px-2 py-1 bg-white border border-gray-200 rounded">
                {outline.target_audience.learning_style}
              </span>
            )}
          </div>
          {outline.target_audience.context && (
            <p className="text-sm text-gray-500 mt-2">{outline.target_audience.context}</p>
          )}
        </div>
      )}

      {/* Projects */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Projects ({outline.projects?.length || 0})
        </h3>

        <div className="space-y-3">
          {outline.projects?.map((project, index) => {
            const projectNew = isNew(project.id)
            const projectModified = isModified(project.id)
            const isExpanded = expandedProjects[project.id] !== false // Default to expanded

            return (
              <div
                key={project.id}
                className={`border rounded-lg overflow-hidden transition-all ${
                  projectNew
                    ? 'border-green-300 bg-green-50'
                    : projectModified
                    ? 'border-yellow-300 bg-yellow-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {/* Project header */}
                <button
                  onClick={() => toggleProject(project.id)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-500">{index + 1}</span>
                    <span className="font-medium text-gray-900">{project.title}</span>
                    {projectNew && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                        NEW
                      </span>
                    )}
                    {projectModified && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                        MODIFIED
                      </span>
                    )}
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-400 transform transition-transform ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Project content */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    {/* Project description */}
                    {project.description && (
                      <p className="text-sm text-gray-600 mt-3">{project.description}</p>
                    )}

                    {/* Lessons */}
                    {project.lessons?.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Lessons
                        </h4>
                        <ul className="space-y-1.5">
                          {project.lessons.map((lesson, lessonIndex) => {
                            const lessonNew = isNew(lesson.id)
                            const lessonModified = isModified(lesson.id)

                            return (
                              <li
                                key={lesson.id}
                                className={`flex items-center gap-2 text-sm ${
                                  lessonNew || lessonModified ? 'font-medium' : ''
                                }`}
                              >
                                <span className="w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 text-xs text-gray-500">
                                  {lessonIndex + 1}
                                </span>
                                <span className="text-gray-700">{lesson.title}</span>
                                {lessonNew && (
                                  <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                                    NEW
                                  </span>
                                )}
                                {lessonModified && (
                                  <span className="px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">
                                    MODIFIED
                                  </span>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}

                    {/* Learning objectives */}
                    {project.learning_objectives?.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Learning Objectives
                        </h4>
                        <ul className="space-y-1 text-sm text-gray-600">
                          {project.learning_objectives.map((obj, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-optio-purple mt-0.5">-</span>
                              <span>{obj}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Version indicator */}
      {outline.version && (
        <div className="mt-6 text-xs text-gray-400 text-center">
          Version {outline.version}
        </div>
      )}
    </div>
  )
}

export default OutlinePanel
