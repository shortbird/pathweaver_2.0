import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ArrowRightIcon, ArrowRightOnRectangleIcon, ArrowLeftIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import EngagementCalendar from '../components/quest/EngagementCalendar'
import SkillsRadarChart from '../components/diploma/SkillsRadarChart'

// Generate example engagement data for the last 21 days
const generateExampleEngagementDays = () => {
  const days = []
  const today = new Date()
  for (let i = 20; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]

    // Create realistic activity patterns - more active on weekdays
    const dayOfWeek = date.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const baseActivity = isWeekend ? 1 : 3
    let activityCount = Math.floor(Math.random() * 4) + baseActivity

    // Ensure at least one max engagement day (around day 10)
    if (i === 10) {
      activityCount = 8 // Max engagement
    }

    const intensity = Math.min(4, Math.floor(activityCount / 2))

    days.push({
      date: dateStr,
      intensity: activityCount > 0 ? intensity : 0,
      activity_count: activityCount,
      activities: activityCount > 0 ? ['task_completed', 'evidence_uploaded'].slice(0, activityCount) : []
    })
  }
  return days
}

// Example skills XP data
const exampleSkillsXP = {
  art: 1250,
  stem: 890,
  wellness: 650,
  communication: 1100,
  civics: 480
}

export default function ObserverWelcomePage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [siteSettings, setSiteSettings] = useState(null);

  // Mark welcome as seen when leaving this page
  const markWelcomeSeen = () => {
    localStorage.setItem('observerWelcomeSeen', 'true');
  };

  // Fetch site settings for logo
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const response = await fetch(`${apiUrl}/api/settings`);
        if (response.ok) {
          const data = await response.json();
          setSiteSettings(data);
        }
      } catch (error) {
        // Silent fail - use fallback
      }
    };
    fetchSettings();
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      toast.error('Failed to log out');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
      {/* Observer Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Link to="/observer/feed" className="flex items-center">
                {siteSettings?.logo_url ? (
                  <img
                    src={siteSettings.logo_url}
                    alt={siteSettings.site_name || "Optio"}
                    className="h-8 w-auto"
                  />
                ) : (
                  <span className="text-2xl font-bold bg-gradient-to-r from-optio-purple to-optio-pink bg-clip-text text-transparent">
                    Optio
                  </span>
                )}
              </Link>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                to="/observer/feed"
                onClick={markWelcomeSeen}
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-optio-purple transition-colors"
              >
                <ArrowLeftIcon className="w-4 h-4" />
                Back to Feed
              </Link>
              <Link
                to="/dashboard"
                onClick={markWelcomeSeen}
                className="hidden sm:flex items-center gap-1 text-sm bg-gradient-to-r from-optio-purple to-optio-pink text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity font-medium"
              >
                <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                Access Platform
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50"
              >
                <ArrowRightOnRectangleIcon className="w-5 h-5" />
                <span className="hidden sm:inline">Log out</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6 sm:py-12">
        {/* Hero Section */}
        <div className="text-center mb-6 sm:mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 sm:w-24 sm:h-24 mb-4 sm:mb-6">
            <img
              src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg"
              alt="Optio"
              className="w-full h-full"
            />
          </div>
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-2 sm:mb-4">
            Welcome to Optio!
          </h1>
          <p className="text-base sm:text-xl text-gray-600 max-w-2xl mx-auto">
            You're now an observer. Here's how you can support and celebrate the student's learning journey.
          </p>
        </div>

        {/* Philosophy Section */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-8 mb-4 sm:mb-8">
          <h2 className="text-lg sm:text-2xl font-bold text-gray-900 mb-2 sm:mb-3">The Process Is The Goal</h2>
          <p className="text-sm sm:text-base text-gray-700 leading-relaxed mb-3 sm:mb-4">
            At Optio, we believe learning is about the journey, not the destination. Instead of focusing on grades,
            test scores, or college admissions, we celebrate curiosity, effort, exploration, and growth.
          </p>
          <p className="text-sm sm:text-base text-gray-700 leading-relaxed">
            Students learn by doing - completing self-directed quests that align with their interests, building real-world
            skills, and creating a portfolio that showcases their unique learning path.
          </p>
        </div>

        {/* Engagement Tracking Section */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-8 mb-4 sm:mb-8">
          <h2 className="text-lg sm:text-2xl font-bold text-gray-900 mb-2 sm:mb-3">How We Track Engagement</h2>
          <p className="text-sm sm:text-base text-gray-700 leading-relaxed mb-4 sm:mb-6">
            We measure engagement through daily activity, not test scores. Students earn XP (experience points) by
            completing tasks, and we track their learning rhythm over time. This helps identify when they're in
            a flow state and when they might need encouragement.
          </p>

          <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
            <h3 className="text-sm sm:text-base font-semibold text-gray-800 mb-3">Activity Calendar (Example)</h3>
            <EngagementCalendar days={generateExampleEngagementDays()} />
          </div>
        </div>

        {/* Pillar Tracking Section */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-8 mb-4 sm:mb-8">
          <h2 className="text-lg sm:text-2xl font-bold text-gray-900 mb-2 sm:mb-3">How We Track Learning</h2>
          <p className="text-sm sm:text-base text-gray-700 leading-relaxed mb-4 sm:mb-6">
            Learning is organized into five pillars that represent a well-rounded education. As students complete
            tasks, they earn XP in each pillar, building a unique profile that reflects their strengths and
            interests while encouraging exploration of all areas.
          </p>

          <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
            <h3 className="text-sm sm:text-base font-semibold text-gray-800 mb-3">Growth Dimensions (Example)</h3>

            {/* Desktop: side-by-side layout, Mobile: stacked */}
            <div className="grid md:grid-cols-2 items-center gap-6">
              {/* Radar chart - clip to hide the stats grid below it */}
              <div className="overflow-hidden" style={{ maxHeight: '290px' }}>
                <SkillsRadarChart skillsXP={exampleSkillsXP} compact={true} />
              </div>

              {/* Pillar information */}
              <div className="text-xs sm:text-sm text-gray-600 space-y-3">
                <p className="font-medium text-gray-700">The five pillars of growth:</p>
                <ul className="space-y-2">
                  <li><strong>Art</strong> - Creative expression, music, visual arts</li>
                  <li><strong>STEM</strong> - Science, technology, engineering, math</li>
                  <li><strong>Wellness</strong> - Physical and mental health</li>
                  <li><strong>Communication</strong> - Writing, speaking, language</li>
                  <li><strong>Civics</strong> - History, social studies, community</li>
                </ul>
                <p className="text-gray-500 pt-1">
                  The radar chart shows at a glance how a student is developing across all areas.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Your Role Section */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-8 mb-4 sm:mb-8">
          <h2 className="text-lg sm:text-2xl font-bold text-gray-900 mb-2 sm:mb-3">Your Important Role</h2>
          <p className="text-sm sm:text-base text-gray-700 leading-relaxed mb-4 sm:mb-6">
            As an observer, you play a vital role in encouraging the student's learning. Your support and celebration
            of their efforts - not just outcomes - helps reinforce the process-focused mindset.
          </p>

          <div className="space-y-3 sm:space-y-4">
            <div className="border-l-4 border-purple-500 pl-3 sm:pl-4 py-1.5 sm:py-2">
              <h3 className="font-semibold text-gray-900 text-sm sm:text-base mb-0.5 sm:mb-1">Celebrate Effort, Not Just Results</h3>
              <p className="text-gray-600 text-xs sm:text-sm">
                "I love how you tried a new approach!" instead of "You're so smart!"
              </p>
            </div>

            <div className="border-l-4 border-pink-500 pl-3 sm:pl-4 py-1.5 sm:py-2">
              <h3 className="font-semibold text-gray-900 text-sm sm:text-base mb-0.5 sm:mb-1">Ask Process-Focused Questions</h3>
              <p className="text-gray-600 text-xs sm:text-sm">
                "What was the most challenging part?" or "What would you do differently next time?"
              </p>
            </div>

            <div className="border-l-4 border-blue-500 pl-3 sm:pl-4 py-1.5 sm:py-2">
              <h3 className="font-semibold text-gray-900 text-sm sm:text-base mb-0.5 sm:mb-1">Show Genuine Interest</h3>
              <p className="text-gray-600 text-xs sm:text-sm">
                "Tell me more about this project!" or "What made you choose this quest?"
              </p>
            </div>

            <div className="border-l-4 border-green-500 pl-3 sm:pl-4 py-1.5 sm:py-2">
              <h3 className="font-semibold text-gray-900 text-sm sm:text-base mb-0.5 sm:mb-1">Acknowledge Growth</h3>
              <p className="text-gray-600 text-xs sm:text-sm">
                "I can see how much you've learned!" or "Look how far you've come!"
              </p>
            </div>
          </div>
        </div>

        {/* What You Can Do */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-8 mb-4 sm:mb-8">
          <h2 className="text-lg sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">What You Can Do</h2>

          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <div className="bg-purple-50 rounded-lg p-3 sm:p-4">
              <h3 className="font-semibold text-gray-900 text-xs sm:text-base mb-1 sm:mb-2">Leave Comments</h3>
              <p className="text-gray-700 text-xs sm:text-sm">
                Share encouraging words and celebrate their work
              </p>
            </div>

            <div className="bg-pink-50 rounded-lg p-3 sm:p-4">
              <h3 className="font-semibold text-gray-900 text-xs sm:text-base mb-1 sm:mb-2">React</h3>
              <p className="text-gray-700 text-xs sm:text-sm">
                Use emoji reactions to show you're following along
              </p>
            </div>

            <div className="bg-blue-50 rounded-lg p-3 sm:p-4">
              <h3 className="font-semibold text-gray-900 text-xs sm:text-base mb-1 sm:mb-2">View Feed</h3>
              <p className="text-gray-700 text-xs sm:text-sm">
                See their recent completions and milestones
              </p>
            </div>

            <div className="bg-green-50 rounded-lg p-3 sm:p-4">
              <h3 className="font-semibold text-gray-900 text-xs sm:text-base mb-1 sm:mb-2">Stay Updated</h3>
              <p className="text-gray-700 text-xs sm:text-sm">
                Get email digests of their progress
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            to="/observer/feed"
            onClick={markWelcomeSeen}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold py-3 sm:py-4 px-6 sm:px-8 rounded-xl hover:shadow-lg transition-all duration-200 text-sm sm:text-base"
          >
            View Student Feed
            <ArrowRightIcon className="w-4 h-4 sm:w-5 sm:h-5" />
          </Link>
          <p className="text-gray-600 text-xs sm:text-sm mt-3 sm:mt-4">
            You can access this page anytime by clicking "Tips" in the header
          </p>
        </div>
      </div>
    </div>
  )
}
