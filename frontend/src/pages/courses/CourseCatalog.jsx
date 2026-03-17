import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import {
  MagnifyingGlassIcon,
  AcademicCapIcon,
  CheckCircleIcon,
  RocketLaunchIcon,
  PencilSquareIcon,
  PlusIcon,
  EyeIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import { useCourses } from '../../hooks/api/useCourseData'

const CourseCatalog = () => {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Only superadmin can manage courses (create, see drafts, edit)
  const effectiveRole = user?.role === 'org_managed' ? user?.org_role : user?.role
  const canManageCourses = effectiveRole === 'superadmin'
  const isSuperadmin = effectiveRole === 'superadmin'

  // Superadmin uses admin_all filter to see all courses including drafts
  const queryFilters = isSuperadmin ? { filter: 'admin_all' } : {}

  const { data, isLoading: loading, error } = useCourses(queryFilters, {
    staleTime: 60 * 1000, // 1 minute - cached for quick revisits
  })

  const courses = useMemo(() => {
    const allCourses = data?.courses || []
    if (isSuperadmin) {
      // Superadmin sees all courses, optionally filtered by status
      if (statusFilter === 'published') return allCourses.filter(c => c.status === 'published')
      if (statusFilter === 'draft') return allCourses.filter(c => c.status === 'draft')
      return allCourses
    }
    // Only show courses the user is enrolled in (or created, for admins)
    return allCourses.filter(c => c.is_enrolled)
  }, [data, statusFilter, isSuperadmin])

  // Error is handled by React Query - shows in UI via loading/empty states

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
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <AcademicCapIcon className="w-8 h-8 text-optio-purple" />
                <h1 className="text-3xl font-bold text-gray-900">My Courses</h1>
              </div>
              <p className="text-gray-600">
                Your enrolled courses and learning progress
              </p>
            </div>

            {/* Create Course Button (admins only) */}
            {canManageCourses && (
              <button
                onClick={() => navigate('/courses/new')}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity font-medium min-h-[44px]"
              >
                <PlusIcon className="w-5 h-5" />
                <span className="hidden sm:inline">Create Course</span>
                <span className="sm:hidden">Create</span>
              </button>
            )}
          </div>

          {/* Search and Filters */}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <div className="relative max-w-md flex-1 min-w-[200px]">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search courses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              />
            </div>

            {isSuperadmin && (
              <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
                {[
                  { value: 'all', label: 'All' },
                  { value: 'published', label: 'Published' },
                  { value: 'draft', label: 'Drafts' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setStatusFilter(opt.value)}
                    className={`px-3 py-2 font-medium transition-colors ${
                      statusFilter === opt.value
                        ? 'bg-optio-purple text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
              {searchTerm ? 'No courses found' : 'No enrolled courses yet'}
            </h3>
            <p className="text-gray-600">
              {searchTerm
                ? 'Try adjusting your search terms'
                : 'You haven\'t enrolled in any courses yet'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.map(course => {
              const isDraft = course.status === 'draft'
              const isArchived = course.status === 'archived'
              const isCompleted = course.progress?.percentage >= 100 || course.progress?.is_completed
              const isExternal = course.is_external
              // Users can only edit courses they created themselves
              const canEditThisCourse = course.created_by === user?.id

              return (
                <div
                  key={course.id}
                  className={`bg-white rounded-xl border overflow-hidden hover:shadow-lg transition-shadow ${
                    isDraft ? 'border-amber-300' : isArchived ? 'border-gray-300' : isCompleted ? 'border-green-300' : isExternal ? 'border-blue-200' : 'border-gray-200'
                  }`}
                >
                  {/* Cover Image */}
                  <div className="relative">
                    {course.cover_image_url ? (
                      <img
                        src={course.cover_image_url}
                        alt={course.title}
                        className="w-full h-48 object-cover"
                      />
                    ) : (
                      <div className="w-full h-48 bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center">
                        <AcademicCapIcon className="w-16 h-16 text-white opacity-50" />
                      </div>
                    )}

                    {/* Status Badge */}
                    {isCompleted ? (
                      <div className="absolute top-3 left-3">
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          <CheckCircleSolid className="w-3.5 h-3.5" />
                          Completed
                        </span>
                      </div>
                    ) : canManageCourses && (isDraft || isArchived) ? (
                      <div className="absolute top-3 left-3">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          isDraft
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {isDraft ? 'Draft' : 'Archived'}
                        </span>
                      </div>
                    ) : null}

                    {/* External/Public Course Badge */}
                    {isExternal && (
                      <div className="absolute top-3 right-3">
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                          <GlobeAltIcon className="w-3.5 h-3.5" />
                          Public
                        </span>
                      </div>
                    )}
                  </div>

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

                    {/* Action Buttons */}
                    {canManageCourses ? (
                      /* Admin view - show Edit (if allowed) and View/Preview buttons */
                      <div className="flex gap-2">
                        {canEditThisCourse ? (
                          <button
                            onClick={() => navigate(`/courses/${course.id}/edit`)}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium min-h-[44px]"
                          >
                            <PencilSquareIcon className="w-5 h-5" />
                            Edit
                          </button>
                        ) : null}
                        <button
                          onClick={() => handleViewCourse(course.id)}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium min-h-[44px] ${
                            isDraft
                              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                              : 'bg-optio-purple/10 text-optio-purple hover:bg-optio-purple/20'
                          }`}
                        >
                          <EyeIcon className="w-5 h-5" />
                          {isDraft ? 'Preview' : 'View'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleViewCourse(course.id)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors font-medium min-h-[44px]"
                      >
                        <CheckCircleIcon className="w-5 h-5" />
                        View Course
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
