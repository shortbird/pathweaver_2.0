import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import CurriculumView from '../../components/curriculum/CurriculumView'
import toast from 'react-hot-toast'
import api from '../../services/api'

const PHILOSOPHY_GUIDE_KEY = 'curriculum_philosophy_dismissed'

const PhilosophyGuide = ({ onDismiss }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Welcome to Curriculum
        </h2>
        <div className="space-y-4 text-gray-700">
          <p>
            This curriculum feature helps you organize learning content into structured lessons
            that align with your quests and tasks.
          </p>
          <p>
            Each lesson can include rich content, links to resources, and can be connected
            to quest tasks to help students see how their work fits into a bigger picture.
          </p>
          <p className="font-semibold text-optio-purple">
            The Process Is The Goal - focus on the learning journey, not just completion.
          </p>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={onDismiss}
            className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:opacity-90 transition-opacity"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

const CurriculumPage = () => {
  const { id: questId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [showPhilosophyGuide, setShowPhilosophyGuide] = useState(false)
  const [quest, setQuest] = useState(null)
  const [lessons, setLessons] = useState([])
  const [selectedLesson, setSelectedLesson] = useState(null)
  const [lessonProgress, setLessonProgress] = useState({})
  const [isLoading, setIsLoading] = useState(true)

  // Check if this is the user's first visit
  useEffect(() => {
    const hasSeenGuide = localStorage.getItem(PHILOSOPHY_GUIDE_KEY)
    if (!hasSeenGuide) {
      setShowPhilosophyGuide(true)
    }
  }, [])

  const handleDismissGuide = () => {
    localStorage.setItem(PHILOSOPHY_GUIDE_KEY, 'true')
    setShowPhilosophyGuide(false)
  }

  // Fetch quest, lessons, and progress
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)

        // Fetch quest data
        const questResponse = await api.get(`/api/quests/${questId}`)
        const questData = questResponse.data.quest || questResponse.data
        setQuest(questData)

        // Fetch lessons (published only for students, all for admins)
        const isAdmin = ['admin', 'school_admin', 'advisor', 'teacher', 'superadmin'].includes(user?.role)
        const lessonsResponse = await api.get(
          `/api/quests/${questId}/curriculum/lessons${isAdmin ? '?include_unpublished=true' : ''}`
        )
        const lessonsData = lessonsResponse.data.lessons || []
        setLessons(lessonsData)

        // Fetch progress for student
        if (!isAdmin && user?.id) {
          try {
            const progressResponse = await api.get(`/api/quests/${questId}/curriculum/progress`)
            const progressData = progressResponse.data.progress || []

            // Convert to a map for easy lookup
            const progressMap = {}
            progressData.forEach(p => {
              progressMap[p.lesson_id] = p
            })
            setLessonProgress(progressMap)
          } catch (error) {
            console.warn('Could not fetch progress:', error)
          }
        }

        // Select first lesson by default
        if (lessonsData.length > 0) {
          setSelectedLesson(lessonsData[0])
        }
      } catch (error) {
        console.error('Failed to load curriculum:', error)
        toast.error('Failed to load curriculum')
      } finally {
        setIsLoading(false)
      }
    }

    if (questId) {
      fetchData()
    }
  }, [questId, user?.role, user?.id])

  // Handle lesson selection
  const handleLessonSelect = (lesson) => {
    setSelectedLesson(lesson)
  }

  // Handle lessons reorder (admin only)
  const handleLessonsReorder = async (reorderedLessons) => {
    setLessons(reorderedLessons)

    try {
      await api.put(`/api/quests/${questId}/curriculum/lessons/reorder`, {
        lesson_order: reorderedLessons.map(l => l.id)
      })
    } catch (error) {
      console.error('Failed to reorder lessons:', error)
      toast.error('Failed to save lesson order')
    }
  }

  const isAdmin = ['admin', 'school_admin', 'advisor', 'teacher', 'superadmin'].includes(user?.role)

  // If admin, redirect to builder
  if (isAdmin && !isLoading) {
    // Admins should use the CurriculumBuilder directly
    // This page is for the student view
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    )
  }

  // Merge lessons with progress data
  const lessonsWithProgress = lessons.map(lesson => ({
    ...lesson,
    is_completed: lessonProgress[lesson.id]?.status === 'completed',
    progress: lessonProgress[lesson.id]
  }))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Philosophy Guide Modal */}
      {showPhilosophyGuide && (
        <PhilosophyGuide onDismiss={handleDismissGuide} />
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(`/quests/${questId}`)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Back to quest"
            >
              <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {quest?.title || 'Quest'}
              </h1>
              <p className="text-sm text-gray-600">
                {lessons.length} lesson{lessons.length !== 1 ? 's' : ''} available
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - CurriculumView handles both sidebar and content */}
      <div className="h-[calc(100vh-80px)]">
        <CurriculumView
          lessons={lessonsWithProgress}
          selectedLessonId={selectedLesson?.id}
          onLessonSelect={handleLessonSelect}
          onLessonsReorder={isAdmin ? handleLessonsReorder : undefined}
          orderingMode="sequential"
          isAdmin={isAdmin}
          className="h-full"
        />
      </div>
    </div>
  )
}

export default CurriculumPage
