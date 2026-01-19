import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { HeartIcon, SparklesIcon, FireIcon, UsersIcon, ArrowRightIcon, ChatBubbleLeftIcon, ArrowRightOnRectangleIcon, ArrowLeftIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function ObserverWelcomePage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [siteSettings, setSiteSettings] = useState(null);

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
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-optio-purple transition-colors"
              >
                <ArrowLeftIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Back to Feed</span>
                <span className="sm:hidden">Feed</span>
              </Link>
              <Link
                to="/dashboard"
                className="flex items-center gap-1 text-sm bg-gradient-to-r from-optio-purple to-optio-pink text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity font-medium"
              >
                <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Access Platform</span>
                <span className="sm:hidden">Platform</span>
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

      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-optio-purple to-optio-pink rounded-full mb-6">
            <HeartIcon className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Welcome to Optio!
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            You're now an Observer. Here's how you can support and celebrate the student's learning journey.
          </p>
        </div>

        {/* Philosophy Section */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <div className="flex items-start gap-4 mb-6">
            <div className="flex-shrink-0">
              <SparklesIcon className="w-8 h-8 text-optio-purple" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">The Process Is The Goal</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                At Optio, we believe learning is about the journey, not the destination. Instead of focusing on grades,
                test scores, or college admissions, we celebrate curiosity, effort, exploration, and growth.
              </p>
              <p className="text-gray-700 leading-relaxed">
                Students learn by doing - completing self-directed quests that align with their interests, building real-world
                skills, and creating a portfolio that showcases their unique learning path.
              </p>
            </div>
          </div>
        </div>

        {/* Your Role Section */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <div className="flex items-start gap-4 mb-6">
            <div className="flex-shrink-0">
              <FireIcon className="w-8 h-8 text-optio-pink" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Your Important Role</h2>
              <p className="text-gray-700 leading-relaxed mb-6">
                As an Observer, you play a vital role in encouraging the student's learning. Your support and celebration
                of their efforts - not just outcomes - helps reinforce the process-focused mindset.
              </p>

              <div className="space-y-4">
                <div className="border-l-4 border-purple-500 pl-4 py-2">
                  <h3 className="font-semibold text-gray-900 mb-1">Celebrate Effort, Not Just Results</h3>
                  <p className="text-gray-600 text-sm">
                    "I love how you tried a new approach!" instead of "You're so smart!"
                  </p>
                </div>

                <div className="border-l-4 border-pink-500 pl-4 py-2">
                  <h3 className="font-semibold text-gray-900 mb-1">Ask Process-Focused Questions</h3>
                  <p className="text-gray-600 text-sm">
                    "What was the most challenging part?" or "What would you do differently next time?"
                  </p>
                </div>

                <div className="border-l-4 border-blue-500 pl-4 py-2">
                  <h3 className="font-semibold text-gray-900 mb-1">Show Genuine Interest</h3>
                  <p className="text-gray-600 text-sm">
                    "Tell me more about this project!" or "What made you choose this quest?"
                  </p>
                </div>

                <div className="border-l-4 border-green-500 pl-4 py-2">
                  <h3 className="font-semibold text-gray-900 mb-1">Acknowledge Growth</h3>
                  <p className="text-gray-600 text-sm">
                    "I can see how much you've learned!" or "Look how far you've come!"
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* What You Can Do */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <div className="flex items-start gap-4 mb-6">
            <div className="flex-shrink-0">
              <UsersIcon className="w-8 h-8 text-blue-500" />
            </div>
            <div className="w-full">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">What You Can Do</h2>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ChatBubbleLeftIcon className="w-5 h-5 text-optio-purple" />
                    <h3 className="font-semibold text-gray-900">Leave Comments</h3>
                  </div>
                  <p className="text-gray-700 text-sm">
                    Share encouraging words and celebrate their completed work
                  </p>
                </div>

                <div className="bg-pink-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <HeartIcon className="w-5 h-5 text-optio-pink" />
                    <h3 className="font-semibold text-gray-900">React to Achievements</h3>
                  </div>
                  <p className="text-gray-700 text-sm">
                    Use emoji reactions to quickly show you're following along
                  </p>
                </div>

                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <SparklesIcon className="w-5 h-5 text-blue-500" />
                    <h3 className="font-semibold text-gray-900">View Their Feed</h3>
                  </div>
                  <p className="text-gray-700 text-sm">
                    See a timeline of their recent completions and milestones
                  </p>
                </div>

                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FireIcon className="w-5 h-5 text-green-500" />
                    <h3 className="font-semibold text-gray-900">Stay Updated</h3>
                  </div>
                  <p className="text-gray-700 text-sm">
                    Get daily or weekly email digests of their progress
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            to="/observer/feed"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold py-4 px-8 rounded-xl hover:shadow-lg transition-all duration-200"
          >
            View Student Feed
            <ArrowRightIcon className="w-5 h-5" />
          </Link>
          <p className="text-gray-600 text-sm mt-4">
            You can access this page anytime by clicking "Tips" in the header
          </p>
        </div>
      </div>
    </div>
  )
}
