import React, { memo } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import AdminDashboard from '../components/admin/AdminDashboard'
import AdminQuests from '../components/admin/AdminQuests'
import AdminUsers from '../components/admin/AdminUsers'
import AdminQuestSuggestions from '../components/admin/AdminQuestSuggestions'
import SiteSettings from '../components/admin/SiteSettings'
import BadgeSeeder from './admin/BadgeSeeder'
import BadgeQuestLinker from '../components/admin/BadgeQuestLinker'
import AIContentPipeline from './admin/AIContentPipeline'
import AIQuestReview from '../components/admin/AIQuestReview'
import AIPerformanceAnalytics from '../components/admin/AIPerformanceAnalytics'

const AdminPage = () => {
  const location = useLocation()
  const currentPath = location.pathname.split('/').pop()

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-8">Admin Panel</h1>

      <div className="flex gap-4 mb-8 border-b">
        <Link
          to="/admin"
          className={`pb-2 px-1 ${currentPath === 'admin' ? 'border-b-2 border-primary text-primary' : 'text-gray-600'}`}
        >
          Dashboard
        </Link>
        <Link
          to="/admin/quests"
          className={`pb-2 px-1 ${currentPath === 'quests' ? 'border-b-2 border-primary text-primary' : 'text-gray-600'}`}
        >
          Quests
        </Link>
        <Link
          to="/admin/users"
          className={`pb-2 px-1 ${currentPath === 'users' ? 'border-b-2 border-primary text-primary' : 'text-gray-600'}`}
        >
          Users
        </Link>
        <Link
          to="/admin/quest-suggestions"
          className={`pb-2 px-1 ${currentPath === 'quest-suggestions' ? 'border-b-2 border-primary text-primary' : 'text-gray-600'}`}
        >
          Quest Suggestions
        </Link>
        <Link
          to="/admin/settings"
          className={`pb-2 px-1 ${currentPath === 'settings' ? 'border-b-2 border-primary text-primary' : 'text-gray-600'}`}
        >
          Site Settings
        </Link>
        <Link
          to="/admin/badge-seeder"
          className={`pb-2 px-1 ${currentPath === 'badge-seeder' ? 'border-b-2 border-primary text-primary' : 'text-gray-600'}`}
        >
          Badge Seeder
        </Link>
        <Link
          to="/admin/badge-quests"
          className={`pb-2 px-1 ${currentPath === 'badge-quests' ? 'border-b-2 border-primary text-primary' : 'text-gray-600'}`}
        >
          Badge-Quest Linking
        </Link>
        <Link
          to="/admin/ai-pipeline"
          className={`pb-2 px-1 ${currentPath === 'ai-pipeline' ? 'border-b-2 border-primary text-primary' : 'text-gray-600'}`}
        >
          AI Pipeline
        </Link>
        <Link
          to="/admin/ai-quest-review"
          className={`pb-2 px-1 ${currentPath === 'ai-quest-review' ? 'border-b-2 border-primary text-primary' : 'text-gray-600'}`}
        >
          AI Quest Review
        </Link>
        <Link
          to="/admin/ai-performance"
          className={`pb-2 px-1 ${currentPath === 'ai-performance' ? 'border-b-2 border-primary text-primary' : 'text-gray-600'}`}
        >
          AI Performance
        </Link>
      </div>

      <Routes>
        <Route index element={<AdminDashboard />} />
        <Route path="quests" element={<AdminQuests />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="quest-suggestions" element={<AdminQuestSuggestions />} />
        <Route path="settings" element={<SiteSettings />} />
        <Route path="badge-seeder" element={<BadgeSeeder />} />
        <Route path="badge-quests" element={<BadgeQuestLinker />} />
        <Route path="ai-pipeline" element={<AIContentPipeline />} />
        <Route path="ai-quest-review" element={<AIQuestReview />} />
        <Route path="ai-performance" element={<AIPerformanceAnalytics />} />
      </Routes>
    </div>
  )
}

export default memo(AdminPage)