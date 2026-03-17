import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AcademicCapIcon,
  ArrowLeftIcon,
  BookOpenIcon,
  UserGroupIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import classService from '../../services/classService'
import { useAuth } from '../../contexts/AuthContext'

/**
 * StudentClassesView - Shows enrolled classes for students
 *
 * Uses URL params for class selection (/classes/:classId) so
 * back navigation from quests can return directly to the class.
 */
export default function StudentClassesView() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { classId } = useParams()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchClasses()
  }, [])

  const fetchClasses = async () => {
    try {
      setLoading(true)
      const response = await classService.getMyStudentClasses()
      if (response.success) {
        setClasses(response.classes || [])
      } else {
        toast.error(response.error || 'Failed to load classes')
      }
    } catch (error) {
      console.error('Failed to fetch student classes:', error)
      toast.error('Failed to load classes')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
        <span className="ml-3 text-gray-500">Loading classes...</span>
      </div>
    )
  }

  // If a classId is in the URL, show the detail view
  const selectedClass = classId ? classes.find(c => c.id === classId) : null
  if (classId && selectedClass) {
    return (
      <StudentClassDetail
        classData={selectedClass}
        orgId={selectedClass.organization_id || user?.organization_id}
        onBack={() => navigate('/classes')}
      />
    )
  }

  // If classId in URL but not found in enrolled classes (maybe still loading or invalid)
  if (classId && !selectedClass && !loading) {
    return (
      <StudentClassDetail
        classId={classId}
        orgId={user?.organization_id}
        onBack={() => navigate('/classes')}
      />
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-900">My Classes</h2>

        {classes.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <AcademicCapIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No classes yet</h3>
            <p className="text-gray-500">
              You haven't been enrolled in any classes yet
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((cls) => (
              <StudentClassCard
                key={cls.id}
                classData={cls}
                onClick={() => navigate(`/classes/${cls.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * StudentClassCard - Card showing class info with progress
 */
function StudentClassCard({ classData, onClick }) {
  const progress = classData.progress || {}
  const isComplete = progress.is_complete

  return (
    <button
      onClick={onClick}
      className="text-left w-full bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md hover:border-optio-purple/30 transition-all"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 truncate">{classData.name}</h3>
          {classData.description && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{classData.description}</p>
          )}
        </div>
        {isComplete && (
          <CheckCircleIcon className="w-6 h-6 text-green-500 flex-shrink-0 ml-2" />
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-sm mb-1.5">
          <span className="text-gray-600 font-medium">
            {progress.earned_xp || 0} / {progress.xp_threshold || 0} XP
          </span>
          <span className={`font-semibold ${isComplete ? 'text-green-600' : 'text-optio-purple'}`}>
            {progress.percentage || 0}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full transition-all ${
              isComplete
                ? 'bg-green-500'
                : 'bg-gradient-to-r from-optio-purple to-optio-pink'
            }`}
            style={{ width: `${Math.min(100, progress.percentage || 0)}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <BookOpenIcon className="w-3.5 h-3.5" />
          {classData.quest_count || 0} quests
        </span>
        <span className="flex items-center gap-1">
          <UserGroupIcon className="w-3.5 h-3.5" />
          {classData.student_count || 0} students
        </span>
      </div>
    </button>
  )
}

/**
 * StudentClassDetail - Detailed view of a single class for students
 *
 * Can receive classData from parent (fast path) or classId to fetch independently.
 */
function StudentClassDetail({ classData: initialClassData, classId: propClassId, orgId, onBack }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [quests, setQuests] = useState([])
  const [advisors, setAdvisors] = useState([])
  const [loading, setLoading] = useState(true)
  const [classData, setClassData] = useState(initialClassData || null)
  const [progress, setProgress] = useState(initialClassData?.progress || {})

  const classId = initialClassData?.id || propClassId

  useEffect(() => {
    fetchDetails()
  }, [classId])

  const fetchDetails = async () => {
    try {
      setLoading(true)

      const requests = [
        classService.getClassQuests(orgId, classId).catch(() => ({ success: false })),
        classService.getClassAdvisors(orgId, classId).catch(() => ({ success: false })),
      ]

      // If we don't have classData yet, fetch student classes to get progress
      if (!initialClassData) {
        requests.push(
          classService.getMyStudentClasses().catch(() => ({ success: false }))
        )
      }

      const results = await Promise.all(requests)

      const [questsRes, advisorsRes] = results
      if (questsRes.success) {
        setQuests(questsRes.quests || [])
      }
      if (advisorsRes.success) {
        setAdvisors(advisorsRes.advisors || [])
      }

      // Set class data from student classes response if needed
      if (!initialClassData && results[2]?.success) {
        const cls = (results[2].classes || []).find(c => c.id === classId)
        if (cls) {
          setClassData(cls)
          setProgress(cls.progress || {})
        }
      }
    } catch (error) {
      console.error('Failed to fetch class details:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!classData && loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
        <span className="ml-3 text-gray-500">Loading class...</span>
      </div>
    )
  }

  if (!classData) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Class not found</p>
        <button onClick={onBack} className="mt-4 text-optio-purple hover:underline">
          Go back
        </button>
      </div>
    )
  }

  const isComplete = progress.is_complete

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{classData.name}</h1>
          {classData.description && (
            <p className="text-gray-500 mt-1">{classData.description}</p>
          )}
        </div>
      </div>

      {/* Progress Card */}
      <div className={`rounded-xl p-6 ${isComplete ? 'bg-green-50 border border-green-200' : 'bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 border border-optio-purple/10'}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Your Progress</h3>
          {isComplete && (
            <span className="flex items-center gap-1.5 text-green-600 font-semibold text-sm">
              <CheckCircleIcon className="w-5 h-5" />
              Complete
            </span>
          )}
        </div>
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-gray-600">
            {progress.earned_xp || 0} / {progress.xp_threshold || 0} XP earned
          </span>
          <span className={`font-bold text-lg ${isComplete ? 'text-green-600' : 'text-optio-purple'}`}>
            {progress.percentage || 0}%
          </span>
        </div>
        <div className="w-full bg-white/80 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${
              isComplete ? 'bg-green-500' : 'bg-gradient-to-r from-optio-purple to-optio-pink'
            }`}
            style={{ width: `${Math.min(100, progress.percentage || 0)}%` }}
          />
        </div>
      </div>

      {/* Quests Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <BookOpenIcon className="w-5 h-5 text-optio-purple" />
          Class Quests
        </h3>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple"></div>
          </div>
        ) : quests.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <p className="text-gray-500">No quests assigned to this class yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {quests.map((cq) => {
              const quest = cq.quests || cq
              return (
                <button
                  key={quest.id}
                  onClick={() => {
                    sessionStorage.setItem('classReturnPath', `/classes/${classId}`)
                    navigate(`/quests/${quest.id}`)
                  }}
                  className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-lg hover:shadow-sm hover:border-optio-purple/30 transition-all w-full text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-optio-purple/10 flex items-center justify-center flex-shrink-0">
                    <BookOpenIcon className="w-5 h-5 text-optio-purple" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 truncate">{quest.title}</h4>
                    {quest.description && (
                      <p className="text-sm text-gray-500 truncate">{quest.description}</p>
                    )}
                  </div>
                  <span className="text-sm text-optio-purple font-medium flex-shrink-0">
                    View Quest
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Advisors Section */}
      {advisors.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <UserGroupIcon className="w-5 h-5 text-optio-purple" />
            Class Advisors
          </h3>
          <div className="space-y-3">
            {advisors.map((assignment) => {
              const advisor = assignment.users || assignment
              const name = [advisor.first_name, advisor.last_name].filter(Boolean).join(' ') ||
                advisor.display_name ||
                advisor.email
              return (
                <div
                  key={advisor.id}
                  className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg"
                >
                  <div className="w-9 h-9 rounded-full bg-optio-purple/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-optio-purple">
                      {(name || '?')[0].toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{name}</p>
                    {advisor.email && (
                      <p className="text-xs text-gray-500">{advisor.email}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
