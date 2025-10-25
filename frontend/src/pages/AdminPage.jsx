import React, { memo } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import AdminQuests from '../components/admin/AdminQuests'
import AdminBadges from '../components/admin/AdminBadges'
import AdminUsers from '../components/admin/AdminUsers'
import AdminQuestSuggestions from '../components/admin/AdminQuestSuggestions'
import AIContentPipeline from './admin/AIContentPipeline'
import AIQuestReview from '../components/admin/AIQuestReview'
import AIPerformanceAnalytics from '../components/admin/AIPerformanceAnalytics'
import AIPromptOptimizer from '../components/admin/AIPromptOptimizer'
import BatchContentGenerator from '../components/admin/BatchContentGenerator'
import SiteSettings from '../components/admin/SiteSettings'

const AdminPage = () => {
  const location = useLocation()
  const currentPath = location.pathname.split('/').pop()

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-8">Admin Panel</h1>

      <div className="flex gap-4 mb-8 border-b overflow-x-auto">
        <Link
          to="/admin/quests"
          className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'admin' || currentPath === 'quests' ? 'border-b-2 border-purple-600 font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Quests
        </Link>
        <Link
          to="/admin/badges"
          className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'badges' ? 'border-b-2 border-purple-600 font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Badges
        </Link>
        <Link
          to="/admin/users"
          className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'users' ? 'border-b-2 border-purple-600 font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Users
        </Link>
        <Link
          to="/admin/quest-suggestions"
          className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'quest-suggestions' ? 'border-b-2 border-purple-600 font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Quest Suggestions
        </Link>
        <Link
          to="/admin/batch-generator"
          className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'batch-generator' ? 'border-b-2 border-purple-600 font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Batch Generator
        </Link>
        <Link
          to="/admin/site-settings"
          className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'site-settings' ? 'border-b-2 border-purple-600 font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Site Settings
        </Link>
      </div>

      <Routes>
        <Route index element={<AdminQuests />} />
        <Route path="quests" element={<AdminQuests />} />
        <Route path="badges" element={<AdminBadges />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="quest-suggestions" element={<AdminQuestSuggestions />} />
        <Route path="site-settings" element={<SiteSettings />} />
        <Route path="ai-pipeline" element={<AIContentPipeline />} />
        <Route path="ai-quest-review" element={<AIQuestReview />} />
        <Route path="ai-performance" element={<AIPerformanceAnalytics />} />
        <Route path="ai-optimizer" element={<AIPromptOptimizer />} />
        <Route path="batch-generator" element={<BatchContentGenerator />} />
      </Routes>
    </div>
  )
}

export default memo(AdminPage)
