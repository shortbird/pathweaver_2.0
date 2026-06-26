import React from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { goToLearningSurface } from '../../utils/appSurface'

/**
 * SIS console sidebar. Distinct from the learning app's Sidebar — this is the
 * staff-facing microschool management nav. New SIS tools sit at the top; the
 * carved-out admin surfaces (Organization, People, Advisor, Credit Review,
 * Enrollment) follow.
 */

const icon = (path) => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
  </svg>
)

const SIS_NAV = [
  { name: 'Dashboard', path: '/', end: true, d: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { name: 'Roster', path: '/roster', d: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z' },
  { name: 'Classes', path: '/classes', d: 'M12 14l9-5-9-5-9 5 9 5z M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z' },
  { name: 'Registrations', path: '/registrations', d: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
  { name: 'Families', path: '/households', d: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { name: 'Messaging', path: '/messaging', d: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
]

// Carved-out admin surfaces, registered in SisRoutes at their original paths.
const MANAGE_NAV = [
  { name: 'Organization', path: '/organization', d: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { name: 'Advisor', path: '/advisor/dashboard', d: 'M12 14l9-5-9-5-9 5 9 5z M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z' },
  { name: 'Credit Review', path: '/credit-dashboard', d: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { name: 'Enroll Students', path: '/enroll-students', d: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z' },
]

const linkClass = ({ isActive }) => `
  flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium font-poppins transition-colors
  ${isActive
    ? 'bg-gradient-to-r from-[#F3EFF4] to-[#E7D5F2] text-optio-purple font-semibold'
    : 'text-neutral-700 hover:bg-[#F3EFF4]'}
`

const SisSidebar = () => {
  const { user } = useAuth()
  const isSuperadmin = user?.role === 'superadmin'

  return (
    <aside className="fixed top-0 left-0 bottom-0 w-60 bg-white border-r border-gray-200 flex flex-col z-40">
      <div className="h-16 flex items-center gap-2 px-5 border-b border-gray-100">
        <img
          src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png"
          alt="Optio"
          className="h-8 w-auto"
        />
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">SIS</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {SIS_NAV.map((item) => (
          <NavLink key={item.path} to={item.path} end={item.end} className={linkClass}>
            <span className="text-neutral-500">{icon(item.d)}</span>
            {item.name}
          </NavLink>
        ))}

        <div className="pt-4 pb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          Management
        </div>
        {MANAGE_NAV.map((item) => (
          <NavLink key={item.path} to={item.path} className={linkClass}>
            <span className="text-neutral-500">{icon(item.d)}</span>
            {item.name}
          </NavLink>
        ))}
        {isSuperadmin && (
          <NavLink to="/admin/users" className={linkClass}>
            <span className="text-neutral-500">{icon('M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z')}</span>
            People (All Users)
          </NavLink>
        )}
      </nav>

      <div className="border-t border-gray-100 p-3">
        <button
          onClick={() => goToLearningSurface('/')}
          className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
        >
          {icon('M11 19l-7-7 7-7m-7 7h18')}
          Back to Learning app
        </button>
      </div>
    </aside>
  )
}

export default SisSidebar
