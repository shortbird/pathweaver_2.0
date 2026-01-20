import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  XMarkIcon,
  BookOpenIcon,
  ArrowRightIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline'
import LandingPageHero from '../components/landing/LandingPageHero'
import { useHomepageImages, getImageUrl } from '../hooks/useHomepageImages'
import {
  OrganizationFeaturesSection,
  PlatformCapabilitiesSection,
  FamilyValueSection,
  PricingOverviewSection,
  VELASection,
} from '../components/homepage'

const HomePage = () => {
  const { isAuthenticated, user, loading } = useAuth()
  const navigate = useNavigate()
  const [philosophyModalOpen, setPhilosophyModalOpen] = useState(false)
  const { images, loading: imagesLoading } = useHomepageImages()
  const [openFaq, setOpenFaq] = useState(null)

  // Intersection Observer for scroll animations
  const [visibleSections, setVisibleSections] = useState(new Set())
  const sectionRefs = useRef({})

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleSections((prev) => new Set([...prev, entry.target.dataset.section]))
          }
        })
      },
      { threshold: 0.1, rootMargin: '50px' }
    )

    Object.values(sectionRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref)
    })

    return () => observer.disconnect()
  }, [])

  const goToDemo = () => {
    navigate('/demo')
  }

  const goToDemoRequest = () => {
    navigate('/contact?type=demo')
  }

  // Redirect authenticated users to their appropriate dashboard
  useEffect(() => {
    const currentPath = window.location.pathname
    const searchParams = new URLSearchParams(window.location.search)
    const hasAuthCode = searchParams.has('code')

    if (currentPath === '/auth/callback' || hasAuthCode) {
      return
    }

    if (!loading && isAuthenticated && user) {
      if (user.role === 'observer') {
        navigate('/observer/feed')
      } else if (user.role === 'parent') {
        navigate('/parent/dashboard')
      } else if (user.role === 'student' || user.role === 'advisor' || user.role === 'org_admin' || user.role === 'superadmin' || user.role === 'org_managed') {
        navigate('/dashboard')
      }
    }
  }, [isAuthenticated, user, navigate, loading])

  const isVisible = (section) => visibleSections.has(section)

  // FAQ data - mixed audience questions
  const faqItems = [
    {
      question: 'How are diplomas accredited?',
      answer: 'We partner with established accredited institutions to issue official high school diplomas and college credits. Optio provides the learning platform and portfolio system, while our partner institutions review student work and issue credentials based on their accreditation standards. This ensures your credentials are recognized by colleges, employers, and institutions nationwide.',
    },
    {
      question: "What's the difference between family and organization accounts?",
      answer: 'Family accounts are designed for individual homeschool families with 1-5 students. Organization accounts are built for microschools, learning centers, and co-ops with 5-500+ students. Organizations get additional features like student management dashboards, custom branding, LTI integration, and dedicated support. Both have access to the same core learning platform, portfolio system, and accreditation pathways.',
    },
    {
      question: 'Can individual families upgrade to organization accounts as they grow?',
      answer: 'Yes! Many of our learning communities started as small homeschool families and grew into microschools. We make it easy to transition from a family account to an organization account while preserving all student portfolios and progress data. Contact our team to discuss the best timing for your community.',
    },
    {
      question: 'How does the automatic portfolio work?',
      answer: "As students complete quest tasks, their work (essays, projects, videos, photos) automatically flows into their portfolio. No manual uploading, no extra steps. You document once, and it instantly becomes part of their professional showcase ready to share with colleges and employers.",
    },
    {
      question: 'What are quests and how do we create them?',
      answer: "Quests are learning adventures aligned with student interests. You can create custom quests based on your family's or school's goals, choose from Optio's library, or let students propose ideas. Each quest has tasks that earn XP across five learning pillars: STEM, Wellness, Communication, Civics, and Art.",
    },
    {
      question: 'Can extended family members see student work?',
      answer: 'Yes! You can invite grandparents, mentors, and other trusted adults as "observers." They get read-only access to cheer progress, leave encouragement, and stay connected to the learning journey, transforming education into a shared family experience.',
    },
    {
      question: 'How does dual-enrollment work with your partner institutions?',
      answer: 'Students can earn college credit while completing high school requirements. When students finish coursework, our accredited partner institutions review their work and award transferable college credits. These credits can be applied to associate degrees or transferred to 4-year programs, helping students save thousands on tuition and get ahead in their academic journey.',
    },
    {
      question: 'What happens to work my child has already done?',
      answer: 'You can manually upload past work to their portfolio to give context and show growth over time. While current work flows in automatically, we make it easy to backfill evidence of previous learning so the full story is told.',
    },
  ]

  return (
    <div className="min-h-screen">
      {/* Skip link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-optio-purple text-white px-4 py-2 rounded z-50"
        style={{ fontFamily: 'Poppins', fontWeight: 600 }}
      >
        Skip to main content
      </a>

      {/* Hero Section - B2B Focused */}
      {!isAuthenticated && (
        <LandingPageHero
          title="Personalized Learning."
          gradientTitle="Official Credentials."
          staticSubtitle="Where self-directed learning meets accredited diplomas."
          ctaText="GET MORE INFO"
          onCtaClick={goToDemoRequest}
          backgroundImage="https://auth.optioeducation.com/storage/v1/object/public/site-assets/homepage/hero_real.jpg"
          mobileBackgroundImage="https://auth.optioeducation.com/storage/v1/object/public/site-assets/homepage/hero_real.jpg"
          backgroundPosition="calc(100% + 300px)"
          splitLayout={true}
          textAlign="left"
          secondaryCta={{
            text: "SEE HOW IT WORKS",
            onClick: goToDemo
          }}
        />
      )}

      {/* What is Optio Section */}
      <div className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2
              className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              Optio is a platform that aligns student-directed learning with official credentials.
            </h2>
            <p
              className="text-lg text-gray-600"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              For individual learners, homeschool families, microschools, and school districts.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Personalized Quests */}
            <div className="group p-6 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
              {/* Visual: Interest chips flowing into quest card */}
              <div className="flex flex-col items-center mb-4">
                <div className="flex flex-wrap justify-center gap-1.5 mb-2">
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 rounded-full">Gaming</span>
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded-full">Music</span>
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 rounded-full">Sports</span>
                </div>
                <svg className="w-4 h-4 text-optio-purple/40 my-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                <div className="w-full max-w-[140px] p-2 rounded-lg bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 border border-optio-purple/20">
                  <div className="h-1.5 w-3/4 bg-optio-purple/30 rounded mb-1"></div>
                  <div className="h-1 w-1/2 bg-optio-purple/20 rounded"></div>
                </div>
              </div>
              <h3
                className="text-xl font-bold text-gray-900 mb-2 text-center"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                Personalized Quests
              </h3>
              <p
                className="text-gray-600 text-center"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                Turn student interests into engaging learning experiences
              </p>
            </div>

            {/* Automatic Portfolios */}
            <div className="group p-6 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
              {/* Visual: Stacked portfolio cards */}
              <div className="flex justify-center mb-4">
                <div className="relative w-32 h-20">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-14 rounded-lg bg-gradient-to-br from-optio-purple/20 to-optio-pink/20 border border-optio-purple/30 shadow-sm"></div>
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-14 rounded-lg bg-gradient-to-br from-optio-purple/15 to-optio-pink/15 border border-optio-purple/20 shadow-sm"></div>
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 w-20 h-14 rounded-lg bg-white border border-gray-200 shadow-md flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-8 h-6 bg-gray-100 rounded mx-auto mb-1"></div>
                      <div className="h-1 w-10 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                </div>
              </div>
              <h3
                className="text-xl font-bold text-gray-900 mb-2 text-center"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                Automatic Portfolios
              </h3>
              <p
                className="text-gray-600 text-center"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                Capture student work as they learn, no extra steps
              </p>
            </div>

            {/* Accredited Credentials */}
            <div className="group p-6 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
              {/* Visual: Diploma/certificate with seal */}
              <div className="flex justify-center mb-4">
                <div className="relative">
                  <div className="w-28 h-20 rounded-lg bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 shadow-sm p-2">
                    <div className="h-1.5 w-16 bg-amber-300/50 rounded mx-auto mb-1.5"></div>
                    <div className="h-1 w-12 bg-amber-200/50 rounded mx-auto mb-1"></div>
                    <div className="h-1 w-14 bg-amber-200/50 rounded mx-auto mb-2"></div>
                    <div className="h-1 w-8 bg-amber-300/50 rounded mx-auto"></div>
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center shadow-md">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              </div>
              <h3
                className="text-xl font-bold text-gray-900 mb-2 text-center"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                Accredited Credentials
              </h3>
              <p
                className="text-gray-600 text-center"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                Award official credit for real-world learning
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* VELA Grant */}
      <div
        ref={(el) => (sectionRefs.current.vela = el)}
        data-section="vela"
      >
        <VELASection isVisible={isVisible('vela')} />
      </div>

      {/* For Schools & Organizations */}
      <div
        id="main-content"
        ref={(el) => (sectionRefs.current.orgFeatures = el)}
        data-section="orgFeatures"
      >
        <OrganizationFeaturesSection isVisible={isVisible('orgFeatures')} />
      </div>

      {/* Platform Capabilities */}
      <div
        ref={(el) => (sectionRefs.current.capabilities = el)}
        data-section="capabilities"
      >
        <PlatformCapabilitiesSection isVisible={isVisible('capabilities')} />
      </div>

      {/* Section 5: Also Perfect For Families - Scroll target */}
      <div
        id="for-families"
        ref={(el) => (sectionRefs.current.families = el)}
        data-section="families"
      >
        <FamilyValueSection
          isVisible={isVisible('families')}
          testimonial={{
            quote: "My husband and I feel like Optio was created just for us. We homeschool our 7 kids and this is the perfect platform to track all the unique types of learning we do in our family.",
            author: "Paige H.",
            role: "Homeschool Parent, Utah"
          }}
        />
      </div>

      {/* Section 6: Philosophy Section */}
      <div
        ref={(el) => (sectionRefs.current.philosophy = el)}
        data-section="philosophy"
        className={`relative py-32 bg-cover bg-center transition-all duration-1000 ${
          isVisible('philosophy') ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          backgroundImage: `url(${getImageUrl(images, 'philosophy_hero', '')})`,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/70"></div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2
            className="text-4xl sm:text-5xl font-bold text-white mb-6"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            The Process Is The Goal
          </h2>
          <p
            className="text-xl text-white/95 mb-8 leading-relaxed"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Learning is not about reaching a destination or impressing others. It's about who you become through the journey of discovery, creation, and growth.
          </p>
          <button
            onClick={() => setPhilosophyModalOpen(true)}
            className="inline-flex items-center justify-center bg-white text-optio-purple hover:bg-gray-100 px-8 py-4 rounded-lg font-bold text-lg shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all min-h-[44px] w-full sm:w-auto max-w-md mx-auto"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            Learn More About Our Philosophy
          </button>
        </div>
      </div>

      {/* Section 9: Pricing Overview */}
      <div
        ref={(el) => (sectionRefs.current.pricing = el)}
        data-section="pricing"
      >
        <PricingOverviewSection isVisible={isVisible('pricing')} />
      </div>

      {/* Section 10: FAQ */}
      <div className="py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2
              className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-4">
            {faqItems.map((item, index) => (
              <div
                key={index}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                >
                  <h3
                    className="text-lg font-bold text-gray-900"
                    style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                  >
                    {item.question}
                  </h3>
                  <ChevronDownIcon
                    className={`w-5 h-5 text-gray-600 transition-transform ${
                      openFaq === index ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {openFaq === index && (
                  <div className="px-6 pb-4">
                    <p
                      className="text-gray-700 leading-relaxed"
                      style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                    >
                      {item.answer}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section 11: Final CTA */}
      <div className="py-20 bg-gradient-primary">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2
            className="text-3xl sm:text-4xl font-bold text-white mb-4"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            Ready to Transform Learning?
          </h2>
          <p
            className="text-xl text-white/95 mb-8 max-w-2xl mx-auto"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Join schools and families proving that personalized education can be official.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              to="/contact?type=demo"
              className="inline-flex items-center justify-center bg-white text-optio-pink hover:bg-gray-100 px-8 py-4 rounded-lg font-bold text-lg shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all min-h-[44px] w-full sm:w-auto"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              Get More Info
              <ArrowRightIcon className="ml-2 w-5 h-5" />
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center justify-center bg-transparent border-2 border-white text-white hover:bg-white/10 px-8 py-4 rounded-lg font-bold text-lg transition-all min-h-[44px] w-full sm:w-auto"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              <BookOpenIcon className="mr-2 w-5 h-5" />
              Start Free - No Credit Card
            </Link>
          </div>

          <p
            className="text-white/80 text-sm mt-8"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Questions? Email{' '}
            <a
              href="mailto:support@optioeducation.com"
              className="underline hover:no-underline"
            >
              support@optioeducation.com
            </a>
          </p>
        </div>
      </div>

      {/* Philosophy Details Modal */}
      {philosophyModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header with gradient */}
            <div className="bg-gradient-primary p-6 sm:p-8 rounded-t-2xl relative">
              <button
                onClick={() => setPhilosophyModalOpen(false)}
                className="absolute top-4 right-4 text-white/80 hover:text-white"
                aria-label="Close modal"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
              <h3
                className="text-2xl sm:text-3xl font-bold text-white mb-2"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                The Process Is The Goal
              </h3>
              <p
                className="text-white/90 text-lg"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                Learning matters today, not just for some future outcome.
              </p>
            </div>

            {/* Content */}
            <div className="p-6 sm:p-8">
              {/* Principle Cards */}
              <div className="grid sm:grid-cols-2 gap-4 mb-6">
                {/* Present-Focused */}
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 border-l-4 border-l-optio-pink">
                  <h4
                    className="font-bold text-gray-900 mb-1"
                    style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                  >
                    Present-Focused
                  </h4>
                  <p
                    className="text-gray-600 text-sm"
                    style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                  >
                    Every skill you build enriches your life right now, not just your future resume.
                  </p>
                </div>

                {/* Internal Motivation */}
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 border-l-4 border-l-optio-purple">
                  <h4
                    className="font-bold text-gray-900 mb-1"
                    style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                  >
                    Internal Motivation
                  </h4>
                  <p
                    className="text-gray-600 text-sm"
                    style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                  >
                    Create for the joy of creating. Learn because you're curious, not for grades.
                  </p>
                </div>

                {/* Celebrate the Journey */}
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 border-l-4 border-l-optio-pink">
                  <h4
                    className="font-bold text-gray-900 mb-1"
                    style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                  >
                    Celebrate the Journey
                  </h4>
                  <p
                    className="text-gray-600 text-sm"
                    style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                  >
                    Mistakes are learning. Attempts matter. Every step forward counts.
                  </p>
                </div>

                {/* Your Pace */}
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 border-l-4 border-l-optio-purple">
                  <h4
                    className="font-bold text-gray-900 mb-1"
                    style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                  >
                    Your Pace
                  </h4>
                  <p
                    className="text-gray-600 text-sm"
                    style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                  >
                    No "falling behind." Follow your curiosity at the speed that works for you.
                  </p>
                </div>
              </div>

              {/* Bottom message */}
              <div className="text-center p-4 rounded-xl bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 border border-optio-purple/10 mb-6">
                <p
                  className="text-gray-700"
                  style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                >
                  The diploma isn't the goal. It's the natural byproduct of a meaningful learning journey.
                </p>
              </div>

              {/* CTA */}
              <div className="flex justify-center">
                <Link
                  to="/demo"
                  className="bg-gradient-primary text-white px-8 py-3 rounded-lg font-bold hover:shadow-lg transition-all inline-flex items-center justify-center min-h-[44px]"
                  style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                >
                  Experience It Yourself
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HomePage
