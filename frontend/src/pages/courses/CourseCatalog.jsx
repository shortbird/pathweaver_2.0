import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { toast } from 'react-hot-toast'
import {
  MagnifyingGlassIcon,
  AcademicCapIcon,
  CheckCircleIcon,
  RocketLaunchIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'

const CourseCatalog = () => {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [enrolledCourseIds, setEnrolledCourseIds] = useState(new Set())

  useEffect(() => {
    fetchCourses()
  }, [])

  const fetchCourses = async () => {
    try {
      setLoading(true)
      const response = await api.get('/api/courses')

      // Filter to published courses only for students
      const publishedCourses = response.data.courses.filter(c => c.status === 'published')
      setCourses(publishedCourses)

      // Fetch enrollment status for each course
      if (publishedCourses.length > 0) {
        fetchEnrollmentStatus(publishedCourses)
      }
    } catch (error) {
      console.error('Failed to fetch courses:', error)
      toast.error('Failed to load courses')
    } finally {
      setLoading(false)
    }
  }

  const fetchEnrollmentStatus = async (coursesToCheck) => {
    try {
      const enrollmentPromises = coursesToCheck.map(course =>
        api.get(`/api/courses/${course.id}/progress`)
          .then(res => ({ courseId: course.id, enrolled: res.data.enrolled }))
          .catch(() => ({ courseId: course.id, enrolled: false }))
      )

      const results = await Promise.all(enrollmentPromises)
      const enrolledIds = new Set(
        results.filter(r => r.enrolled).map(r => r.courseId)
      )
      setEnrolledCourseIds(enrolledIds)
    } catch (error) {
      console.error('Failed to fetch enrollment status:', error)
    }
  }

  const handleEnroll = async (courseId) => {
    try {
      await api.post(`/api/courses/${courseId}/enroll`, {})
      toast.success('Successfully enrolled in course')

      // Update enrollment state
      setEnrolledCourseIds(prev => new Set([...prev, courseId]))
    } catch (error) {
      console.error('Failed to enroll in course:', error)
      toast.error(error.response?.data?.error || 'Failed to enroll in course')
    }
  }

  const handleViewCourse = (courseId) => {
    navigate(`/courses/${courseId}`)
  }

  // Filter courses based on search term
  const filteredCourses = courses.filter(course => {
    const searchLower = searchTerm.toLowerCase()
    return (
      course.title?.toLowerCase().includes(searchLower) ||
      course.description?.toLowerCase().includes(searchLower)
    )
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center gap-3 mb-2">
            <AcademicCapIcon className="w-8 h-8 text-optio-purple" />
            <h1 className="text-3xl font-bold text-gray-900">Course Catalog</h1>
          </div>
          <p className="text-gray-600">
            Explore structured learning pathways and enroll in courses
          </p>

          {/* Search */}
          <div className="mt-6 relative max-w-md">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search courses..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
                <div className="h-48 bg-gray-200" />
                <div className="p-6 space-y-3">
                  <div className="h-6 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-full" />
                  <div className="h-4 bg-gray-200 rounded w-2/3" />
                  <div className="h-10 bg-gray-200 rounded w-full mt-4" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="text-center py-12">
            <AcademicCapIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No courses found' : 'No courses available'}
            </h3>
            <p className="text-gray-600">
              {searchTerm
                ? 'Try adjusting your search terms'
                : 'Check back later for new courses'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.map(course => {
              const isEnrolled = enrolledCourseIds.has(course.id)

              return (
                <div
                  key={course.id}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
                >
                  {/* Cover Image */}
                  {course.cover_url ? (
                    <img
                      src={course.cover_url}
                      alt={course.title}
                      className="w-full h-48 object-cover"
                    />
                  ) : (
                    <div className="w-full h-48 bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center">
                      <AcademicCapIcon className="w-16 h-16 text-white opacity-50" />
                    </div>
                  )}

                  {/* Content */}
                  <div className="p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2">
                      {course.title}
                    </h3>

                    {course.description && (
                      <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                        {course.description}
                      </p>
                    )}

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                      <div className="flex items-center gap-1">
                        <RocketLaunchIcon className="w-4 h-4" />
                        <span>{course.quest_count || 0} projects</span>
                      </div>
                    </div>

                    {/* Action Button */}
                    {isEnrolled ? (
                      <button
                        onClick={() => handleViewCourse(course.id)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors font-medium"
                      >
                        <CheckCircleIcon className="w-5 h-5" />
                        View Course
                      </button>
                    ) : (
                      <button
                        onClick={() => handleEnroll(course.id)}
                        className="w-full px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
                      >
                        Enroll Now
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default CourseCatalog
