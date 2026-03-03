import React from 'react';
import { HeartIcon, CalendarIcon, ChatBubbleLeftIcon, ArrowTrendingUpIcon } from '@heroicons/react/24/outline';

const ParentDashboardPreview = () => {
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const activityDots = [true, true, false, true, true, false, false]; // Green = active day

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <HeartIcon className="w-8 h-8 text-green-500" />
          <h2 className="text-3xl font-bold text-text-primary">
            Parents Can Cheer You On
          </h2>
        </div>
        <p className="text-gray-600 max-w-2xl mx-auto">
          They see your rhythm, not every detail
        </p>
      </div>

      {/* Parent Dashboard Mockup */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-xl overflow-hidden max-w-4xl mx-auto">
        {/* Dashboard Header */}
        <div className="bg-gradient-primary text-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90">Parent View</p>
              <h3 className="text-xl font-bold">Sarah's Learning Journey</h3>
            </div>
            <HeartIcon className="w-6 h-6" />
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="p-6 space-y-6">
          {/* Learning Rhythm Indicator */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border-2 border-green-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center animate-pulse">
                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                  <ArrowTrendingUpIcon className="w-5 h-5 text-green-500" />
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-600">Learning Rhythm</p>
                <p className="text-2xl font-bold text-green-600">FLOW</p>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4">
              <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span className="text-green-500">✓</span>
                Weekly Wins
              </h4>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">•</span>
                  <span>Completed 3 quest tasks</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">•</span>
                  <span>Explored Communication & Civics pillars</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">•</span>
                  <span>Unlocked "Story Seeker" badge</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Activity Calendar */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CalendarIcon className="w-5 h-5 text-optio-purple" />
              <h4 className="font-semibold text-gray-800">This Week's Activity</h4>
            </div>
            <div className="grid grid-cols-7 gap-3">
              {weekDays.map((day, index) => (
                <div key={day} className="text-center">
                  <p className="text-xs text-gray-600 mb-2">{day}</p>
                  <div
                    className={`w-12 h-12 rounded-full mx-auto flex items-center justify-center ${
                      activityDots[index]
                        ? 'bg-green-500 animate-pulse'
                        : 'bg-gray-200'
                    }`}
                  >
                    {activityDots[index] && (
                      <span className="text-white font-bold text-lg">✓</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 text-center mt-3">
              Green dots show active learning days
            </p>
          </div>

          {/* Conversation Starter */}
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-100">
            <div className="flex items-start gap-3">
              <ChatBubbleLeftIcon className="w-6 h-6 text-optio-purple mt-1" />
              <div>
                <h4 className="font-semibold text-gray-800 mb-2">
                  💬 Conversation Starter
                </h4>
                <p className="text-gray-700 italic leading-relaxed">
                  "What story from Grandma surprised you most during your interview?"
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Key Benefits */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
        <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-xl p-6">
          <h4 className="font-semibold text-gray-800 mb-2">
            💚 Process-Focused Support
          </h4>
          <p className="text-sm text-gray-700">
            Parents see your flow, not your stress. They celebrate progress, not perfection.
          </p>
        </div>

        <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-xl p-6">
          <h4 className="font-semibold text-gray-800 mb-2">
            📊 Rhythm, Not Micromanagement
          </h4>
          <p className="text-sm text-gray-700">
            Weekly wins and gentle conversation starters—no pressure, just support.
          </p>
        </div>
      </div>

      {/* Philosophy Message */}
      <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-xl p-6 max-w-3xl mx-auto">
        <p className="text-center text-gray-700 italic">
          "Learning has its own rhythm. Parents help you find yours, not force someone else's."
        </p>
      </div>
    </div>
  );
};

export default ParentDashboardPreview;
