import React from 'react'
import { Link, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import AdminClassReviewQueue from './AdminClassReviewQueue'
import AdminPlatformSettings from './AdminPlatformSettings'

/**
 * AdminClassesHub — single landing page for everything related to student-curated
 * classes. Renders sub-tabs that swap between the review queue and the platform
 * settings (teacher-of-record bio shown on every class page).
 *
 * Routes (mounted under /admin/classes/*):
 *   /admin/classes                  -> redirects to /admin/classes/review
 *   /admin/classes/review           -> review queue
 *   /admin/classes/platform-settings -> teacher-of-record bio editor
 */
const AdminClassesHub = () => {
  const location = useLocation()
  const subPath = location.pathname.split('/admin/classes/')[1] || 'review'

  const subTabs = [
    { path: 'review', label: 'Review queue' },
    { path: 'platform-settings', label: 'Teacher of record' },
  ]

  return (
    <div>
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {subTabs.map((t) => {
            const isActive = subPath.startsWith(t.path)
            return (
              <Link
                key={t.path}
                to={`/admin/classes/${t.path}`}
                className={`pb-3 px-1 border-b-2 text-sm font-medium whitespace-nowrap ${
                  isActive
                    ? 'border-optio-purple text-optio-purple'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                {t.label}
              </Link>
            )
          })}
        </nav>
      </div>

      <Routes>
        <Route index element={<Navigate to="review" replace />} />
        <Route path="review" element={<AdminClassReviewQueue />} />
        <Route path="platform-settings" element={<AdminPlatformSettings />} />
      </Routes>
    </div>
  )
}

export default AdminClassesHub
