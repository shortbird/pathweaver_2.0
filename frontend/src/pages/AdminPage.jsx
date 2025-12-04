import React, { memo } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import AdminOverview from '../components/admin/AdminOverview'
import AdminQuests from '../components/admin/AdminQuests'
import AdminBadges from '../components/admin/AdminBadges'
import AdminUsers from '../components/admin/AdminUsers'
import AdminConnections from '../components/admin/AdminConnections'
import AdminDashboard from '../components/admin/AdminDashboard'
import SiteSettings from '../components/admin/SiteSettings'
import FlaggedTasksPanel from '../components/admin/FlaggedTasksPanel'
import UserActivityLogPage from './admin/UserActivityLogPage'
import SparkLogsPanel from '../components/admin/SparkLogsPanel'
import CRMPage from './CRMPage'
import CourseImport from '../components/admin/CourseImport'

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
        {/* Admin-only tabs */}
        {isAdmin && (
          <>
            <Link
              to="/admin"
              className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'admin' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Overview
            </Link>
            <Link
              to="/admin/quests"
              className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'quests' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Quests
            </Link>
            <Link
              to="/admin/analytics"
              className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'analytics' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Analytics
            </Link>
            <Link
              to="/admin/badges"
              className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'badges' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Badges
            </Link>
            <Link
              to="/admin/users"
              className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'users' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Users
            </Link>
            <Link
              to="/admin/connections"
              className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'connections' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Connections
            </Link>
            <Link
              to="/admin/settings"
              className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'settings' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Settings
            </Link>
            <Link
              to="/admin/lms-logs"
              className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'lms-logs' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              LMS Logs
            </Link>
            <Link
              to="/admin/crm"
              className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'crm' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              CRM
            </Link>
            <Link
              to="/admin/course-import"
              className={`pb-2 px-1 whitespace-nowrap ${currentPath === 'course-import' ? 'border-b-2 border-optio-purple font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Course Import
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

      <Routes>
        <Route index element={<AdminOverview />} />
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
        <Route path="course-import" element={<CourseImport />} />
      </Routes>
    </div>
  )
}

export default memo(AdminPage)
