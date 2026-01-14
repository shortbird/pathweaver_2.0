import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../services/api'
import toast from 'react-hot-toast'

// =============================================================================
// WIZARD PROGRESS COMPONENT
// =============================================================================

const WizardProgress = ({ currentStage, stages }) => {
  return (
    <div className="flex items-center justify-center mb-8">
      {stages.map((stage, index) => {
        const isActive = index + 1 === currentStage
        const isComplete = index + 1 < currentStage

        return (
          <React.Fragment key={stage.id}>
            {index > 0 && (
              <div
                className={`h-0.5 w-16 mx-2 ${
                  isComplete ? 'bg-optio-purple' : 'bg-gray-200'
                }`}
              />
            )}
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-medium text-sm ${
                  isActive
                    ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
                    : isComplete
                    ? 'bg-optio-purple text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {isComplete ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              <span className={`text-xs mt-1 ${isActive ? 'text-optio-purple font-medium' : 'text-gray-500'}`}>
                {stage.label}
              </span>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

// =============================================================================
// STAGE 1: OUTLINE COMPONENT
// =============================================================================

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

const Stage2Lessons = ({
  courseId,
  projects,
  onGenerateLessons,
  onRegenerateLessons,
  onNext,
  loading
}) => {
  const [expandedProject, setExpandedProject] = useState(null)
  const [regeneratingLesson, setRegeneratingLesson] = useState(null)

  const hasLessons = projects.some(p => p.lessons && p.lessons.length > 0)

  return (
    <div className="space-y-6">
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>Just-in-Time Teaching:</strong> Lessons provide just enough info to make a competent first attempt.
          Students learn by doing - these lessons prepare them for hands-on tasks.
        </p>
      </div>

      {!hasLessons ? (
        <div className="text-center py-12">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Generate Lessons</h3>
          <p className="text-gray-500 mb-6">
            Create lessons for all {projects.length} projects in your course
          </p>
          <button
            onClick={onGenerateLessons}
            disabled={loading}
            className="px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 mx-auto"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                Generating Lessons...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate All Lessons
              </>
            )}
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {projects.map((project, pIndex) => (
              <div key={project.id} className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedProject(expandedProject === project.id ? null : project.id)}
                  className="w-full p-4 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 bg-optio-purple text-white rounded-full flex items-center justify-center font-medium">
                      {pIndex + 1}
                    </span>
                    <div className="text-left">
                      <h4 className="font-medium text-gray-900">{project.title}</h4>
                      <p className="text-sm text-gray-500">
                        {project.lessons?.length || 0} lessons
                      </p>
                    </div>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${
                      expandedProject === project.id ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {expandedProject === project.id && (
                  <div className="p-4 space-y-3">
                    {project.lessons?.map((lesson, lIndex) => (
                      <div key={lesson.id || lIndex} className="p-3 bg-white border border-gray-100 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div>
                            <h5 className="font-medium text-gray-900 text-sm">
                              {lIndex + 1}. {lesson.title}
                            </h5>
                            <p className="text-xs text-gray-500 mt-1">{lesson.description}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {lesson.steps?.length || lesson.content?.steps?.length || 0} steps
                            </p>
                          </div>
                          <button
                            onClick={() => onRegenerateLessons(project.id, lesson.id)}
                            disabled={regeneratingLesson === lesson.id}
                            className="text-optio-purple hover:underline text-xs"
                          >
                            {regeneratingLesson === lesson.id ? 'Regenerating...' : 'Regenerate'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={onNext}
            className="w-full py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90 flex items-center justify-center gap-2"
          >
            Continue to Tasks
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}
    </div>
  )
}

// =============================================================================
// STAGE 3: TASKS COMPONENT
// =============================================================================

const Stage3Tasks = ({
  courseId,
  projects,
  onGenerateTasks,
  onRegenerateTasks,
  onNext,
  loading
}) => {
  const [expandedLesson, setExpandedLesson] = useState(null)

  const hasTasks = projects.some(p =>
    p.lessons?.some(l => l.tasks && l.tasks.length > 0)
  )

  const totalTasks = projects.reduce((sum, p) =>
    sum + (p.lessons?.reduce((lSum, l) => lSum + (l.tasks?.length || 0), 0) || 0), 0
  )

  return (
    <div className="space-y-6">
      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
        <p className="text-sm text-green-800">
          <strong>Tasks are where learning happens.</strong> Each task applies lesson knowledge through hands-on action.
          Students can also create their own tasks - these are starting suggestions.
        </p>
      </div>

      {!hasTasks ? (
        <div className="text-center py-12">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Generate Task Suggestions</h3>
          <p className="text-gray-500 mb-6">
            Create hands-on tasks for all lessons in your course
          </p>
          <button
            onClick={onGenerateTasks}
            disabled={loading}
            className="px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 mx-auto"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                Generating Tasks...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate All Tasks
              </>
            )}
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 text-center">
            {totalTasks} task suggestions generated
          </p>

          <div className="space-y-4">
            {projects.map((project, pIndex) => (
              <div key={project.id} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="p-4 bg-gray-50">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 bg-optio-purple text-white rounded-full flex items-center justify-center font-medium">
                      {pIndex + 1}
                    </span>
                    <h4 className="font-medium text-gray-900">{project.title}</h4>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  {project.lessons?.map((lesson, lIndex) => (
                    <div key={lesson.id || lIndex} className="border border-gray-100 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpandedLesson(expandedLesson === lesson.id ? null : lesson.id)}
                        className="w-full p-3 bg-white flex items-center justify-between hover:bg-gray-50"
                      >
                        <span className="text-sm font-medium text-gray-700">
                          {lIndex + 1}. {lesson.title}
                          <span className="text-gray-400 ml-2">
                            ({lesson.tasks?.length || 0} tasks)
                          </span>
                        </span>
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform ${
                            expandedLesson === lesson.id ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {expandedLesson === lesson.id && lesson.tasks && (
                        <div className="p-3 bg-gray-50 space-y-2">
                          {lesson.tasks.map((task, tIndex) => (
                            <div key={task.id || tIndex} className="p-3 bg-white rounded border border-gray-100">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <h6 className="text-sm font-medium text-gray-900">{task.title}</h6>
                                  <p className="text-xs text-gray-500 mt-1">{task.description}</p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className={`px-2 py-0.5 text-xs rounded ${
                                    task.pillar === 'creativity' ? 'bg-purple-100 text-purple-700' :
                                    task.pillar === 'knowledge' ? 'bg-blue-100 text-blue-700' :
                                    task.pillar === 'social' ? 'bg-green-100 text-green-700' :
                                    'bg-orange-100 text-orange-700'
                                  }`}>
                                    {task.pillar}
                                  </span>
                                  <span className="text-xs text-gray-400">{task.xp_value} XP</span>
                                </div>
                              </div>
                            </div>
                          ))}
                          <button
                            onClick={() => onRegenerateTasks(project.id, lesson.id)}
                            className="text-optio-purple hover:underline text-xs"
                          >
                            Regenerate tasks for this lesson
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={onNext}
            className="w-full py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90 flex items-center justify-center gap-2"
          >
            Review and Publish
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}
    </div>
  )
}

// =============================================================================
// STAGE 4: REVIEW COMPONENT
// =============================================================================

const Stage4Review = ({
  course,
  projects,
  onPublish,
  onSaveDraft,
  loading
}) => {
  const totalLessons = projects.reduce((sum, p) => sum + (p.lessons?.length || 0), 0)
  const totalTasks = projects.reduce((sum, p) =>
    sum + (p.lessons?.reduce((lSum, l) => lSum + (l.tasks?.length || 0), 0) || 0), 0
  )

  return (
    <div className="space-y-6">
      <div className="p-6 bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 border border-optio-purple/20 rounded-lg">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">{course?.title}</h3>
        <p className="text-gray-600">{course?.description}</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-white border border-gray-200 rounded-lg text-center">
          <div className="text-3xl font-bold text-optio-purple">{projects.length}</div>
          <div className="text-sm text-gray-500">Projects</div>
        </div>
        <div className="p-4 bg-white border border-gray-200 rounded-lg text-center">
          <div className="text-3xl font-bold text-optio-purple">{totalLessons}</div>
          <div className="text-sm text-gray-500">Lessons</div>
        </div>
        <div className="p-4 bg-white border border-gray-200 rounded-lg text-center">
          <div className="text-3xl font-bold text-optio-purple">{totalTasks}</div>
          <div className="text-sm text-gray-500">Tasks</div>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">Course Structure</h4>
        {projects.map((project, pIndex) => (
          <div key={project.id} className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 bg-optio-purple text-white rounded-full flex items-center justify-center text-sm font-medium">
                {pIndex + 1}
              </span>
              <span className="font-medium text-gray-900">{project.title}</span>
            </div>
            <div className="ml-8 space-y-1">
              {project.lessons?.map((lesson, lIndex) => (
                <div key={lesson.id || lIndex} className="text-sm text-gray-600 flex items-center justify-between">
                  <span>{lIndex + 1}. {lesson.title}</span>
                  <span className="text-gray-400">{lesson.tasks?.length || 0} tasks</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-4">
        <button
          onClick={onSaveDraft}
          disabled={loading}
          className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          Save as Draft
        </button>
        <button
          onClick={onPublish}
          disabled={loading}
          className="flex-1 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
              Publishing...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Publish Course
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// =============================================================================
// MAIN WIZARD COMPONENT
// =============================================================================

const STAGES = [
  { id: 1, label: 'Outline' },
  { id: 2, label: 'Lessons' },
  { id: 3, label: 'Tasks' },
  { id: 4, label: 'Review' }
]

const CourseGeneratorWizard = () => {
  const navigate = useNavigate()
  const { courseId: urlCourseId } = useParams()

  // State
  const [currentStage, setCurrentStage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // Ref to prevent duplicate requests
  const requestInProgress = React.useRef(false)

  // Debug: Log state changes
  useEffect(() => {
    console.log('[Wizard] State:', { currentStage, loading, regenerating, courseId: urlCourseId, requestInProgress: requestInProgress.current })
  }, [currentStage, loading, regenerating, urlCourseId])

  // Stage 1 state
  const [topic, setTopic] = useState('')
  const [alternatives, setAlternatives] = useState(null)
  const [selectedOutline, setSelectedOutline] = useState(null)

  // Course state (after creation)
  const [courseId, setCourseId] = useState(urlCourseId || null)
  const [course, setCourse] = useState(null)
  const [projects, setProjects] = useState([])

  // Load existing course state if courseId provided
  useEffect(() => {
    if (urlCourseId) {
      loadCourseState(urlCourseId)
    }
  }, [urlCourseId])

  // Load course state - manageLoading=false when called from handlers that already manage loading
  const loadCourseState = async (id, manageLoading = true) => {
    try {
      if (manageLoading) setLoading(true)
      const response = await api.get(`/api/admin/curriculum/generate/${id}`)
      if (response.data.success) {
        setCourse(response.data.course)
        setProjects(response.data.projects || [])
        setCurrentStage(response.data.current_stage || 2)
        setCourseId(id)
      }
    } catch (error) {
      console.error('Failed to load course state:', error)
      toast.error('Failed to load course')
    } finally {
      if (manageLoading) setLoading(false)
    }
  }

  // Stage 1: Generate outline
  const handleGenerateOutline = async () => {
    try {
      setLoading(true)
      const response = await api.post('/api/admin/curriculum/generate/outline', { topic })
      if (response.data.success) {
        setAlternatives(response.data.alternatives)
        toast.success('Generated 3 course options')
      } else {
        toast.error(response.data.error || 'Failed to generate outline')
      }
    } catch (error) {
      console.error('Generate outline error:', error)
      toast.error('Failed to generate course outline')
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerateOutline = async () => {
    try {
      setRegenerating(true)
      const response = await api.post('/api/admin/curriculum/generate/outline', {
        topic,
        previous_outlines: alternatives
      })
      if (response.data.success) {
        setAlternatives(response.data.alternatives)
        toast.success('Generated new options')
      }
    } catch (error) {
      console.error('Regenerate outline error:', error)
      toast.error('Failed to regenerate options')
    } finally {
      setRegenerating(false)
    }
  }

  const handleSaveOutline = async (outline) => {
    try {
      setLoading(true)
      const response = await api.post('/api/admin/curriculum/generate/outline/select', { outline })
      if (response.data.success) {
        setCourseId(response.data.course_id)
        setCourse({ title: outline.title, description: outline.description })
        setProjects(outline.projects.map((p, i) => ({
          id: `temp-${i}`,
          title: p.title,
          description: p.description,
          sequence_order: p.order || i + 1,
          lessons: []
        })))
        setCurrentStage(2)
        toast.success('Course draft created')

        // Update URL
        navigate(`/admin/generate-course/${response.data.course_id}`, { replace: true })

        // Reload to get actual IDs
        await loadCourseState(response.data.course_id, false) // Don't manage loading - we handle it
      }
    } catch (error) {
      console.error('Save outline error:', error)
      toast.error('Failed to save course outline')
    } finally {
      setLoading(false)
    }
  }

  // Stage 2: Generate lessons
  const handleGenerateLessons = async () => {
    // Prevent duplicate requests
    if (requestInProgress.current) {
      console.log('[Wizard] Request already in progress, ignoring')
      return
    }

    console.log('[Wizard] handleGenerateLessons called, courseId:', courseId)
    requestInProgress.current = true
    setLoading(true)

    try {
      console.log('[Wizard] Loading set to true')
      const response = await api.post(`/api/admin/curriculum/generate/${courseId}/lessons`, {})
      console.log('[Wizard] Lessons response:', response.data)
      if (response.data.success) {
        await loadCourseState(courseId, false) // Don't manage loading - we handle it
        toast.success('Lessons generated')
      } else {
        console.error('[Wizard] Lessons generation failed:', response.data.error)
        toast.error(response.data.error || 'Failed to generate lessons')
      }
    } catch (error) {
      console.error('[Wizard] Generate lessons error:', error)
      console.error('[Wizard] Error response:', error.response?.data)
      toast.error('Failed to generate lessons')
    } finally {
      console.log('[Wizard] Setting loading to false')
      requestInProgress.current = false
      setLoading(false)
    }
  }

  const handleRegenerateLessons = async (questId, lessonId) => {
    try {
      const response = await api.post(`/api/admin/curriculum/generate/${courseId}/regenerate-lesson/${lessonId}`, {
        quest_id: questId
      })
      if (response.data.success) {
        toast.success('Lesson alternatives generated')
        // TODO: Show alternatives modal
      }
    } catch (error) {
      console.error('Regenerate lesson error:', error)
      toast.error('Failed to regenerate lesson')
    }
  }

  // Stage 3: Generate tasks
  const handleGenerateTasks = async () => {
    // Prevent duplicate requests
    if (requestInProgress.current) {
      console.log('[Wizard] Tasks - Request already in progress, ignoring')
      return
    }

    console.log('[Wizard] handleGenerateTasks called, courseId:', courseId)
    requestInProgress.current = true
    setLoading(true)

    try {
      console.log('[Wizard] Tasks - Loading set to true')
      const response = await api.post(`/api/admin/curriculum/generate/${courseId}/tasks`, {})
      console.log('[Wizard] Tasks response:', response.data)
      if (response.data.success) {
        await loadCourseState(courseId, false) // Don't manage loading - we handle it
        toast.success('Tasks generated')
      } else {
        console.error('[Wizard] Tasks generation failed:', response.data.error)
        toast.error(response.data.error || 'Failed to generate tasks')
      }
    } catch (error) {
      console.error('[Wizard] Generate tasks error:', error)
      console.error('[Wizard] Tasks error response:', error.response?.data)
      toast.error('Failed to generate tasks')
    } finally {
      console.log('[Wizard] Tasks - Setting loading to false')
      requestInProgress.current = false
      setLoading(false)
    }
  }

  const handleRegenerateTasks = async (questId, lessonId) => {
    try {
      const response = await api.post(`/api/admin/curriculum/generate/${courseId}/regenerate-tasks/${lessonId}`, {
        quest_id: questId
      })
      if (response.data.success) {
        toast.success('Task alternatives generated')
        // TODO: Show alternatives modal
      }
    } catch (error) {
      console.error('Regenerate tasks error:', error)
      toast.error('Failed to regenerate tasks')
    }
  }

  // Stage 4: Publish
  const handlePublish = async () => {
    try {
      setLoading(true)
      const response = await api.post(`/api/admin/curriculum/generate/${courseId}/finalize`, {})
      if (response.data.success) {
        toast.success('Course published!')
        navigate(`/courses/${courseId}/edit`)
      }
    } catch (error) {
      console.error('Publish error:', error)
      toast.error('Failed to publish course')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveDraft = () => {
    toast.success('Draft saved')
    navigate('/admin/curriculum-upload')
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/admin/curriculum-upload')}
          className="text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Curriculum Upload
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Course Generator</h1>
        <p className="text-gray-500">Create hands-on, action-oriented courses with AI</p>
      </div>

      {/* Progress */}
      <WizardProgress currentStage={currentStage} stages={STAGES} />

      {/* Stage Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {currentStage === 1 && (
          <Stage1Outline
            topic={topic}
            setTopic={setTopic}
            alternatives={alternatives}
            selectedOutline={selectedOutline}
            setSelectedOutline={setSelectedOutline}
            onGenerate={handleGenerateOutline}
            onRegenerate={handleRegenerateOutline}
            onNext={handleSaveOutline}
            loading={loading}
            regenerating={regenerating}
          />
        )}

        {currentStage === 2 && (
          <Stage2Lessons
            courseId={courseId}
            projects={projects}
            onGenerateLessons={handleGenerateLessons}
            onRegenerateLessons={handleRegenerateLessons}
            onNext={() => setCurrentStage(3)}
            loading={loading}
          />
        )}

        {currentStage === 3 && (
          <Stage3Tasks
            courseId={courseId}
            projects={projects}
            onGenerateTasks={handleGenerateTasks}
            onRegenerateTasks={handleRegenerateTasks}
            onNext={() => setCurrentStage(4)}
            loading={loading}
          />
        )}

        {currentStage === 4 && (
          <Stage4Review
            course={course}
            projects={projects}
            onPublish={handlePublish}
            onSaveDraft={handleSaveDraft}
            loading={loading}
          />
        )}
      </div>
    </div>
  )
}

export default CourseGeneratorWizard
