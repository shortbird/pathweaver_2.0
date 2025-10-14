import React, { memo } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import AdminQuests from '../components/admin/AdminQuests'
import AdminUsers from '../components/admin/AdminUsers'
import AdminQuestSuggestions from '../components/admin/AdminQuestSuggestions'
import AIContentPipeline from './admin/AIContentPipeline'
import AIQuestReview from '../components/admin/AIQuestReview'
import AIPerformanceAnalytics from '../components/admin/AIPerformanceAnalytics'
import AIPromptOptimizer from '../components/admin/AIPromptOptimizer'
import BatchQuestGenerator from '../components/admin/BatchQuestGenerator'
import BulkImageGenerator from '../components/admin/BulkImageGenerator'
import BadgeImageGenerator from '../components/admin/BadgeImageGenerator'
import TierManagement from '../components/admin/TierManagement'
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
          className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'admin' || currentPath === 'quests' ? 'border-b-2 border-gradient-to-r from-[#ef597b] to-[#6d469b] text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Quests
        </Link>
        <Link
          to="/admin/users"
          className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'users' ? 'border-b-2 border-gradient-to-r from-[#ef597b] to-[#6d469b] text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Users
        </Link>
        <Link
          to="/admin/quest-suggestions"
          className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'quest-suggestions' ? 'border-b-2 border-gradient-to-r from-[#ef597b] to-[#6d469b] text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Quest Suggestions
        </Link>
        <Link
          to="/admin/batch-generator"
          className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'batch-generator' ? 'border-b-2 border-gradient-to-r from-[#ef597b] to-[#6d469b] text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Batch Generator
        </Link>
        <Link
          to="/admin/quest-images"
          className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'quest-images' ? 'border-b-2 border-gradient-to-r from-[#ef597b] to-[#6d469b] text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Quest Images
        </Link>
        <Link
          to="/admin/badge-images"
          className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'badge-images' ? 'border-b-2 border-gradient-to-r from-[#ef597b] to-[#6d469b] text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Badge Images
        </Link>
        <Link
          to="/admin/subscription-tiers"
          className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'subscription-tiers' ? 'border-b-2 border-gradient-to-r from-[#ef597b] to-[#6d469b] text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Subscription Tiers
        </Link>
        <Link
          to="/admin/site-settings"
          className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'site-settings' ? 'border-b-2 border-gradient-to-r from-[#ef597b] to-[#6d469b] text-purple-600' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Site Settings
        </Link>
      </div>

      <Routes>
        <Route index element={<AdminQuests />} />
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
        <Route path="badge-images" element={<BadgeImageGenerator />} />
      </Routes>
    </div>
  )
}

export default memo(AdminPage)
