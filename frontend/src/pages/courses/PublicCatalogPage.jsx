import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import {
  MagnifyingGlassIcon,
  AcademicCapIcon,
  RocketLaunchIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import MarketingLayout from '../../components/marketing/MarketingLayout'
import CourseInterestModal from '../../components/marketing/CourseInterestModal'

const COURSE_PRICE = '$149'

const PEXELS = (id, w = 800) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`

const IMAGES = {
  // Teens outside, mid-laughter — the "off the computer" promise in one frame.
  hero: PEXELS(8033875, 1200),
  build: PEXELS(5974053),   // hands on a drill in a wood shop
  cook: PEXELS(4259140),    // family cooking together
  film: PEXELS(3062541),    // young crew running a real camera rig
}

// The honest-contrarian pitch: admit online courses are usually bad, then flip it.
const CoursesHero = () => {
  return (
    <div className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-optio-purple mb-3">
              Optio Courses
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-6">
              The online course that gets you{' '}
              <span className="bg-gradient-to-r from-optio-purple to-optio-pink bg-clip-text text-transparent">
                offline
              </span>
              .
            </h1>
            <p className="text-lg text-gray-600 mb-4">
              Let's be honest: most online courses aren't fun. Watch a video, take a
              quiz, collect the credit. Students click through them, and nobody
              remembers a thing.
            </p>
            <p className="text-lg text-gray-600 mb-8">
              We built Optio courses to do the opposite. Every course is designed to
              get kids <span className="font-semibold text-gray-900">off the computer and into the real world</span>:
              build something, interview someone, go somewhere, make something you're
              proud of. The screen is just the launchpad. And because the work happens
              in the real world, the whole family can join in. Siblings, parents,
              anyone.
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-gray-700">
              <span>Open to any age</span>
              <span className="text-gray-300" aria-hidden="true">|</span>
              <span>Great as a family activity</span>
              <span className="text-gray-300" aria-hidden="true">|</span>
              <span>High school credit available</span>
            </div>
          </div>
          <div className="relative">
            <img
              src={IMAGES.hero}
              alt="Teenagers outside in a park, laughing together"
              className="w-full h-72 sm:h-96 object-cover rounded-2xl shadow-lg"
              loading="eager"
            />
            <div className="absolute -bottom-4 left-6 bg-white rounded-xl shadow-lg px-4 py-3 border border-gray-100">
              <p className="text-sm font-semibold text-gray-900">Screen time required:</p>
              <p className="text-sm text-gray-600">about five minutes per project</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// What the work actually looks like — photos beat abstractions.
const RealWorldStrip = () => {
  const shots = [
    { src: IMAGES.build, alt: 'Hands driving a screw with a power drill in a wood shop', caption: 'Build it.' },
    { src: IMAGES.cook, alt: 'A family cooking together in their kitchen', caption: 'Cook it.' },
    { src: IMAGES.film, alt: 'A young film crew operating a professional camera outdoors', caption: 'Film it.' },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        {shots.map((shot) => (
          <figure key={shot.caption} className="relative rounded-xl overflow-hidden group">
            <img
              src={shot.src}
              alt={shot.alt}
              className="w-full h-48 sm:h-56 object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
            <figcaption className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-4 pt-8 pb-3">
              <span className="text-white font-bold text-lg">{shot.caption}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

// Editorial three-up: kicker + statement + copy, separated by rules. No icons.
const PhilosophyBanner = () => {
  const points = [
    {
      kicker: 'The screen',
      title: 'Five minutes on, five hours off',
      description: 'Lessons give just enough to start. The rest of the course happens away from the screen.',
    },
    {
      kicker: 'The work',
      title: 'You choose the work',
      description: 'Students pick real-world activities that match their interests, so motivation is built in.',
    },
    {
      kicker: 'The credit',
      title: 'Credit for doing, not watching',
      description: 'Every credit is backed by evidence of real work, not video watch time or quiz scores.',
    },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
      <div className="bg-white border border-gray-200 rounded-xl px-6 py-8 sm:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-200">
          {points.map((point) => (
            <div key={point.title} className="py-5 first:pt-0 last:pb-0 sm:py-0 sm:px-8 sm:first:pl-0 sm:last:pr-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-optio-purple mb-2">
                {point.kicker}
              </p>
              <h3 className="text-lg font-bold text-gray-900 leading-snug mb-2">{point.title}</h3>
              <p className="text-sm text-gray-600">{point.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Heads off the "wait, how is this different from Classes?" question directly.
const ClassesOrCourses = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
      <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 border border-optio-purple/10 rounded-xl p-6 sm:p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Classes or courses?</h2>
        <p className="text-gray-600 mb-6">
          Both earn real high school credit through work your student actually cares
          about. The difference is where the curriculum comes from.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="font-bold text-gray-900 mb-2">Classes: custom-built by your student</h3>
            <p className="text-sm text-gray-600 mb-3">
              Students design their own class in the Optio app, picking a subject
              like Math, English, or PE and building it from what they already love
              doing. An Optio teacher reviews the work. Your first class is free.
            </p>
            <Link
              to="/classes"
              className="text-sm font-semibold text-optio-purple hover:text-optio-pink transition-colors"
            >
              Explore classes &rarr;
            </Link>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="font-bold text-gray-900 mb-2">Courses: pre-designed, still personal</h3>
            <p className="text-sm text-gray-600 mb-3">
              A ready-made sequence of real-world projects with just enough
              instruction to launch each one. More structure than a class, but
              plenty of room to personalize; students choose how each project
              gets done. Pick one below and start today.
            </p>
            <a
              href="#course-list"
              className="text-sm font-semibold text-optio-purple hover:text-optio-pink transition-colors"
            >
              Browse the catalog &darr;
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

// Pricing band: individual price + interest capture, soft wholesale mention for orgs.
const PricingBand = ({ onGetCourse }) => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
      <div className="bg-white border border-gray-200 rounded-xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-3xl font-bold text-gray-900">{COURSE_PRICE}</span>
            <span className="text-gray-500">per course</span>
          </div>
          <p className="text-gray-600">
            Open to any age. Younger kids can team up with a sibling or parent and
            make it a family project. Older students earn real high school credit.
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Schools &amp; organizations: Optio courses are available at wholesale rates for your students.{' '}
            <Link to="/for-schools" className="text-optio-purple hover:text-optio-pink font-medium transition-colors">
              Learn more
            </Link>
          </p>
        </div>
        <button
          type="button"
          onClick={() => onGetCourse(null)}
          className="btn-primary btn-lg flex-shrink-0"
        >
          Get a course
        </button>
      </div>
    </div>
  )
}

const CourseCard = ({ course, onGetCourse }) => {
  const outcomes = course.learning_outcomes || []

  return (
    <Link
      to={`/course/${course.slug}`}
      className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-optio-purple/30 transition-all duration-200 flex flex-col"
    >
      {/* Cover Image */}
      {course.cover_image_url ? (
        <img
          src={course.cover_image_url}
          alt=""
          className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
        />
      ) : (
        <div className="w-full h-48 bg-gradient-primary flex items-center justify-center">
          <AcademicCapIcon className="w-16 h-16 text-white opacity-50" />
        </div>
      )}

      {/* Content */}
      <div className="p-6 flex flex-col flex-1">
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
          <div className="flex flex-wrap gap-2 mb-4">
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

        {/* Price + interest capture. Card is a Link, so keep the button from navigating. */}
        <div className="mt-auto pt-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <div className="leading-tight">
            <div className="font-bold text-gray-900">{COURSE_PRICE}</div>
            <div className="text-xs text-gray-500">Any age. HS credit available.</div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onGetCourse(course)
            }}
            className="px-4 py-2 bg-optio-purple text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
          >
            Get this course
          </button>
        </div>
      </div>
    </Link>
  )
}

const PublicCatalogPage = () => {
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [interestModal, setInterestModal] = useState({ open: false, course: null })

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

  const openInterestModal = (course) => setInterestModal({ open: true, course })
  const closeInterestModal = () => setInterestModal({ open: false, course: null })

  // Filter courses based on search term
  const filteredCourses = courses.filter(course => {
    const searchLower = searchTerm.toLowerCase()
    return (
      course.title?.toLowerCase().includes(searchLower) ||
      course.description?.toLowerCase().includes(searchLower)
    )
  })

  return (
    <MarketingLayout>
      <Helmet>
        <title>Courses | Optio</title>
        <meta name="description" content="Optio courses get kids off the computer and into the real world. Project courses for any age, great as a family activity, with high school credit available for older students." />
        <meta property="og:title" content="Courses | Optio" />
        <meta property="og:description" content="The online course that gets you offline. Real-world project courses for any age, with high school credit available." />
        <meta property="og:url" content="https://www.optioeducation.com/catalog" />
        <link rel="canonical" href="https://www.optioeducation.com/catalog" />
      </Helmet>

      <div className="min-h-screen bg-gray-50">
        {/* Skip link for keyboard users */}
        <a href="#course-list" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-optio-purple focus:rounded-lg focus:shadow-lg">
          Skip to course list
        </a>

        {/* Hero */}
        <CoursesHero />

        {/* What the work looks like */}
        <RealWorldStrip />

        {/* Learning Philosophy */}
        <PhilosophyBanner />

        {/* Classes vs Courses */}
        <ClassesOrCourses />

        {/* Pricing */}
        <PricingBand onGetCourse={openInterestModal} />

        {/* Search */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
          <div className="flex items-center gap-3 mb-2">
            <AcademicCapIcon className="w-7 h-7 text-optio-purple" />
            <h2 className="text-2xl font-bold text-gray-900">Course Catalog</h2>
          </div>
          <div className="mt-4 relative max-w-md">
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
                <CourseCard key={course.id} course={course} onGetCourse={openInterestModal} />
              ))}
            </div>
          )}
        </div>

        {/* Course purchase interest capture */}
        <CourseInterestModal
          open={interestModal.open}
          course={interestModal.course}
          onClose={closeInterestModal}
        />
      </div>
    </MarketingLayout>
  )
}

export default PublicCatalogPage
