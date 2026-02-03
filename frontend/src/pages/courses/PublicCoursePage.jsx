import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import Button from '../../components/ui/Button'

const OPTIO_LOGO_URL = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg'

// Floating "New to Optio" button component (always expanded)
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

// Icons (decorative - hidden from screen readers)
const ArrowRightIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
  </svg>
)

const CheckIcon = () => (
  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

// Strip HTML tags and markdown formatting from text
const cleanText = (text) => {
  if (!text) return ''
  return text
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove markdown bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Clean up extra whitespace
    .replace(/\s+/g, ' ')
    .trim()
}

const PublicCoursePage = () => {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()

  const [course, setCourse] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [enrolling, setEnrolling] = useState(false)

  useEffect(() => {
    const fetchCourse = async () => {
      try {
        setLoading(true)
        const response = await api.get(`/api/public/courses/${slug}`)
        setCourse(response.data.course)
      } catch (err) {
        console.error('Failed to load course:', err)
        if (err.response?.status === 404) {
          setError('Course not found')
        } else {
          setError('Failed to load course')
        }
      } finally {
        setLoading(false)
      }
    }

    fetchCourse()
  }, [slug])

  const handleEnroll = async () => {
    if (!isAuthenticated) {
      // Redirect to login with return URL
      navigate(`/login?redirect=/course/${slug}`)
      return
    }

    try {
      setEnrolling(true)
      await api.post(`/api/courses/${course.id}/enroll`, {})
      // Redirect to course homepage
      navigate(`/courses/${course.id}`)
    } catch (err) {
      console.error('Failed to enroll:', err)
      // If already enrolled, just redirect
      if (err.response?.data?.message === 'Already enrolled') {
        navigate(`/courses/${course.id}`)
      }
    } finally {
      setEnrolling(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50" aria-busy="true">
        <div className="sr-only" role="status">Loading course...</div>
        <div className="animate-pulse" aria-hidden="true">
          {/* Hero skeleton */}
          <div className="h-64 bg-gray-200" />
          <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="h-8 bg-gray-200 rounded w-1/2 mb-4" />
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
            <div className="h-4 bg-gray-200 rounded w-2/3" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{error}</h1>
          <p className="text-gray-600 mb-6">
            This course may be private or no longer available.
          </p>
          <Button onClick={() => navigate('/catalog')}>
            Browse Courses
          </Button>
        </div>
      </div>
    )
  }

  const learningOutcomes = course?.learning_outcomes || []
  const quests = course?.quests || []

  return (
    <>
      <Helmet>
        <title>{course.title} | Optio Education</title>
        <meta name="description" content={course.description || `Learn ${course.title} at Optio Education`} />
        <meta property="og:title" content={`${course.title} | Optio Education`} />
        <meta property="og:description" content={course.description} />
        {course.cover_image_url && <meta property="og:image" content={course.cover_image_url} />}
        <meta property="og:url" content={`https://www.optioeducation.com/course/${course.slug}`} />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={`https://www.optioeducation.com/course/${course.slug}`} />
      </Helmet>

      <main className="min-h-screen bg-gray-50 -mt-12 sm:mt-0">
        {/* Skip link for keyboard users */}
        <a href="#course-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-optio-purple focus:rounded-lg focus:shadow-lg">
          Skip to course content
        </a>

        {/* Hero Section */}
        <div className="bg-gradient-to-r from-optio-purple to-optio-pink">
          <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12 text-white">
            {/* Title */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-8">
              {course.title}
            </h1>

            {/* Image and description in 2 columns */}
            <div className="flex flex-col lg:flex-row gap-8 items-start">
              {/* Course image */}
              {course.cover_image_url && (
                <div className="w-full lg:w-[400px] flex-shrink-0">
                  <img
                    src={course.cover_image_url}
                    alt={course.title}
                    className="w-full h-auto rounded-xl shadow-2xl"
                  />
                </div>
              )}

              {/* Description and learning outcomes */}
              <div className="flex-1">
                {course.description && (
                  <p className="text-lg sm:text-xl text-white">
                    {course.description}
                  </p>
                )}

                {course.organization_name && (
                  <p className="mt-4 text-white">
                    Offered by <span className="font-medium">{course.organization_name}</span>
                  </p>
                )}

                {/* What You'll Do */}
                {learningOutcomes.length > 0 && (
                  <div className="mt-6">
                    <h2 className="text-lg font-semibold mb-3">What You'll Do</h2>
                    <ul className="space-y-2" role="list">
                      {learningOutcomes.map((outcome, index) => (
                        <li key={index} className="flex items-start gap-2 text-white">
                          <CheckIcon />
                          <span>{cleanText(outcome)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div id="course-content" className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
          {/* Educational Value */}
          {course.educational_value && (
            <section className="mb-10" aria-labelledby="why-heading">
              <h2 id="why-heading" className="text-2xl font-bold text-gray-900 mb-4">
                Why This Course?
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <p className="text-gray-700 leading-relaxed">
                  {cleanText(course.educational_value)}
                </p>
              </div>
            </section>
          )}

          {/* Projects Overview */}
          {quests.length > 0 && (
            <section className="mb-10" aria-labelledby="projects-heading">
              <h2 id="projects-heading" className="text-2xl font-bold text-gray-900 mb-4">
                Course Projects
              </h2>
              <ul className="space-y-6" role="list">
                {quests.map((quest, index) => (
                  <li
                    key={quest.id}
                    className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-optio-purple/30 transition-colors"
                  >
                    {/* Project image */}
                    {quest.header_image_url ? (
                      <img
                        src={quest.header_image_url}
                        alt=""
                        className="w-full h-48 object-cover"
                      />
                    ) : (
                      <div className="w-full h-48 bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center" aria-hidden="true">
                        <span className="text-5xl font-bold text-white">{index + 1}</span>
                      </div>
                    )}
                    {/* Project content */}
                    <div className="p-5">
                      <h3 className="font-semibold text-gray-900 text-lg">
                        {quest.title}
                      </h3>
                      {quest.description && (
                        <p className="mt-2 text-gray-600">
                          {cleanText(quest.description)}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Parent Guidance by Age */}
          {course.parent_guidance && (course.parent_guidance.ages_5_9 || course.parent_guidance.ages_10_14 || course.parent_guidance.ages_15_18) && (
            <section className="mb-10" aria-labelledby="parents-heading">
              <h2 id="parents-heading" className="text-2xl font-bold text-gray-900 mb-4">
                Tips for Parents
              </h2>
              <div className="space-y-4">
                {course.parent_guidance.ages_5_9 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-900 mb-2">Ages 5-9</h3>
                    <p className="text-gray-600 leading-relaxed">
                      {cleanText(course.parent_guidance.ages_5_9)}
                    </p>
                  </div>
                )}
                {course.parent_guidance.ages_10_14 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-900 mb-2">Ages 10-14</h3>
                    <p className="text-gray-600 leading-relaxed">
                      {cleanText(course.parent_guidance.ages_10_14)}
                    </p>
                  </div>
                )}
                {course.parent_guidance.ages_15_18 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-900 mb-2">Ages 15-18</h3>
                    <p className="text-gray-600 leading-relaxed">
                      {cleanText(course.parent_guidance.ages_15_18)}
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Enroll CTA */}
          <section className="sticky bottom-0 bg-gray-50 py-4 border-t border-gray-200 -mx-4 px-4 sm:relative sm:border-0 sm:mx-0 sm:px-0 sm:py-0">
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
              <Button
                onClick={handleEnroll}
                disabled={enrolling}
                className="w-full sm:w-auto px-8 py-3 text-lg"
              >
                {enrolling ? 'Enrolling...' : isAuthenticated ? 'Enroll Now' : 'Sign Up to Enroll'}
              </Button>

              {!isAuthenticated && (
                <p className="text-sm text-gray-600">
                  Already have an account?{' '}
                  <Link to={`/login?redirect=/course/${slug}`} className="text-optio-purple hover:underline">
                    Sign in
                  </Link>
                </p>
              )}

              {/* Mobile-only "New to Optio" link */}
              <Link
                to="/how-it-works"
                className="sm:hidden inline-flex items-center gap-1 text-sm text-optio-purple font-medium underline underline-offset-2"
              >
                New to Optio? Learn how it works
                <ArrowRightIcon />
              </Link>
            </div>
          </section>
        </div>

        {/* Floating "New to Optio" button - hidden on mobile to avoid covering enroll button */}
        <FloatingNewToOptioButton />
      </main>
    </>
  )
}

export default PublicCoursePage
