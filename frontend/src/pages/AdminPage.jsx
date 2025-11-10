import React, { memo } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import AdminQuests from '../components/admin/AdminQuests'
import AdminBadges from '../components/admin/AdminBadges'
import AdminUsers from '../components/admin/AdminUsers'
import AdminQuestSuggestions from '../components/admin/AdminQuestSuggestions'
import AdvisorAssignments from '../components/admin/AdvisorAssignments'
import AIContentPipeline from './admin/AIContentPipeline'
import AIQuestReview from '../components/admin/AIQuestReview'
import AIPerformanceAnalytics from '../components/admin/AIPerformanceAnalytics'
import AIPromptOptimizer from '../components/admin/AIPromptOptimizer'
import BatchContentGenerator from '../components/admin/BatchContentGenerator'
import SiteSettings from '../components/admin/SiteSettings'
import FlaggedTasksPanel from '../components/admin/FlaggedTasksPanel'
import AdminServices from '../components/admin/AdminServices'
import ServiceInquiries from '../components/admin/ServiceInquiries'

const AdminPage = () => {
  const location = useLocation()
  const currentPath = location.pathname.split('/').pop()
  const { user } = useAuth()

  // Determine if user is admin or advisor
  const isAdmin = user?.role === 'admin'
  const isAdvisor = user?.role === 'advisor'

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-8">
        {isAdvisor ? 'Advisor Panel' : 'Admin Panel'}
      </h1>

      <div className="flex gap-4 mb-8 border-b overflow-x-auto">
        {/* Quests tab - visible to all */}
        <Link
          to="/admin/quests"
          className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'admin' || currentPath === 'quests' ? 'border-b-2 border-purple-600 font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Quests
        </Link>

        {/* Admin-only tabs */}
        {isAdmin && (
          <>
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
              to="/admin/advisor-assignments"
              className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'advisor-assignments' ? 'border-b-2 border-purple-600 font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Advisor Assignments
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
            <Link
              to="/admin/services"
              className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'services' ? 'border-b-2 border-purple-600 font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Services
            </Link>
            <Link
              to="/admin/service-inquiries"
              className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'service-inquiries' ? 'border-b-2 border-purple-600 font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Inquiries
            </Link>
          </>
        )}
      </div>

      <Routes>
        <Route index element={<AdminQuests />} />
        <Route path="quests" element={<AdminQuests />} />
        <Route path="badges" element={<AdminBadges />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="advisor-assignments" element={<AdvisorAssignments />} />
        <Route path="quest-suggestions" element={<AdminQuestSuggestions />} />
        <Route path="flagged-tasks" element={<FlaggedTasksPanel />} />
        <Route path="site-settings" element={<SiteSettings />} />
        <Route path="services" element={<AdminServices />} />
        <Route path="service-inquiries" element={<ServiceInquiries />} />
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
