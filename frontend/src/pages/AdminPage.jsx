import React, { memo, lazy, Suspense } from 'react'
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// Lazy load all admin components to reduce initial bundle size
const AdminQuests = lazy(() => import('../components/admin/AdminQuests'))
const AdminUsers = lazy(() => import('../components/admin/AdminUsers'))
const FlaggedTasksPanel = lazy(() => import('../components/admin/FlaggedTasksPanel'))
const AutomatedEmailsList = lazy(() => import('../components/admin/AutomatedEmailsList'))
const OrganizationDashboard = lazy(() => import('./admin/OrganizationDashboard'))
const OrganizationManagement = lazy(() => import('./admin/OrganizationManagement'))
const CourseGeneratorWizard = lazy(() => import('./admin/CourseGeneratorWizard'))
const CourseGenerationQueue = lazy(() => import('./admin/CourseGenerationQueue'))
const TransferCreditForm = lazy(() => import('./admin/TransferCreditForm'))
const TranscriptGeneratorPage = lazy(() => import('./admin/TranscriptGeneratorPage'))
const CoursePlanMode = lazy(() => import('./admin/CoursePlanMode'))
const DocsManager = lazy(() => import('../components/admin/DocsManager'))
const BulkCourseGeneration = lazy(() => import('./admin/BulkCourseGeneration'))
const PhilosophyEditor = lazy(() => import('./admin/PhilosophyEditor'))
const ModerationQueue = lazy(() => import('../components/admin/ModerationQueue'))
const AdminClassesHub = lazy(() => import('./classes/AdminClassesHub'))

// Loading spinner component
const LoadingFallback = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
  </div>
)

const AdminPage = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const currentPath = location.pathname.split('/').pop()
  const { user } = useAuth()

  // Get effective role (resolves org_managed to org_role)
  const getEffectiveRole = (user) => {
    if (!user) return null
    if (user.role === 'superadmin') return 'superadmin'
    if (user.role === 'org_managed' && user.org_role) return user.org_role
    return user.role
  }

  const effectiveRole = getEffectiveRole(user)

  // Determine if user is admin or advisor
  const isAdmin = effectiveRole === 'org_admin' || effectiveRole === 'superadmin'
  const isSuperadmin = effectiveRole === 'superadmin'
  const isAdvisor = effectiveRole === 'advisor'

  // Define admin tabs for both mobile dropdown and desktop tabs
  const adminTabs = [
    { path: '', label: 'Quests', pathMatch: ['admin', 'quests', ''] },
    { path: 'users', label: 'Users' },
{ path: 'emails', label: 'Emails' },
    { path: 'organizations', label: 'Organizations' }
  ]

  const superadminTabs = [
    { path: 'classes', label: 'Classes' },
    { path: 'moderation', label: 'Moderation' },
    { path: 'bulk-generate', label: 'Bulk Generate' },
    { path: 'docs', label: 'Docs' },
    { path: 'philosophy', label: 'Philosophy' }
  ]

  const getTabIsActive = (tab) => {
    if (tab.pathMatch) {
      return tab.pathMatch.includes(currentPath)
    }
    return currentPath === tab.path
  }

  const handleMobileNavChange = (e) => {
    const path = e.target.value
    navigate(path ? `/admin/${path}` : '/admin')
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-8">
        {isAdvisor ? 'Advisor Panel' : 'Admin Panel'}
      </h1>

      {/* Mobile: dropdown navigation */}
      <div className="md:hidden w-full mb-6">
        <select
          value={currentPath === 'admin' ? '' : currentPath}
          onChange={handleMobileNavChange}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg min-h-[44px] bg-white text-gray-900 font-medium focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
          aria-label="Navigate admin sections"
        >
          {isAdmin && adminTabs.map(tab => (
            <option key={tab.path} value={tab.path}>{tab.label}</option>
          ))}
          {isSuperadmin && superadminTabs.map(tab => (
            <option key={tab.path} value={tab.path}>{tab.label}</option>
          ))}
          {isAdvisor && !isAdmin && (
            <option value="">Quests</option>
          )}
        </select>
      </div>

      {/* Desktop: horizontal tabs */}
      <div className="hidden md:flex gap-4 mb-8 border-b overflow-x-auto scroll-smooth">
        {/* Admin-only tabs */}
        {isAdmin && adminTabs.map(tab => (
          <Link
            key={tab.path}
            to={tab.path ? `/admin/${tab.path}` : '/admin'}
            className={`pb-2 px-4 whitespace-nowrap min-h-[44px] flex items-center ${
              getTabIsActive(tab)
                ? 'border-b-2 border-optio-purple font-bold text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </Link>
        ))}

        {/* Superadmin-only tabs */}
        {isSuperadmin && superadminTabs.map(tab => {
          const isActive = location.pathname.startsWith(`/admin/${tab.path}`)
          return (
            <Link
              key={tab.path}
              to={`/admin/${tab.path}`}
              className={`pb-2 px-4 whitespace-nowrap min-h-[44px] flex items-center ${
                isActive
                  ? 'border-b-2 border-optio-purple font-bold text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}

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
          <Route path="users" element={<AdminUsers />} />
          <Route path="flagged-tasks" element={<FlaggedTasksPanel />} />
          <Route path="user/:userId/transfer-credits" element={<TransferCreditForm />} />
          <Route path="user/:userId/transcript" element={<TranscriptGeneratorPage />} />
          <Route path="emails" element={<AutomatedEmailsList />} />
          <Route path="organizations" element={<OrganizationDashboard />} />
          <Route path="organizations/:orgId" element={<OrganizationManagement />} />
          <Route path="generate-course" element={<CourseGeneratorWizard />} />
          <Route path="generate-course/:courseId" element={<CourseGeneratorWizard />} />
          <Route path="course-generation-queue" element={<CourseGenerationQueue />} />
          <Route path="course-plan" element={<CoursePlanMode />} />
          <Route path="course-plan/:sessionId" element={<CoursePlanMode />} />
          <Route path="bulk-generate" element={<BulkCourseGeneration />} />
          <Route path="docs" element={<DocsManager />} />
          <Route path="philosophy" element={<PhilosophyEditor />} />
          <Route path="moderation" element={<ModerationQueue />} />
          <Route path="classes/*" element={<AdminClassesHub />} />
        </Routes>
      </Suspense>
    </div>
  )
}

export default memo(AdminPage)
