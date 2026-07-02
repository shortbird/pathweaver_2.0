import React from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { switchSurfaceInApp } from '../../utils/appSurface'

/**
 * SIS console sidebar. Distinct from the learning app's Sidebar — this is the
 * staff-facing microschool management nav. Items are grouped into labeled sections
 * (People, Academics, Operations, Settings); the carved-out admin surfaces
 * (Organization, Advisor, Credit Review, Enroll Students, People) are folded into
 * the section where they best fit rather than a separate "Management" block.
 */

const icon = (path) => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
  </svg>
)

// Section-grouped nav. `end` forces exact matching (Dashboard). `superadmin: true`
// items render only for superadmins. Carved-out admin surfaces keep their original
// paths (registered in SisRoutes).
const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { name: 'Dashboard', path: '/', end: true, d: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    ],
  },
  {
    label: 'People',
    items: [
      { name: 'Users', path: '/users', d: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z' },
      { name: 'Staff', path: '/staff', d: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
      { name: 'Families', path: '/households', d: 'M13 7a4 4 0 11-8 0 4 4 0 018 0zM3 21v-1a6 6 0 0112 0v1M16 3.13a4 4 0 010 7.75M21 21v-1a6 6 0 00-4-5.659' },
    ],
  },
  {
    label: 'Academics',
    items: [
      { name: 'Classes', path: '/classes', d: 'M12 14l9-5-9-5-9 5 9 5z M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z' },
      { name: 'Calendar', path: '/calendar', d: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
      { name: 'Attendance', path: '/attendance', d: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Registration', path: '/registration', d: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { name: 'Resources', path: '/resources', d: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
      { name: 'Billing', path: '/billing', d: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
      { name: 'Messaging', path: '/messaging', d: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { name: 'Settings', path: '/settings', d: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    ],
  },
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

      <div className="px-3 pt-3">
        <button
          onClick={() => switchSurfaceInApp('learning', '/dashboard')}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink px-3 py-2 text-sm font-semibold text-white"
        >
          {icon('M11 19l-7-7 7-7m-7 7h18')}
          Switch to Learning app
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((it) => !it.superadmin || isSuperadmin)
          if (!items.length) return null
          return (
            <React.Fragment key={section.label || 'main'}>
              {section.label && (
                <div className="pt-4 pb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                  {section.label}
                </div>
              )}
              {items.map((item) => (
                <NavLink key={item.path} to={item.path} end={item.end} className={linkClass}>
                  <span className="text-neutral-500">{icon(item.d)}</span>
                  {item.name}
                </NavLink>
              ))}
            </React.Fragment>
          )
        })}
      </nav>
    </aside>
  )
}

export default SisSidebar
