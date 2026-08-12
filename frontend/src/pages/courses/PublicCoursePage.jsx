import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import api from '../../services/api'
import MarketingLayout from '../../components/marketing/MarketingLayout'
import CourseInterestModal from '../../components/marketing/CourseInterestModal'

const COURSE_PRICE = '$149'

// Icons (decorative - hidden from screen readers)
const CheckIcon = ({ className = "w-5 h-5 flex-shrink-0 mt-0.5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const XIcon = ({ className = "w-5 h-5 flex-shrink-0 mt-0.5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const BackArrowIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
)

// In-page back control. Pops in-app history when there is some (preserves the
// catalog's scroll position); deep links land on /catalog instead.
const BackToCourses = ({ className = '' }) => {
  const navigate = useNavigate()

  const handleBack = () => {
    const idx = window.history.state?.idx ?? 0
    if (idx > 0) {
      navigate(-1)
    } else {
      navigate('/catalog')
    }
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className={`inline-flex items-center gap-1.5 text-sm font-semibold rounded-full px-4 py-2 bg-white/90 text-gray-800 shadow-sm hover:bg-white transition-colors ${className}`}
    >
      <BackArrowIcon />
      Back to Courses
    </button>
  )
}

const LearningApproachSection = () => {
  const traditional = [
    'Watch video lessons on a screen',
    'Take quizzes to prove retention',
    'Same assignments for every student',
    'Learning happens at the computer',
  ]

  const optio = [
    'Brief overview to get you started',
    'Real-world activities you choose yourself',
    'Personalized projects based on your interests',
    'Learning happens in the real world',
  ]

  return (
    <section className="mb-10" aria-labelledby="approach-heading">
      <h2 id="approach-heading" className="text-2xl font-bold text-gray-900 mb-4">
        What to Expect
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Traditional column */}
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-500 mb-4">Traditional Online Course</h3>
          <ul className="space-y-3" role="list">
            {traditional.map((item) => (
              <li key={item} className="flex items-start gap-2 text-gray-400">
                <XIcon className="w-5 h-5 flex-shrink-0 mt-0.5 text-gray-300" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Optio column */}
        <div className="bg-gradient-to-br from-optio-purple/5 to-optio-pink/5 rounded-xl border border-optio-purple/20 p-6">
          <h3 className="font-semibold text-optio-purple mb-4">An Optio Course</h3>
          <ul className="space-y-3" role="list">
            {optio.map((item) => (
              <li key={item} className="flex items-start gap-2 text-gray-700">
                <CheckIcon className="w-5 h-5 flex-shrink-0 mt-0.5 text-optio-purple" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

const ParentGuidanceSection = ({ guidance, cleanText }) => {
  const ageGroups = [
    { key: 'ages_5_9', label: 'Ages 5-9' },
    { key: 'ages_10_14', label: 'Ages 10-14' },
    { key: 'ages_15_18', label: 'Ages 15-18' },
  ].filter(g => guidance[g.key])

  const [activeGroup, setActiveGroup] = useState(ageGroups[0]?.key || '')

  if (ageGroups.length === 0) return null

  return (
    <section className="mb-10" aria-labelledby="parents-heading">
      <h2 id="parents-heading" className="text-2xl font-bold text-gray-900 mb-4">
        Tips for Parents
      </h2>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {ageGroups.map((group) => (
            <button
              key={group.key}
              onClick={() => setActiveGroup(group.key)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeGroup === group.key
                  ? 'text-optio-purple border-b-2 border-optio-purple bg-optio-purple/5'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {group.label}
            </button>
          ))}
        </div>
        {/* Content */}
        <div className="p-6">
          <p className="text-gray-600 leading-relaxed">
            {cleanText(guidance[activeGroup])}
          </p>
        </div>
      </div>
    </section>
  )
}

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

  const [course, setCourse] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [interestOpen, setInterestOpen] = useState(false)

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


  if (loading) {
    return (
      <MarketingLayout>
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
      </MarketingLayout>
    )
  }

  if (error) {
    return (
      <MarketingLayout>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{error}</h1>
            <p className="text-gray-600 mb-6">
              This course may be private or no longer available.
            </p>
            <button
              type="button"
              onClick={() => navigate('/catalog')}
              className="btn-primary"
            >
              Browse Courses
            </button>
          </div>
        </div>
      </MarketingLayout>
    )
  }

  const learningOutcomes = course?.learning_outcomes || []
  const quests = course?.quests || []

  return (
    <MarketingLayout>
      <Helmet>
        <title>{course.title} | Optio</title>
        <meta name="description" content={course.description || `Learn ${course.title} at Optio`} />
        <meta property="og:title" content={`${course.title} | Optio`} />
        <meta property="og:description" content={course.description} />
        {course.cover_image_url && <meta property="og:image" content={course.cover_image_url} />}
        <meta property="og:url" content={`https://www.optioeducation.com/course/${course.slug}`} />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={`https://www.optioeducation.com/course/${course.slug}`} />
      </Helmet>

      <main className="min-h-screen bg-gray-50">
        {/* Skip link for keyboard users */}
        <a href="#course-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-optio-purple focus:rounded-lg focus:shadow-lg">
          Skip to course content
        </a>

        {/* Hero Section - Full-bleed cover image */}
        <div className="relative min-h-[320px] sm:min-h-[400px] lg:min-h-[480px] flex items-end">
          {/* Background: cover image or gradient fallback */}
          {course.cover_image_url ? (
            <img
              src={course.cover_image_url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-primary" />
          )}
          {/* Dark overlay for text legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/30" />
          {/* Back button */}
          <div className="absolute top-4 left-4 sm:top-6 sm:left-6 z-20">
            <BackToCourses />
          </div>
          {/* Content */}
          <div className="relative z-10 w-full max-w-4xl mx-auto px-4 pb-8 sm:pb-12 pt-24 sm:pt-32 text-white">
            {course.organization_name && (
              <p className="text-sm sm:text-base text-white/80 mb-2">
                {course.organization_name}
              </p>
            )}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold">
              {course.title}
            </h1>
            {course.description && (
              <p className="mt-3 text-base sm:text-lg text-white/90 max-w-2xl">
                {course.description}
              </p>
            )}
            {/* Facts + CTA */}
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
              <button
                type="button"
                onClick={() => setInterestOpen(true)}
                className="btn-primary"
              >
                Get this course · {COURSE_PRICE}
              </button>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/90">
                {quests.length > 0 && (
                  <span>{quests.length} real-world project{quests.length !== 1 ? 's' : ''}</span>
                )}
                <span>Any age</span>
                <span>HS credit available</span>
              </div>
            </div>
          </div>
        </div>

        <div id="course-content" className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
          {/* What You'll Do */}
          {learningOutcomes.length > 0 && (
            <section className="mb-10" aria-labelledby="outcomes-heading">
              <h2 id="outcomes-heading" className="text-2xl font-bold text-gray-900 mb-4">
                What You'll Do
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <ul className="space-y-3" role="list">
                  {learningOutcomes.map((outcome, index) => (
                    <li key={index} className="flex items-start gap-2 text-gray-700">
                      <CheckIcon className="w-5 h-5 flex-shrink-0 mt-0.5 text-optio-purple" />
                      <span>{cleanText(outcome)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* Who This Course Is For */}
          {course.target_audience && (
            <section className="mb-10" aria-labelledby="audience-heading">
              <h2 id="audience-heading" className="text-2xl font-bold text-gray-900 mb-4">
                Who This Course Is For
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <p className="text-gray-700 leading-relaxed">
                  {cleanText(course.target_audience)}
                </p>
              </div>
            </section>
          )}

          {/* What You'll Create */}
          {course.final_deliverable && (
            <section className="mb-10" aria-labelledby="deliverable-heading">
              <h2 id="deliverable-heading" className="text-2xl font-bold text-gray-900 mb-4">
                What You'll Create
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <p className="text-gray-700 leading-relaxed">
                  {cleanText(course.final_deliverable)}
                </p>
              </div>
            </section>
          )}

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

          {/* Learning Approach Comparison */}
          <LearningApproachSection />

          {/* How Progress Works */}
          {course.progress_model && (
            <section className="mb-10" aria-labelledby="progress-heading">
              <h2 id="progress-heading" className="text-2xl font-bold text-gray-900 mb-4">
                How Progress Works
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <p className="text-gray-700 leading-relaxed">
                  {cleanText(course.progress_model)}
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
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4" role="list">
                {quests.map((quest, index) => (
                  <li
                    key={quest.id}
                    className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-optio-purple/30 hover:shadow-md transition-all flex flex-col"
                  >
                    {/* Project image */}
                    {quest.header_image_url ? (
                      <img
                        src={quest.header_image_url}
                        alt=""
                        className="w-full h-36 object-cover"
                      />
                    ) : (
                      <div className="w-full h-36 bg-gradient-primary flex items-center justify-center" aria-hidden="true">
                        <span className="text-4xl font-bold text-white">{index + 1}</span>
                      </div>
                    )}
                    {/* Project content */}
                    <div className="p-4 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-optio-purple mb-1">
                        Project {index + 1}
                      </p>
                      <h3 className="font-semibold text-gray-900">
                        {quest.title}
                      </h3>
                      {quest.description && (
                        <p className="mt-1.5 text-sm text-gray-600">
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
            <ParentGuidanceSection guidance={course.parent_guidance} cleanText={cleanText} />
          )}

          {/* Closing CTA */}
          <section aria-labelledby="cta-heading">
            <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 border border-optio-purple/10 rounded-xl p-6 sm:p-8 text-center">
              <h2 id="cta-heading" className="text-2xl font-bold text-gray-900 mb-2">
                Ready to start?
              </h2>
              <p className="text-gray-600 max-w-xl mx-auto mb-6">
                {COURSE_PRICE} per course. Open to any age, with high school credit
                available. Younger kids can make it a family project.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setInterestOpen(true)}
                  className="btn-primary btn-lg"
                >
                  Get this course
                </button>
                <Link
                  to="/catalog"
                  className="px-6 py-3 text-sm font-semibold text-optio-purple hover:text-optio-pink transition-colors"
                >
                  Browse all courses
                </Link>
              </div>
            </div>
          </section>
        </div>

        {/* Course purchase interest capture */}
        <CourseInterestModal
          open={interestOpen}
          course={course}
          onClose={() => setInterestOpen(false)}
          source="course_page"
        />
      </main>
    </MarketingLayout>
  )
}

export default PublicCoursePage
