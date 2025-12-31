import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { PlayIcon, XMarkIcon, BookOpenIcon, UsersIcon, CheckCircleIcon, HeartIcon, SparklesIcon, FireIcon, BoltIcon, ArrowRightIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import { PhilosophySection } from '../components/ui/PhilosophyCard'
import LandingPageHero from '../components/landing/LandingPageHero'
import { useHomepageImages, getImageUrl } from '../hooks/useHomepageImages'

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

  const scrollToRegister = () => {
    navigate('/register')
  }

  const goToDemo = () => {
    navigate('/demo')
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
      if (user.role === 'parent') {
        navigate('/parent/dashboard')
      } else if (user.role === 'student' || user.role === 'advisor' || user.role === 'admin' || user.role === 'superadmin') {
        navigate('/dashboard')
      }
    }
  }, [isAuthenticated, user, navigate, loading])

  const isVisible = (section) => visibleSections.has(section)

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

      {/* Hero Section */}
      {!isAuthenticated && (
        <LandingPageHero
          title="Raise doers, not dependents"
          staticSubtitle="Your toolkit for personalized learning"
          ctaText="CREATE FREE ACCOUNT"
          onCtaClick={scrollToRegister}
          backgroundImage="https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/promo/ParentsHero.jpg"
          mobileBackgroundImage="https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/promo/Mobile_ParentsHero.jpg"
          removeOverlay={true}
          textAlign="left"
          secondaryCta={{
            text: "TRY IT OUT",
            onClick: goToDemo
          }}
        />
      )}

      {/* What Optio Provides Section - Alternating Image/Text Layout */}
      <div className="py-16 bg-white" id="main-content">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              What Optio Provides
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              Everything your family needs to manage, document, and celebrate learning
            </p>
          </div>

          {/* Feature 1: Portfolio + XP System (Image Left) */}
          <div
            ref={(el) => (sectionRefs.current.feature1 = el)}
            data-section="feature1"
            className={`grid md:grid-cols-2 gap-8 items-center mb-16 transition-all duration-700 ${
              isVisible('feature1') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            <div className="relative overflow-hidden rounded-2xl shadow-2xl group">
              <img
                src={getImageUrl(images, 'portfolio', '')}
                alt="Student reviewing portfolio"
                className="w-full h-auto min-h-[250px] sm:h-[400px] object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
            </div>
            <div className="space-y-6">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center">
                  <BookOpenIcon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                  Automatic Portfolio Building
                </h3>
              </div>
              <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Every project, essay, and creation automatically captured. No manual uploads, no friction, just learning that builds itself into proof. Your child's work flows seamlessly into a professional showcase ready to share with colleges and employers.
              </p>
              <div className="flex items-center space-x-2 text-optio-purple font-semibold">
                <SparklesIcon className="w-5 h-5" />
                <span style={{ fontFamily: 'Poppins', fontWeight: 600 }}>Zero extra work required</span>
              </div>
            </div>
          </div>

          {/* Feature 2: Gamified Learning + AI Tutor (Image Right) */}
          <div
            ref={(el) => (sectionRefs.current.feature2 = el)}
            data-section="feature2"
            className={`grid md:grid-cols-2 gap-8 items-center mb-16 transition-all duration-700 ${
              isVisible('feature2') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            <div className="space-y-6 md:order-1 order-2">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center">
                  <FireIcon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                  Gamified Learning Journey
                </h3>
              </div>
              <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Quests, XP, and badges transform progress into play. Visual skill tracking across five learning pillars keeps motivation high. Students see their growth in real-time, celebrating every step of their journey.
              </p>
              <div className="bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 rounded-lg p-4 border-l-4 border-optio-purple">
                <p className="text-sm text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  <strong style={{ fontFamily: 'Poppins', fontWeight: 600 }}>Plus 24/7 AI Tutor:</strong> Gemini-powered support provides instant help, answers questions, and keeps momentum going, even when parents are busy.
                </p>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-2xl shadow-2xl group md:order-2 order-1">
              <img
                src={getImageUrl(images, 'ai_tutor', '')}
                alt="Student with AI tutor"
                className="w-full h-auto min-h-[250px] sm:h-[400px] object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
            </div>
          </div>

          {/* Feature 3: Parent Dashboard + Community (Image Left) */}
          <div
            ref={(el) => (sectionRefs.current.feature3 = el)}
            data-section="feature3"
            className={`grid md:grid-cols-2 gap-8 items-center transition-all duration-700 ${
              isVisible('feature3') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            <div className="relative overflow-hidden rounded-2xl shadow-2xl group">
              <img
                src={getImageUrl(images, 'connections', '')}
                alt="Community connections"
                className="w-full h-auto min-h-[250px] sm:h-[400px] object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
            </div>
            <div className="space-y-6">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center">
                  <HeartIcon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                  Parent Dashboard & Family Engagement
                </h3>
              </div>
              <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                See your child's learning rhythm and weekly wins without micromanaging. Celebrate flow state, offer support when needed. Observer roles let grandparents, mentors, and extended family stay connected to your child's journey.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-3xl font-bold text-green-600" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>100%</div>
                  <div className="text-sm text-gray-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>Visibility</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-3xl font-bold text-optio-purple" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>0%</div>
                  <div className="text-sm text-gray-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>Micromanaging</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works Section - With Process Images */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              How It Works
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              Learning documentation that happens automatically as your family learns
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Step 1 */}
            <div
              ref={(el) => (sectionRefs.current.step1 = el)}
              data-section="step1"
              className={`text-center transition-all duration-700 delay-0 ${
                isVisible('step1') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <div className="relative mb-4 overflow-hidden rounded-xl shadow-lg group">
                <img
                  src={getImageUrl(images, 'choose_quest', '')}
                  alt="Choose your quest"
                  className="w-full h-48 object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute top-4 left-4 w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>1</span>
                </div>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Create Your Account</h3>
              <p className="text-gray-600 leading-relaxed text-sm" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Set up your family's learning hub in minutes. Add students, invite family observers, customize your approach.
              </p>
            </div>

            {/* Step 2 */}
            <div
              ref={(el) => (sectionRefs.current.step2 = el)}
              data-section="step2"
              className={`text-center transition-all duration-700 delay-100 ${
                isVisible('step2') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <div className="relative mb-4 overflow-hidden rounded-xl shadow-lg group">
                <img
                  src={getImageUrl(images, 'complete_tasks', '')}
                  alt="Complete tasks"
                  className="w-full h-48 object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute top-4 left-4 w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>2</span>
                </div>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Build Your Quests</h3>
              <p className="text-gray-600 leading-relaxed text-sm" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Create learning projects aligned with your child's interests and your educational goals. Make learning an adventure.
              </p>
            </div>

            {/* Step 3 */}
            <div
              ref={(el) => (sectionRefs.current.step3 = el)}
              data-section="step3"
              className={`text-center transition-all duration-700 delay-200 ${
                isVisible('step3') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <div className="relative mb-4 overflow-hidden rounded-xl shadow-lg group">
                <img
                  src={getImageUrl(images, 'submit_evidence', '')}
                  alt="Submit evidence"
                  className="w-full h-48 object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute top-4 left-4 w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>3</span>
                </div>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Document As You Go</h3>
              <p className="text-gray-600 leading-relaxed text-sm" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Work automatically flows into the portfolio as students complete tasks. No extra uploads, no friction, just learning.
              </p>
            </div>

            {/* Step 4 */}
            <div
              ref={(el) => (sectionRefs.current.step4 = el)}
              data-section="step4"
              className={`text-center transition-all duration-700 delay-300 ${
                isVisible('step4') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <div className="relative mb-4 overflow-hidden rounded-xl shadow-lg group">
                <img
                  src={getImageUrl(images, 'earn_recognition', '')}
                  alt="Earn recognition"
                  className="w-full h-48 object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute top-4 left-4 w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>4</span>
                </div>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Track & Celebrate</h3>
              <p className="text-gray-600 leading-relaxed text-sm" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Watch visual progress, badges earned, and portfolio building in real-time. Celebrate every step of the journey.
              </p>
            </div>
          </div>

          <div className="text-center mt-12">
            <Link
              to="/register"
              className="inline-flex items-center justify-center bg-gradient-primary text-white px-8 py-4 rounded-lg font-bold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all min-h-[44px] w-full sm:w-auto max-w-md mx-auto"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              <BookOpenIcon className="mr-2 w-5 h-5" />
              Create Free Account
            </Link>
          </div>
        </div>
      </div>

      {/* Accreditation Section */}
      <div className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            ref={(el) => (sectionRefs.current.accreditation = el)}
            data-section="accreditation"
            className={`grid md:grid-cols-2 gap-12 items-center transition-all duration-700 ${
              isVisible('accreditation') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            {/* Left: Image */}
            <div className="relative overflow-hidden rounded-2xl shadow-2xl group">
              <img
                src={getImageUrl(images, 'accreditation', '')}
                alt="Student holding diploma"
                className="w-full h-auto min-h-[300px] sm:h-[500px] object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
            </div>

            {/* Right: Content */}
            <div className="space-y-6">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Personalized Learning. Official Credit.
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Finally, you can personalize your learning approach and still earn official academic credit. Optio is the first platform to combine truly customized education with accredited high school credentials at scale.
              </p>

              <div className="space-y-4">
                <div className="flex items-start">
                  <CheckCircleIcon className="w-6 h-6 text-optio-purple flex-shrink-0 mt-1 mr-4" />
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg mb-1" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                      Earn an official high school diploma
                    </h3>
                    <p className="text-gray-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                      All completed work is officially accredited and counts toward graduation requirements.
                    </p>
                  </div>
                </div>

                <div className="flex items-start">
                  <CheckCircleIcon className="w-6 h-6 text-optio-purple flex-shrink-0 mt-1 mr-4" />
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg mb-1" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                      College admissions ready
                    </h3>
                    <p className="text-gray-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                      Official transcripts meet all college and university admission requirements.
                    </p>
                  </div>
                </div>

                <div className="flex items-start">
                  <CheckCircleIcon className="w-6 h-6 text-optio-purple flex-shrink-0 mt-1 mr-4" />
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg mb-1" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                      Portfolio meets transcript
                    </h3>
                    <p className="text-gray-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                      Combine your rich portfolio of evidence with an official academic transcript for a complete picture of achievement.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Centered CTA Button */}
          <div className="text-center mt-12">
            <Link
              to="/register"
              className="inline-flex items-center justify-center bg-gradient-primary text-white px-8 py-4 rounded-lg font-bold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all min-h-[44px] w-full sm:w-auto max-w-md mx-auto"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              Start Your Accredited Journey
              <ArrowRightIcon className="ml-2 w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Main CTA Section - Platform Launch */}
      <div className="py-16 bg-gradient-primary text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              Start Building Your Family's Learning Portfolio Today
            </h2>
            <p className="text-xl mb-6 opacity-95" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>
              Free to start. No credit card required.
            </p>
            <p className="text-lg opacity-90 max-w-2xl mx-auto leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              Join families who are transforming their children's learning into tangible proof of growth, capability, and achievement.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-2xl border-2 border-white/20 p-6 sm:p-8 mb-8">
            <h3 className="text-xl font-bold mb-4 text-center" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>What You Get:</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start">
                <CheckCircleIcon className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <span style={{ fontFamily: 'Poppins', fontWeight: 500 }}>Automatic portfolio building with zero friction</span>
              </div>
              <div className="flex items-start">
                <CheckCircleIcon className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <span style={{ fontFamily: 'Poppins', fontWeight: 500 }}>Gamified quests, XP, and achievement badges</span>
              </div>
              <div className="flex items-start">
                <CheckCircleIcon className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <span style={{ fontFamily: 'Poppins', fontWeight: 500 }}>Parent dashboard for rhythm tracking</span>
              </div>
              <div className="flex items-start">
                <CheckCircleIcon className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <span style={{ fontFamily: 'Poppins', fontWeight: 500 }}>Family observer access for extended support</span>
              </div>
              <div className="flex items-start">
                <CheckCircleIcon className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <span style={{ fontFamily: 'Poppins', fontWeight: 500 }}>24/7 AI tutor for learning support</span>
              </div>
              <div className="flex items-start">
                <CheckCircleIcon className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <span style={{ fontFamily: 'Poppins', fontWeight: 500 }}>Professional showcase pages for colleges</span>
              </div>
            </div>
          </div>

          <div className="text-center">
            <Link
              to="/register"
              className="inline-flex items-center justify-center bg-white text-optio-purple hover:bg-gray-100 px-8 py-4 rounded-lg font-bold text-lg shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all min-h-[44px] w-full sm:w-auto max-w-md mx-auto"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              <BookOpenIcon className="mr-2 w-5 h-5" />
              Create Free Account
            </Link>

            <p className="text-sm opacity-90 mt-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              Questions? Email <a href="mailto:support@optioeducation.com" className="underline hover:no-underline">support@optioeducation.com</a>
            </p>
          </div>
        </div>
      </div>

      {/* FAQ Section - Platform Focus */}
      <div className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-4">
            {/* FAQ 1 */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === 0 ? null : 0)}
                className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-100 transition-colors"
              >
                <h3 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                  How does the automatic portfolio work?
                </h3>
                <ChevronDownIcon className={`w-5 h-5 text-gray-600 transition-transform ${openFaq === 0 ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === 0 && (
                <div className="px-6 pb-4">
                  <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    As your child completes quest tasks, their work (essays, projects, videos, photos) automatically flows into their portfolio. No manual uploading, no extra steps. You document once, and it instantly becomes part of their professional showcase ready to share with colleges and employers.
                  </p>
                </div>
              )}
            </div>

            {/* FAQ 2 */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === 1 ? null : 1)}
                className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-100 transition-colors"
              >
                <h3 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                  What are quests and how do we create them?
                </h3>
                <ChevronDownIcon className={`w-5 h-5 text-gray-600 transition-transform ${openFaq === 1 ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === 1 && (
                <div className="px-6 pb-4">
                  <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    Quests are learning adventures aligned with your child's interests. You can create custom quests based on your family's goals, choose from Optio's library, or let your child propose ideas. Each quest has tasks that earn XP across five learning pillars: STEM, Wellness, Communication, Civics, and Art.
                  </p>
                </div>
              )}
            </div>

            {/* FAQ 3 */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === 2 ? null : 2)}
                className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-100 transition-colors"
              >
                <h3 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                  Can extended family members see my child's work?
                </h3>
                <ChevronDownIcon className={`w-5 h-5 text-gray-600 transition-transform ${openFaq === 2 ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === 2 && (
                <div className="px-6 pb-4">
                  <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    Yes! You can invite grandparents, mentors, and other trusted adults as "observers." They get read-only access to cheer progress, leave encouragement, and stay connected to your child's learning journey, transforming learning into a shared family experience.
                  </p>
                </div>
              )}
            </div>

            {/* FAQ 4 */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === 3 ? null : 3)}
                className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-100 transition-colors"
              >
                <h3 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                  How do we use this if we're already homeschooling?
                </h3>
                <ChevronDownIcon className={`w-5 h-5 text-gray-600 transition-transform ${openFaq === 3 ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === 3 && (
                <div className="px-6 pb-4">
                  <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    Optio complements any homeschool approach. Use it to document what you're already doing, add gamification to boost motivation, track progress across subjects, and build a portfolio that proves learning to colleges. It's a tool that fits YOUR family's existing rhythm.
                  </p>
                </div>
              )}
            </div>

            {/* FAQ 5 */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === 4 ? null : 4)}
                className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-100 transition-colors"
              >
                <h3 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                  What happens to the work my child has already done?
                </h3>
                <ChevronDownIcon className={`w-5 h-5 text-gray-600 transition-transform ${openFaq === 4 ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === 4 && (
                <div className="px-6 pb-4">
                  <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    You can manually upload past work to their portfolio to give context and show growth over time. While current work flows in automatically, we make it easy to backfill evidence of previous learning so your child's full story is told.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Philosophy Section with Hero Image */}
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
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
            The Process Is The Goal
          </h2>
          <p className="text-xl text-white/95 mb-8 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
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

      {/* Final CTA - Platform Signup */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Ready to Get Started?</h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              Join families who are transforming learning into proof of capability. Free to start, easy to use.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                to="/register"
                className="bg-gradient-primary text-white hover:shadow-lg text-lg px-8 py-4 rounded-lg font-bold transition-all inline-flex items-center justify-center transform hover:scale-105 min-h-[44px] w-full sm:w-auto"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                <BookOpenIcon className="mr-2 w-5 h-5" aria-hidden="true" />
                Create Free Account
              </Link>
              <Link
                to="/demo"
                className="bg-white border-2 border-optio-purple text-optio-purple hover:bg-optio-purple hover:text-white text-lg px-8 py-4 rounded-lg font-bold transition-all inline-flex items-center justify-center min-h-[44px] w-full sm:w-auto"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                <PlayIcon className="mr-2 w-5 h-5" aria-hidden="true" />
                Try Demo First
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Philosophy Details Modal */}
      {philosophyModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
              <h3 className="text-2xl font-bold" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Our Philosophy: The Process Is The Goal</h3>
              <button
                onClick={() => setPhilosophyModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close modal"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="p-4 bg-gradient-to-r from-optio-pink/5 to-optio-purple/5 rounded-lg">
                <p className="text-lg font-semibold text-gray-800 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>Core Belief</p>
                <p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  Learning is not about reaching a destination or impressing others. It's about who you become through the journey of discovery, creation, and growth. Every quest, every piece of evidence is valuable because of what it teaches you RIGHT NOW, not what it might prove later.
                </p>
              </div>

              <div>
                <h4 className="text-xl font-semibold mb-3 text-optio-pink" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>Present-Focused Value</h4>
                <p className="text-gray-700 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  We don't say "This will help you in the future." We say "This is helping you grow right now."
                </p>
                <p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  Your learning matters today. Each skill you build, each idea you explore, each creation you make enriches your life in this moment. The value isn't postponed to some future job or college application – it's immediate and real.
                </p>
              </div>

              <div>
                <h4 className="text-xl font-semibold mb-3 text-optio-purple" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>Internal Motivation Over External Validation</h4>
                <p className="text-gray-700 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  The platform celebrates personal growth, curiosity, and creation for its own sake. We focus on how learning FEELS, not how it LOOKS.
                </p>
                <ul className="space-y-2 text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  <li>• "You're discovering what you're capable of" (not "proving your capabilities")</li>
                  <li>• "Your creativity is flourishing" (not "showcasing your creativity")</li>
                  <li>• "You're becoming more yourself" (not "standing out from others")</li>
                </ul>
              </div>

              <div>
                <h4 className="text-xl font-semibold mb-3 text-optio-pink" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>Process Celebration</h4>
                <p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  Every step is valuable. We celebrate attempts, effort, and learning from mistakes as much as completion. Mistakes are expected and celebrated. Your consistency is beautiful. You're in a learning flow state.
                </p>
              </div>

              <div>
                <h4 className="text-xl font-semibold mb-3 text-optio-purple" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>What This Means For You</h4>
                <ul className="space-y-3 text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Learn at your own pace – there's no "falling behind"</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Follow your curiosity, not a prescribed path</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Create for the joy of creating, not for grades</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Build skills that matter to you personally</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Celebrate growth, not comparison</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-6 bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-800" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                <strong style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Remember:</strong> You're already enough. You're growing at the perfect pace. You're creating something meaningful. The diploma is not the goal – it's the beautiful byproduct of a meaningful learning journey.
              </p>
            </div>

            <div className="mt-6 flex justify-center">
              <Link
                to="/demo"
                className="bg-gradient-primary text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg transition-all inline-flex items-center justify-center min-h-[44px] w-full sm:w-auto max-w-md mx-auto"
                style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              >
                Experience It Yourself
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HomePage
