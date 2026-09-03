import React, { memo, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import GlassTabBar from '../components/ui/GlassTabBar'
import { Spinner } from '../components/ui/Spinner'

// Lazy load all admin components to reduce initial bundle size
const AdminQuests = lazy(() => import('../components/admin/AdminQuests'))
const AdminUsers = lazy(() => import('../components/admin/AdminUsers'))
const FlaggedTasksPanel = lazy(() => import('../components/admin/FlaggedTasksPanel'))
const OrganizationDashboard = lazy(() => import('./admin/OrganizationDashboard'))
const OrganizationManagement = lazy(() => import('./admin/OrganizationManagement'))
const CourseGeneratorWizard = lazy(() => import('./admin/CourseGeneratorWizard'))
const CourseGenerationQueue = lazy(() => import('./admin/CourseGenerationQueue'))
const TransferCreditForm = lazy(() => import('./admin/TransferCreditForm'))
const TranscriptGeneratorPage = lazy(() => import('./admin/TranscriptGeneratorPage'))
const CoursePlanMode = lazy(() => import('./admin/CoursePlanMode'))
const DocsManager = lazy(() => import('../components/admin/DocsManager'))
const BulkCourseGeneration = lazy(() => import('./admin/BulkCourseGeneration'))
const ModerationQueue = lazy(() => import('../components/admin/ModerationQueue'))
const RosterImportPage = lazy(() => import('./admin/RosterImportPage'))
const CrmConsole = lazy(() => import('./admin/crm/CrmConsole'))

// Loading spinner component
const LoadingFallback = () => (
  <div className="flex justify-center items-center h-64">
    <Spinner size="lg" />
  </div>
)

// The whole /admin/* tree is superadmin-only (App.jsx wraps it in
// PrivateRoute requiredRole="superadmin"), so this page renders for exactly
// one role. It used to carry an unreachable "Teacher Panel" shell — role
// branches for advisors and org_admins who can never get here (blocks P5).
const ADMIN_TABS = [
  { path: 'users', label: 'Users', pathMatch: ['admin', 'users', ''] },
  { path: 'quests', label: 'Quests' },
  { path: 'organizations', label: 'Organizations' },
  { path: 'crm', label: 'CRM' },
  { path: 'moderation', label: 'Moderation' },
  { path: 'roster-import', label: 'Roster Import' },
  { path: 'bulk-generate', label: 'Bulk Generate' },
  { path: 'docs', label: 'Docs' }
]

const AdminPage = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const currentPath = location.pathname.split('/').pop()

  const getTabIsActive = (tab) => {
    if (tab.pathMatch) {
      return tab.pathMatch.includes(currentPath)
    }
    return location.pathname.startsWith(`/admin/${tab.path}`)
  }

  const handleMobileNavChange = (e) => {
    const path = e.target.value
    navigate(path ? `/admin/${path}` : '/admin')
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-8">Admin Panel</h1>

      {/* Mobile: dropdown navigation */}
      <div className="md:hidden w-full mb-6">
        <select
          value={currentPath === 'admin' ? '' : currentPath}
          onChange={handleMobileNavChange}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg min-h-[44px] bg-white text-gray-900 font-medium focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
          aria-label="Navigate admin sections"
        >
          {ADMIN_TABS.map(tab => (
            <option key={tab.path} value={tab.path}>{tab.label}</option>
          ))}
        </select>
      </div>

      {/* Desktop: glass tab bar (hidden automatically below 2 tabs) */}
      <div className="hidden md:block mb-8">
        <GlassTabBar
          size="md"
          aria-label="Admin sections"
          tabs={ADMIN_TABS.map(tab => ({ id: tab.path, label: tab.label }))}
          active={ADMIN_TABS.find(getTabIsActive)?.path}
          onSelect={(path) => navigate(`/admin/${path}`)}
        />
      </div>

      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route index element={<Navigate to="users" replace />} />
          <Route path="quests" element={<AdminQuests />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="flagged-tasks" element={<FlaggedTasksPanel />} />
          <Route path="user/:userId/transfer-credits" element={<TransferCreditForm />} />
          <Route path="user/:userId/transcript" element={<TranscriptGeneratorPage />} />
          <Route path="organizations" element={<OrganizationDashboard />} />
          <Route path="organizations/:orgId" element={<OrganizationManagement />} />
          <Route path="generate-course" element={<CourseGeneratorWizard />} />
          <Route path="generate-course/:courseId" element={<CourseGeneratorWizard />} />
          <Route path="course-generation-queue" element={<CourseGenerationQueue />} />
          <Route path="course-plan" element={<CoursePlanMode />} />
          <Route path="course-plan/:sessionId" element={<CoursePlanMode />} />
          <Route path="bulk-generate" element={<BulkCourseGeneration />} />
          <Route path="docs" element={<DocsManager />} />
          <Route path="moderation" element={<ModerationQueue />} />
          <Route path="roster-import" element={<RosterImportPage />} />
          <Route path="crm/*" element={<CrmConsole />} />
        </Routes>
      </Suspense>
    </div>
  )
}

export default memo(AdminPage)
