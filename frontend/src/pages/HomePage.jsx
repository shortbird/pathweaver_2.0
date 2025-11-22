import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Play, X, BookOpen, Users, CheckCircle, Heart } from 'lucide-react'
import { PhilosophySection } from '../components/ui/PhilosophyCard'
import LandingPageHero from '../components/landing/LandingPageHero'
// import { useSubscriptionTiers, formatPrice } from '../hooks/useSubscriptionTiers' // REMOVED - Phase 3 refactoring (January 2025)

const HomePage = () => {
  const { isAuthenticated, user, loading } = useAuth()
  const navigate = useNavigate()
  // const { data: tiers, isLoading: tiersLoading } = useSubscriptionTiers() // REMOVED - Phase 3 refactoring (January 2025)
  const [philosophyModalOpen, setPhilosophyModalOpen] = useState(false)

  const scrollToRegister = () => {
    navigate('/register')
  }

  const goToDemo = () => {
    navigate('/demo')
  }

  // Redirect authenticated users to their appropriate dashboard
  // Wait for auth loading to complete to avoid race conditions with AuthCallback
  useEffect(() => {
    const currentPath = window.location.pathname
    const searchParams = new URLSearchParams(window.location.search)
    const hasAuthCode = searchParams.has('code')

    console.log('[SPARK SSO] HomePage useEffect triggered')
    console.log('[SPARK SSO] Current path:', currentPath)
    console.log('[SPARK SSO] Has auth code param:', hasAuthCode)
    console.log('[SPARK SSO] Auth state:', { loading, isAuthenticated, userRole: user?.role })

    // CRITICAL: Don't redirect if SSO flow is in progress
    // Check both path AND URL params to catch all SSO scenarios
    if (currentPath === '/auth/callback' || hasAuthCode) {
      console.log('[SPARK SSO] SSO flow detected - skipping all redirect logic')
      console.log('[SPARK SSO] Reason:', currentPath === '/auth/callback' ? 'on auth/callback path' : 'auth code param present')
      return
    }

    if (!loading && isAuthenticated && user) {
      console.log('[SPARK SSO] User is authenticated, redirecting to dashboard...')
      if (user.role === 'parent') {
        console.log('[SPARK SSO] Redirecting parent to /parent/dashboard')
        navigate('/parent/dashboard')
      } else if (user.role === 'student' || user.role === 'advisor' || user.role === 'admin') {
        console.log('[SPARK SSO] Redirecting user to /dashboard')
        navigate('/dashboard')
      }
    } else {
      console.log('[SPARK SSO] Not redirecting:', { loading, isAuthenticated, hasUser: !!user })
    }
  }, [isAuthenticated, user, navigate, loading])

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
          textAlign="center"
          secondaryCta={{
            text: "TRY IT OUT",
            onClick: goToDemo
          }}
        />
      )}

      {/* What Optio Provides Section - Platform Features Grid */}
      <div className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              What Optio Provides
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              Everything your family needs to manage, document, and celebrate learning
            </p>
          </div>

          {/* 6-Feature Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Automatic Portfolio Building */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-100 hover:border-purple-300 transition-all">
              <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center mb-4">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Automatic Portfolio Building
              </h3>
              <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Every project, essay, and creation automatically captured. No manual uploads, no friction—just learning that builds itself into proof.
              </p>
            </div>

            {/* Gamified Learning Journey */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-100 hover:border-purple-300 transition-all">
              <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Gamified Learning Journey
              </h3>
              <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Quests, XP, and badges transform progress into play. Visual skill tracking across five learning pillars keeps motivation high.
              </p>
            </div>

            {/* Parent Dashboard */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-100 hover:border-purple-300 transition-all">
              <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center mb-4">
                <Heart className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Parent Dashboard
              </h3>
              <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                See your child's learning rhythm and weekly wins without micromanaging. Celebrate flow state, offer support when needed.
              </p>
            </div>

            {/* Family Engagement */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-100 hover:border-purple-300 transition-all">
              <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Family Engagement
              </h3>
              <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Observer roles let grandparents, mentors, and extended family cheer progress, leave encouragement, and stay connected to your child's journey.
              </p>
            </div>

            {/* AI Learning Support */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-100 hover:border-purple-300 transition-all">
              <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center mb-4">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                AI Learning Support
              </h3>
              <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                24/7 Gemini-powered tutor provides instant help, answers questions, and keeps momentum going—even when parents are busy.
              </p>
            </div>

            {/* Professional Showcase Pages */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-100 hover:border-purple-300 transition-all">
              <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Professional Showcase Pages
              </h3>
              <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Custom portfolio URLs ready to share with colleges, employers, and scholarship applications. Make learning instantly visible and credible.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* REMOVED - Pricing section removed in Phase 3 refactoring (January 2025) */}
      {/* All features now free for all users */}

      {/* How It Works Section */}
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

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Step 1 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>1</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Create Your Account</h3>
              <p className="text-gray-600 leading-relaxed text-sm" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Set up your family's learning hub in minutes. Add students, invite family observers, customize your approach.
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>2</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Build Your Quests</h3>
              <p className="text-gray-600 leading-relaxed text-sm" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Create learning projects aligned with your child's interests and your educational goals. Make learning an adventure.
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>3</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Document As You Go</h3>
              <p className="text-gray-600 leading-relaxed text-sm" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Work automatically flows into the portfolio as students complete tasks. No extra uploads, no friction—just learning.
              </p>
            </div>

            {/* Step 4 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>4</span>
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
              className="inline-flex items-center bg-gradient-primary text-white px-8 py-4 rounded-lg font-bold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              <BookOpen className="mr-2 w-5 h-5" />
              Create Free Account
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
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-start">
                <CheckCircle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <span style={{ fontFamily: 'Poppins', fontWeight: 500 }}>Automatic portfolio building with zero friction</span>
              </div>
              <div className="flex items-start">
                <CheckCircle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <span style={{ fontFamily: 'Poppins', fontWeight: 500 }}>Gamified quests, XP, and achievement badges</span>
              </div>
              <div className="flex items-start">
                <CheckCircle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <span style={{ fontFamily: 'Poppins', fontWeight: 500 }}>Parent dashboard for rhythm tracking</span>
              </div>
              <div className="flex items-start">
                <CheckCircle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <span style={{ fontFamily: 'Poppins', fontWeight: 500 }}>Family observer access for extended support</span>
              </div>
              <div className="flex items-start">
                <CheckCircle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <span style={{ fontFamily: 'Poppins', fontWeight: 500 }}>24/7 AI tutor for learning support</span>
              </div>
              <div className="flex items-start">
                <CheckCircle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <span style={{ fontFamily: 'Poppins', fontWeight: 500 }}>Professional showcase pages for colleges</span>
              </div>
            </div>
          </div>

          <div className="text-center">
            <Link
              to="/register"
              className="inline-flex items-center bg-white text-optio-purple hover:bg-gray-100 px-8 py-4 rounded-lg font-bold text-lg shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              <BookOpen className="mr-2 w-5 h-5" />
              Create Free Account
            </Link>

            <p className="text-sm opacity-90 mt-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              Questions? Email <a href="mailto:support@optioeducation.com" className="underline hover:no-underline">support@optioeducation.com</a>
            </p>
          </div>
        </div>
      </div>

      {/* Our Philosophy Section */}
      <PhilosophySection onPhilosophyModalOpen={() => setPhilosophyModalOpen(true)} />

      {/* FAQ Section - Platform Focus */}
      <div className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-6">
            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                How does the automatic portfolio work?
              </h3>
              <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                As your child completes quest tasks, their work—essays, projects, videos, photos—automatically flows into their portfolio. No manual uploading, no extra steps. You document once, and it instantly becomes part of their professional showcase ready to share with colleges and employers.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                What are quests and how do we create them?
              </h3>
              <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Quests are learning adventures aligned with your child's interests. You can create custom quests based on your family's goals, choose from Optio's library, or let your child propose ideas. Each quest has tasks that earn XP across five learning pillars: STEM, Wellness, Communication, Civics, and Art.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Can extended family members see my child's work?
              </h3>
              <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Yes! You can invite grandparents, mentors, and other trusted adults as "observers." They get read-only access to cheer progress, leave encouragement, and stay connected to your child's learning journey—transforming learning into a shared family experience.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                How do we use this if we're already homeschooling?
              </h3>
              <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Optio complements any homeschool approach. Use it to document what you're already doing, add gamification to boost motivation, track progress across subjects, and build a portfolio that proves learning to colleges. It's a tool that fits YOUR family's existing rhythm.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                What happens to the work my child has already done?
              </h3>
              <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                You can manually upload past work to their portfolio to give context and show growth over time. While current work flows in automatically, we make it easy to backfill evidence of previous learning so your child's full story is told.
              </p>
            </div>
          </div>
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
                className="bg-gradient-primary text-white hover:shadow-lg text-lg px-8 py-4 rounded-lg font-bold transition-all inline-flex items-center transform hover:scale-105"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                <BookOpen className="mr-2 w-5 h-5" aria-hidden="true" />
                Create Free Account
              </Link>
              <Link
                to="/demo"
                className="bg-white border-2 border-optio-purple text-optio-purple hover:bg-optio-purple hover:text-white text-lg px-8 py-4 rounded-lg font-bold transition-all inline-flex items-center"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                <Play className="mr-2 w-5 h-5" aria-hidden="true" />
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
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Our Philosophy: The Process Is The Goal</h3>
              <button
                onClick={() => setPhilosophyModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close modal"
              >
                <X className="w-6 h-6" />
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
                className="bg-gradient-primary text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg transition-all"
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
