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
          staticSubtitle="Where self-directed learning earns accredited diplomas."
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

      {/* Section 2: For Schools & Organizations */}
      <div
        id="main-content"
        ref={(el) => (sectionRefs.current.orgFeatures = el)}
        data-section="orgFeatures"
      >
        <OrganizationFeaturesSection isVisible={isVisible('orgFeatures')} />
      </div>

      {/* Section 3: VELA Grant */}
      <div
        ref={(el) => (sectionRefs.current.vela = el)}
        data-section="vela"
      >
        <VELASection isVisible={isVisible('vela')} />
      </div>

      {/* Section 4: Platform Capabilities */}
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
            quote: "My husband and I are so grateful for Optio! We feel like it was created just for us. We homeschool our 7 kids and this is the perfect platform to track all the learning we do in our family.",
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
