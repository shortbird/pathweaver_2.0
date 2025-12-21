import React from 'react'
import { Link } from 'react-router-dom'
import { HeartIcon, SparklesIcon, FireIcon, UsersIcon, ArrowRightIcon, ChatBubbleLeftIcon } from '@heroicons/react/24/outline'

export default function ObserverWelcomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
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
            You can always access this page from your profile menu
          </p>
        </div>
      </div>
    </div>
  )
}
