import React, { useState, useEffect, useCallback } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import CourseEnrollmentManager from '../admin/CourseEnrollmentManager'
import {
  MagnifyingGlassIcon,
  UsersIcon,
  BookOpenIcon
} from '@heroicons/react/24/outline'

/**
 * OrgCoursesTab - Allows org_admins to browse Optio courses and enroll their students.
 * Shows published Optio platform courses available to the organization.
 */
export default function OrgCoursesTab({ orgId, orgData }) {
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [enrollmentCourse, setEnrollmentCourse] = useState(null)

  const fetchCourses = useCallback(async () => {
    try {
      setLoading(true)
      const response = await api.get('/api/courses?filter=all')
      const allCourses = response.data.courses || []
      // Show only published Optio platform courses (not org-owned)
      const optioCourses = allCourses.filter(
        c => c.status === 'published' && c.organization_id !== orgId
      )
      setCourses(optioCourses)
    } catch (error) {
      console.error('Failed to fetch courses:', error)
      toast.error('Failed to load courses')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    fetchCourses()
  }, [fetchCourses])

  const filteredCourses = courses.filter(course => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      course.title?.toLowerCase().includes(search) ||
      course.description?.toLowerCase().includes(search)
    )
  })

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Optio Courses</h2>
          <p className="text-sm text-gray-600">
            Enroll your students in published Optio platform courses
          </p>
        </div>
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search courses..."
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg w-64 text-sm focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
          />
        </div>
      </div>

      {/* Courses Grid */}
      {filteredCourses.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <BookOpenIcon className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">
            {searchTerm ? 'No courses match your search' : 'No Optio courses available'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredCourses.map(course => (
            <CourseCard
              key={course.id}
              course={course}
              onEnroll={() => setEnrollmentCourse(course)}
            />
          ))}
        </div>
      )}

      {/* Enrollment Manager Modal */}
      {enrollmentCourse && (
        <CourseEnrollmentManager
          courseId={enrollmentCourse.id}
          courseName={enrollmentCourse.title}
          orgId={orgId}
          isSuperadmin={false}
          onClose={() => setEnrollmentCourse(null)}
        />
      )}
    </div>
  )
}

function CourseCard({ course, onEnroll }) {
  const projectCount = course.quest_count || 0

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 hover:border-optio-purple/30 hover:shadow-md transition-all overflow-hidden flex flex-col">
      {/* Cover Image */}
      <div className="relative h-36 bg-gradient-to-r from-optio-purple/20 to-optio-pink/20">
        {course.cover_image_url ? (
          <img
            src={course.cover_image_url}
            alt={course.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpenIcon className="w-10 h-10 text-gray-300" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="text-base font-semibold text-gray-900 line-clamp-1">{course.title}</h3>
        <p className="text-sm text-gray-600 mt-1 line-clamp-2 flex-1">
          {course.description || 'No description'}
        </p>

        {/* Meta */}
        <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
          <BookOpenIcon className="w-4 h-4" />
          <span>{projectCount} {projectCount === 1 ? 'project' : 'projects'}</span>
        </div>

        {/* Enroll Button */}
        <button
          onClick={onEnroll}
          className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90 transition-opacity text-sm"
        >
          <UsersIcon className="w-4 h-4" />
          Manage Enrollments
        </button>
      </div>
    </div>
  )
}
