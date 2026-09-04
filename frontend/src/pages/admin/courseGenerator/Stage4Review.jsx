/**
 * Extracted from admin/CourseGeneratorWizard.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

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
// GENERATION MODE SELECTOR MODAL
// =============================================================================

export default Stage4Review
