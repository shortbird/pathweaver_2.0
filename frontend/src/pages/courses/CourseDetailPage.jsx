import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, AcademicCapIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { getCourseById, getCourseProgress, enrollInCourse, unenrollFromCourse } from '../../services/courseService'

/**
 * CourseDetailPage - Student view of a course
 *
 * Features:
 * - Course intro content and description
 * - Quest list with completion status
 * - Progress bar toward badge
 * - Enroll button if not enrolled
 * - Badge preview
 * - Navigate to quest curriculum on click
 */
const CourseDetailPage = () => {
  const { id: courseId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [course, setCourse] = useState(null)
  const [progress, setProgress] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEnrolling, setIsEnrolling] = useState(false)
  const [isUnenrolling, setIsUnenrolling] = useState(false)
  const [isEnrolled, setIsEnrolled] = useState(false)

  // Fetch course and progress data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)

        // Fetch course data
        const courseResponse = await getCourseById(courseId)
        const courseData = courseResponse.course || courseResponse
        setCourse(courseData)

        // Check if enrolled and fetch progress if enrolled
        try {
          const progressResponse = await getCourseProgress(courseId)
          const progressData = progressResponse.progress || progressResponse
          setProgress(progressData)
          setIsEnrolled(true)
        } catch (error) {
          // If 404 or 403, user is not enrolled
          if (error.response?.status === 404 || error.response?.status === 403) {
            setIsEnrolled(false)
          } else {
            console.warn('Could not fetch progress:', error)
          }
        }
      } catch (error) {
        console.error('Failed to load course:', error)
        toast.error('Failed to load course')
      } finally {
        setIsLoading(false)
      }
    }

    if (courseId && user) {
      fetchData()
    }
  }, [courseId, user])

  // Handle enrollment
  const handleEnroll = async () => {
    try {
      setIsEnrolling(true)
      await enrollInCourse(courseId)
      toast.success('Successfully enrolled in course!')
      setIsEnrolled(true)

      // Refetch progress after enrollment
      const progressResponse = await getCourseProgress(courseId)
      const progressData = progressResponse.progress || progressResponse
      setProgress(progressData)
    } catch (error) {
      console.error('Failed to enroll:', error)
      toast.error(error.response?.data?.message || 'Failed to enroll in course')
    } finally {
      setIsEnrolling(false)
    }
  }

  // Handle unenroll
  const handleUnenroll = async () => {
    if (!window.confirm('Are you sure you want to unenroll from this course? This will also unenroll you from all quests in this course and delete your progress.')) {
      return
    }

    try {
      setIsUnenrolling(true)
      await unenrollFromCourse(courseId)
      toast.success('Successfully unenrolled from course')
      setIsEnrolled(false)
      setProgress(null)
    } catch (error) {
      console.error('Failed to unenroll:', error)
      toast.error(error.response?.data?.message || 'Failed to unenroll from course')
    } finally {
      setIsUnenrolling(false)
    }
  }

  // Handle quest click
  const handleQuestClick = (questId) => {
    navigate(`/quests/${questId}/curriculum`)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    )
  }

  if (!course) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-gray-600 mb-4">Course not found</p>
        <button
          onClick={() => navigate('/courses')}
          className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:opacity-90 transition-opacity"
        >
          Back to Courses
        </button>
      </div>
    )
  }

  const quests = course.quests || []
  const completedQuests = progress?.completed_quests || 0
  const totalQuests = quests.length
  const progressPercent = totalQuests > 0 ? (completedQuests / totalQuests) * 100 : 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/courses')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Back to courses"
            >
              <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">
                {course.title}
              </h1>
              <p className="text-sm text-gray-600">
                {totalQuests} quest{totalQuests !== 1 ? 's' : ''} in this course
              </p>
            </div>
            {!isEnrolled ? (
              <button
                onClick={handleEnroll}
                disabled={isEnrolling}
                className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] w-full sm:w-auto"
              >
                {isEnrolling ? 'Enrolling...' : 'Enroll Now'}
              </button>
            ) : (
              <button
                onClick={handleUnenroll}
                disabled={isUnenrolling}
                className="px-6 py-2 border border-red-500 text-red-500 rounded-lg font-semibold hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] w-full sm:w-auto"
              >
                {isUnenrolling ? 'Unenrolling...' : 'Unenroll'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Course Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Course Description */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                About This Course
              </h2>
              <p className="text-gray-700 whitespace-pre-wrap">
                {course.description || 'No description available.'}
              </p>
            </div>

            {/* Progress Bar (if enrolled) */}
            {isEnrolled && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xl font-bold text-gray-900">
                    Your Progress
                  </h2>
                  <span className="text-sm font-semibold text-optio-purple">
                    {completedQuests} / {totalQuests} Quests
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-optio-purple to-optio-pink h-full transition-all duration-500 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Quest List */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Course Quests
              </h2>
              {quests.length === 0 ? (
                <p className="text-gray-600">No quests in this course yet.</p>
              ) : (
                <div className="space-y-3">
                  {quests.map((quest, index) => {
                    const isCompleted = progress?.quest_statuses?.[quest.id]?.completed || false

                    return (
                      <button
                        key={quest.id}
                        onClick={() => handleQuestClick(quest.id)}
                        className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:border-optio-purple hover:shadow-md transition-all duration-200 text-left min-h-[56px]"
                      >
                        {/* Quest Number */}
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center text-white font-bold">
                          {index + 1}
                        </div>

                        {/* Quest Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 truncate">
                            {quest.title}
                          </h3>
                          {quest.description && (
                            <p className="text-sm text-gray-600 line-clamp-1">
                              {quest.description}
                            </p>
                          )}
                        </div>

                        {/* Completion Status */}
                        {isEnrolled && (
                          <div className="flex-shrink-0">
                            {isCompleted ? (
                              <CheckCircleIcon className="w-6 h-6 text-green-500" />
                            ) : (
                              <div className="w-6 h-6 rounded-full border-2 border-gray-300" />
                            )}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Badge Preview */}
          <div className="lg:col-span-1">
            {course.badge && (
              <div className="bg-white rounded-lg shadow-sm p-6 sticky top-24">
                <h2 className="text-lg font-bold text-gray-900 mb-4">
                  Course Badge
                </h2>
                <div className="flex flex-col items-center">
                  {/* Badge Image */}
                  <div className="w-32 h-32 mb-4">
                    {course.badge.image_url ? (
                      <img
                        src={course.badge.image_url}
                        alt={course.badge.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-optio-purple to-optio-pink rounded-full flex items-center justify-center">
                        <AcademicCapIcon className="w-16 h-16 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Badge Name */}
                  <h3 className="text-lg font-bold text-gray-900 text-center mb-2">
                    {course.badge.name}
                  </h3>

                  {/* Badge Description */}
                  {course.badge.description && (
                    <p className="text-sm text-gray-600 text-center mb-4">
                      {course.badge.description}
                    </p>
                  )}

                  {/* Progress toward badge */}
                  {isEnrolled && (
                    <div className="w-full">
                      <div className="text-center mb-2">
                        <span className="text-sm font-semibold text-optio-purple">
                          {progressPercent.toFixed(0)}% Complete
                        </span>
                      </div>
                      {progressPercent === 100 ? (
                        <div className="px-4 py-2 bg-green-100 text-green-800 rounded-lg text-center font-semibold">
                          Badge Earned!
                        </div>
                      ) : (
                        <div className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-center text-sm">
                          Complete all quests to earn this badge
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default CourseDetailPage
