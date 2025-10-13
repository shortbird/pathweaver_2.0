import React, { memo, useState } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import AdminDashboard from '../components/admin/AdminDashboard'
import AdminQuests from '../components/admin/AdminQuests'
import AdminUsers from '../components/admin/AdminUsers'
import AdminQuestSuggestions from '../components/admin/AdminQuestSuggestions'
import AIContentPipeline from './admin/AIContentPipeline'
import AIQuestReview from '../components/admin/AIQuestReview'
import AIPerformanceAnalytics from '../components/admin/AIPerformanceAnalytics'
import AIPromptOptimizer from '../components/admin/AIPromptOptimizer'
import BatchQuestGenerator from '../components/admin/BatchQuestGenerator'
import BulkImageGenerator from '../components/admin/BulkImageGenerator'
import TierManagement from '../components/admin/TierManagement'
import SiteSettings from '../components/admin/SiteSettings'

const AdminPage = () => {
  const location = useLocation()
  const currentPath = location.pathname.split('/').pop()
  const [showAIDropdown, setShowAIDropdown] = useState(false)

  const isAIPath = ['ai-pipeline', 'ai-quest-review', 'ai-performance', 'ai-optimizer', 'batch-generator', 'quest-images'].includes(currentPath)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-8">Admin Panel</h1>

      <div className="flex gap-4 mb-8 border-b">
        <Link
          to="/admin"
          className={`pb-2 px-1 ${currentPath === 'admin' ? 'border-b-2 border-gradient-to-r from-[#ef597b] to-[#6d469b] text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Dashboard
        </Link>
        <Link
          to="/admin/quests"
          className={`pb-2 px-1 ${currentPath === 'quests' ? 'border-b-2 border-gradient-to-r from-[#ef597b] to-[#6d469b] text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Quests
        </Link>
        <Link
          to="/admin/users"
          className={`pb-2 px-1 ${currentPath === 'users' ? 'border-b-2 border-gradient-to-r from-[#ef597b] to-[#6d469b] text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Users
        </Link>
        <Link
          to="/admin/quest-suggestions"
          className={`pb-2 px-1 ${currentPath === 'quest-suggestions' ? 'border-b-2 border-gradient-to-r from-[#ef597b] to-[#6d469b] text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Quest Suggestions
        </Link>
        <Link
          to="/admin/subscription-tiers"
          className={`pb-2 px-1 ${currentPath === 'subscription-tiers' ? 'border-b-2 border-gradient-to-r from-[#ef597b] to-[#6d469b] text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Subscription Tiers
        </Link>
        <Link
          to="/admin/site-settings"
          className={`pb-2 px-1 ${currentPath === 'site-settings' ? 'border-b-2 border-gradient-to-r from-[#ef597b] to-[#6d469b] text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Site Settings
        </Link>
        <div className="relative">
          <button
            onClick={() => setShowAIDropdown(!showAIDropdown)}
            className={`pb-2 px-1 flex items-center gap-1 ${isAIPath ? 'border-b-2 border-gradient-to-r from-[#ef597b] to-[#6d469b] text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            AI Tools
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showAIDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-[200px] z-50">
              <Link
                to="/admin/ai-pipeline"
                onClick={() => setShowAIDropdown(false)}
                className={`block px-4 py-2 text-sm ${currentPath === 'ai-pipeline' ? 'bg-purple-50 text-purple-600' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                AI Content Pipeline
              </Link>
              <Link
                to="/admin/ai-quest-review"
                onClick={() => setShowAIDropdown(false)}
                className={`block px-4 py-2 text-sm ${currentPath === 'ai-quest-review' ? 'bg-purple-50 text-purple-600' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                AI Quest Review
              </Link>
              <Link
                to="/admin/ai-performance"
                onClick={() => setShowAIDropdown(false)}
                className={`block px-4 py-2 text-sm ${currentPath === 'ai-performance' ? 'bg-purple-50 text-purple-600' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                AI Performance Analytics
              </Link>
              <Link
                to="/admin/ai-optimizer"
                onClick={() => setShowAIDropdown(false)}
                className={`block px-4 py-2 text-sm ${currentPath === 'ai-optimizer' ? 'bg-purple-50 text-purple-600' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                AI Prompt Optimizer
              </Link>
              <div className="border-t border-gray-200 my-2"></div>
              <Link
                to="/admin/batch-generator"
                onClick={() => setShowAIDropdown(false)}
                className={`block px-4 py-2 text-sm ${currentPath === 'batch-generator' ? 'bg-purple-50 text-purple-600' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                Batch Quest Generator
              </Link>
              <Link
                to="/admin/quest-images"
                onClick={() => setShowAIDropdown(false)}
                className={`block px-4 py-2 text-sm ${currentPath === 'quest-images' ? 'bg-purple-50 text-purple-600' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                Quest Images
              </Link>
            </div>
          )}
        </div>
      </div>

      <Routes>
        <Route index element={<AdminDashboard />} />
        <Route path="quests" element={<AdminQuests />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="quest-suggestions" element={<AdminQuestSuggestions />} />
        <Route path="subscription-tiers" element={<TierManagement />} />
        <Route path="site-settings" element={<SiteSettings />} />
        <Route path="ai-pipeline" element={<AIContentPipeline />} />
        <Route path="ai-quest-review" element={<AIQuestReview />} />
        <Route path="ai-performance" element={<AIPerformanceAnalytics />} />
        <Route path="ai-optimizer" element={<AIPromptOptimizer />} />
        <Route path="batch-generator" element={<BatchQuestGenerator />} />
        <Route path="quest-images" element={<BulkImageGenerator />} />
      </Routes>
    </div>
  )
}

export default memo(AdminPage)