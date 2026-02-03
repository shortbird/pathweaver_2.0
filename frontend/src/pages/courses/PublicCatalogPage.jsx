import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import {
  MagnifyingGlassIcon,
  AcademicCapIcon,
  RocketLaunchIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'

const OPTIO_LOGO_URL = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg'

// Floating "New to Optio" button component
const FloatingNewToOptioButton = () => {
  return (
    <Link
      to="/how-it-works"
      className="hidden sm:block fixed bottom-6 right-6 z-40"
      aria-label="Learn how Optio works"
    >
      <div
        className="
          flex items-center gap-3 px-5 py-4 rounded-full shadow-lg
          bg-white border-2 border-optio-purple
          text-optio-purple font-semibold
          transform transition-all duration-300 ease-out
          hover:shadow-xl hover:scale-105
        "
      >
        <img src={OPTIO_LOGO_URL} alt="" className="w-7 h-7 flex-shrink-0" />
        <span className="flex flex-col leading-tight">
          <span className="text-sm">New to Optio?</span>
          <span className="text-xs font-normal text-gray-500">Click to learn more</span>
        </span>
      </div>
    </Link>
  )
}

const CourseCard = ({ course }) => {
  const outcomes = course.learning_outcomes || []

  return (
    <Link
      to={`/course/${course.slug}`}
      className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-optio-purple/30 transition-all duration-200"
    >
      {/* Cover Image */}
      {course.cover_image_url ? (
        <img
          src={course.cover_image_url}
          alt=""
          className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
        />
      ) : (
        <div className="w-full h-48 bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center">
          <AcademicCapIcon className="w-16 h-16 text-white opacity-50" />
        </div>
      )}

      {/* Content */}
      <div className="p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2 group-hover:text-optio-purple transition-colors">
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
            <span>{course.quest_count || 0} project{course.quest_count !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Learning Outcomes Preview */}
        {outcomes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {outcomes.slice(0, 2).map((outcome, index) => (
              <span
                key={index}
                className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full"
              >
                {outcome.length > 30 ? outcome.substring(0, 30) + '...' : outcome}
              </span>
            ))}
            {outcomes.length > 2 && (
              <span className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded-full">
                +{outcomes.length - 2} more
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}

const PublicCatalogPage = () => {
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        setLoading(true)
        const response = await api.get('/api/public/courses')
        setCourses(response.data.courses || [])
      } catch (err) {
        console.error('Failed to load courses:', err)
        setError('Failed to load courses')
      } finally {
        setLoading(false)
      }
    }

    fetchCourses()
  }, [])

  // Filter courses based on search term
  const filteredCourses = courses.filter(course => {
    const searchLower = searchTerm.toLowerCase()
    return (
      course.title?.toLowerCase().includes(searchLower) ||
      course.description?.toLowerCase().includes(searchLower)
    )
  })

  return (
    <>
      <Helmet>
        <title>Course Catalog | Optio Education</title>
        <meta name="description" content="Browse self-directed learning courses at Optio Education. Project-based learning for homeschoolers and independent learners." />
        <meta property="og:title" content="Course Catalog | Optio Education" />
        <meta property="og:description" content="Browse self-directed learning courses. Project-based education that builds real skills." />
        <meta property="og:url" content="https://www.optioeducation.com/catalog" />
        <link rel="canonical" href="https://www.optioeducation.com/catalog" />
      </Helmet>

      <div className="min-h-screen bg-gray-50 -mt-12 sm:mt-0">
        {/* Skip link for keyboard users */}
        <a href="#course-list" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-optio-purple focus:rounded-lg focus:shadow-lg">
          Skip to course list
        </a>

        {/* Header */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <AcademicCapIcon className="w-8 h-8 text-optio-purple" />
                <h1 className="text-3xl font-bold text-gray-900">Course Catalog</h1>
              </div>
              <p className="text-gray-600">
                Explore self-directed courses built around real projects
              </p>
            </div>

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
        <div id="course-list" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            <div aria-busy="true">
              <div className="sr-only" role="status">Loading courses...</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" aria-hidden="true">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
                    <div className="h-48 bg-gray-200" />
                    <div className="p-6 space-y-3">
                      <div className="h-6 bg-gray-200 rounded w-3/4" />
                      <div className="h-4 bg-gray-200 rounded w-full" />
                      <div className="h-4 bg-gray-200 rounded w-2/3" />
                      <div className="h-4 bg-gray-200 rounded w-1/2 mt-4" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <AcademicCapIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to load courses</h3>
              <p className="text-gray-600 mb-4">Please try again later</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-optio-purple text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
              >
                Try Again
              </button>
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="text-center py-12">
              <AcademicCapIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm ? 'No courses found' : 'No courses available'}
              </h3>
              <p className="text-gray-600 mb-6">
                {searchTerm
                  ? 'Try adjusting your search terms'
                  : 'Check back soon for new learning opportunities'}
              </p>
              <Link
                to="/how-it-works"
                className="inline-flex items-center gap-2 text-optio-purple hover:text-optio-pink font-medium transition-colors"
              >
                Learn how Optio works
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCourses.map(course => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          )}
        </div>

        {/* Mobile CTA */}
        <div className="sm:hidden px-4 pb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
            <h2 className="font-semibold text-gray-900 mb-2">Ready to start learning?</h2>
            <p className="text-sm text-gray-600 mb-4">Create a free account to enroll in courses</p>
            <div className="flex flex-col gap-2">
              <Link
                to="/register"
                className="w-full px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity font-medium text-center"
              >
                Create Account
              </Link>
              <Link
                to="/login"
                className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-center"
              >
                Sign In
              </Link>
            </div>
          </div>

          {/* Mobile "New to Optio" link */}
          <div className="mt-6 text-center">
            <Link
              to="/how-it-works"
              className="inline-flex items-center gap-1 text-sm text-optio-purple font-medium underline underline-offset-2"
            >
              New to Optio? Learn how it works
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Floating "New to Optio" button */}
        <FloatingNewToOptioButton />
      </div>
    </>
  )
}

export default PublicCatalogPage
