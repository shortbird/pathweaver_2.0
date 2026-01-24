import React, { memo, lazy, Suspense } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

// Lazy load AI management components
const OverviewTab = lazy(() => import('../../components/admin/ai/AIOverviewTab'))
const PromptEditorTab = lazy(() => import('../../components/admin/ai/PromptEditorTab'))
const MetricsTab = lazy(() => import('../../components/admin/ai/AIMetricsTab'))
const CostAnalyticsTab = lazy(() => import('../../components/admin/ai/AICostAnalyticsTab'))
const ReviewQueueTab = lazy(() => import('../../components/admin/ai/ReviewQueueTab'))

// Loading spinner component
const LoadingFallback = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
  </div>
)

const AIManagement = () => {
  const location = useLocation()
  const currentPath = location.pathname.split('/').pop()
  const { user } = useAuth()

  // Only superadmin should access this page
  const isSuperadmin = user?.role === 'superadmin'

  if (!isSuperadmin) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Access denied. This page is only accessible to superadmins.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-8 bg-gradient-to-r from-optio-purple to-optio-pink bg-clip-text text-transparent">
        AI Prompt Management
      </h1>

      <div className="flex gap-4 mb-8 border-b overflow-x-auto scroll-smooth">
        <Link
          to="/admin/ai"
          className={`pb-2 px-4 whitespace-nowrap min-h-[44px] flex items-center ${
            currentPath === 'ai' || currentPath === 'overview'
              ? 'border-b-2 border-optio-purple font-bold text-gray-900'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Overview
        </Link>
        <Link
          to="/admin/ai/prompt-editor"
          className={`pb-2 px-4 whitespace-nowrap min-h-[44px] flex items-center ${
            currentPath === 'prompt-editor'
              ? 'border-b-2 border-optio-purple font-bold text-gray-900'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Prompt Editor
        </Link>
        <Link
          to="/admin/ai/metrics"
          className={`pb-2 px-4 whitespace-nowrap min-h-[44px] flex items-center ${
            currentPath === 'metrics'
              ? 'border-b-2 border-optio-purple font-bold text-gray-900'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Metrics
        </Link>
        <Link
          to="/admin/ai/costs"
          className={`pb-2 px-4 whitespace-nowrap min-h-[44px] flex items-center ${
            currentPath === 'costs'
              ? 'border-b-2 border-optio-purple font-bold text-gray-900'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Cost Analytics
        </Link>
        <Link
          to="/admin/ai/review-queue"
          className={`pb-2 px-4 whitespace-nowrap min-h-[44px] flex items-center ${
            currentPath === 'review-queue'
              ? 'border-b-2 border-optio-purple font-bold text-gray-900'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Review Queue
        </Link>
      </div>

      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route index element={<OverviewTab />} />
          <Route path="overview" element={<OverviewTab />} />
          <Route path="prompt-editor" element={<PromptEditorTab />} />
          <Route path="metrics" element={<MetricsTab />} />
          <Route path="costs" element={<CostAnalyticsTab />} />
          <Route path="review-queue" element={<ReviewQueueTab />} />
        </Routes>
      </Suspense>
    </div>
  )
}

export default memo(AIManagement)
