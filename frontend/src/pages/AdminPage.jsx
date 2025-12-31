import React, { memo, lazy, Suspense } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// Lazy load all admin components to reduce initial bundle size
const AdminQuests = lazy(() => import('../components/admin/AdminQuests'))
const AdminBadges = lazy(() => import('../components/admin/AdminBadges'))
const AdminUsers = lazy(() => import('../components/admin/AdminUsers'))
const AdminConnections = lazy(() => import('../components/admin/AdminConnections'))
const AdminDashboard = lazy(() => import('../components/admin/AdminDashboard'))
const SiteSettings = lazy(() => import('../components/admin/SiteSettings'))
const FlaggedTasksPanel = lazy(() => import('../components/admin/FlaggedTasksPanel'))
const UserActivityLogPage = lazy(() => import('./admin/UserActivityLogPage'))
const SparkLogsPanel = lazy(() => import('../components/admin/SparkLogsPanel'))
const CRMPage = lazy(() => import('./CRMPage'))
const SubjectReviewPage = lazy(() => import('./admin/SubjectReviewPage'))
const OrganizationDashboard = lazy(() => import('./admin/OrganizationDashboard'))
const OrganizationManagement = lazy(() => import('./admin/OrganizationManagement'))
const ObserverAuditLog = lazy(() => import('../components/admin/ObserverAuditLog'))
const ParentalConsentReviewPage = lazy(() => import('./admin/ParentalConsentReviewPage'))

// Loading spinner component
const LoadingFallback = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
  </div>
)

const AdminPage = () => {
  const location = useLocation()
  const currentPath = location.pathname.split('/').pop()
  const { user } = useAuth()

  // Determine if user is admin or advisor
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const isAdvisor = user?.role === 'advisor'

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-8">
        {isAdvisor ? 'Advisor Panel' : 'Admin Panel'}
      </h1>

      <div className="flex gap-4 mb-8 border-b overflow-x-auto scroll-smooth">
        {/* Admin-only tabs */}
        {isAdmin && (
          <>
            <Link
              to="/admin"
              className={`pb-2 px-4 whitespace-nowrap min-h-[44px] flex items-center ${currentPath === 'admin' || currentPath === 'quests' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Quests
            </Link>
            <Link
              to="/admin/analytics"
              className={`pb-2 px-4 whitespace-nowrap min-h-[44px] flex items-center ${currentPath === 'analytics' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Analytics
            </Link>
            <Link
              to="/admin/badges"
              className={`pb-2 px-4 whitespace-nowrap min-h-[44px] flex items-center ${currentPath === 'badges' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Badges
            </Link>
            <Link
              to="/admin/users"
              className={`pb-2 px-4 whitespace-nowrap min-h-[44px] flex items-center ${currentPath === 'users' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Users
            </Link>
            <Link
              to="/admin/connections"
              className={`pb-2 px-4 whitespace-nowrap min-h-[44px] flex items-center ${currentPath === 'connections' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Connections
            </Link>
            <Link
              to="/admin/settings"
              className={`pb-2 px-4 whitespace-nowrap min-h-[44px] flex items-center ${currentPath === 'settings' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Settings
            </Link>
            <Link
              to="/admin/lms-logs"
              className={`pb-2 px-4 whitespace-nowrap min-h-[44px] flex items-center ${currentPath === 'lms-logs' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              LMS Logs
            </Link>
            <Link
              to="/admin/crm"
              className={`pb-2 px-4 whitespace-nowrap min-h-[44px] flex items-center ${currentPath === 'crm' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              CRM
            </Link>
            <Link
              to="/admin/subject-review"
              className={`pb-2 px-4 whitespace-nowrap min-h-[44px] flex items-center ${currentPath === 'subject-review' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Subject Review
            </Link>
            <Link
              to="/admin/organizations"
              className={`pb-2 px-4 whitespace-nowrap min-h-[44px] flex items-center ${currentPath === 'organizations' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Organizations
            </Link>
            <Link
              to="/admin/observer-audit"
              className={`pb-2 px-4 whitespace-nowrap min-h-[44px] flex items-center ${currentPath === 'observer-audit' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Observer Audit
            </Link>
            <Link
              to="/admin/parental-consent"
              className={`pb-2 px-4 whitespace-nowrap min-h-[44px] flex items-center ${currentPath === 'parental-consent' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Parental Consent
            </Link>
          </>
        )}

        {/* Quests tab - visible to advisors */}
        {isAdvisor && !isAdmin && (
          <Link
            to="/admin/quests"
            className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'admin' || currentPath === 'quests' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Quests
          </Link>
        )}
      </div>

      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route index element={<AdminQuests />} />
          <Route path="quests" element={<AdminQuests />} />
          <Route path="analytics" element={<AdminDashboard />} />
          <Route path="badges" element={<AdminBadges />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="connections" element={<AdminConnections />} />
          <Route path="settings" element={<SiteSettings />} />
          <Route path="flagged-tasks" element={<FlaggedTasksPanel />} />
          <Route path="user/:userId/activity" element={<UserActivityLogPage />} />
          <Route path="lms-logs" element={<SparkLogsPanel />} />
          <Route path="crm" element={<CRMPage />} />
          <Route path="subject-review" element={<SubjectReviewPage />} />
          <Route path="organizations" element={<OrganizationDashboard />} />
          <Route path="organizations/:orgId" element={<OrganizationManagement />} />
          <Route path="observer-audit" element={<ObserverAuditLog />} />
          <Route path="parental-consent" element={<ParentalConsentReviewPage />} />
        </Routes>
      </Suspense>
    </div>
  )
}

export default memo(AdminPage)
