import React from 'react'

/**
 * Color-coded role pills for the SIS. Keeps role display visual (a colored pill
 * with a dot) rather than plain text. Maps both household relationships
 * (student/guardian/other) and staff org roles (advisor/org_admin) to a role.
 */
const ROLES = {
  student: { label: 'Student', cls: 'bg-sky-100 text-sky-700' },
  guardian: { label: 'Parent', cls: 'bg-emerald-100 text-emerald-700' },
  parent: { label: 'Parent', cls: 'bg-emerald-100 text-emerald-700' },
  advisor: { label: 'Teacher', cls: 'bg-violet-100 text-violet-700' },
  teacher: { label: 'Teacher', cls: 'bg-violet-100 text-violet-700' },
  org_admin: { label: 'Admin', cls: 'bg-amber-100 text-amber-700' },
  admin: { label: 'Admin', cls: 'bg-amber-100 text-amber-700' },
  observer: { label: 'Observer', cls: 'bg-neutral-100 text-neutral-600' },
  other: { label: 'Other', cls: 'bg-neutral-100 text-neutral-600' },
}

export const RolePill = ({ role, label }) => {
  const r = ROLES[role] || { label: label || role, cls: 'bg-neutral-100 text-neutral-600' }
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 ${r.cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {label || r.label}
    </span>
  )
}

export const PrimaryTag = () => (
  <span className="inline-flex items-center text-[11px] font-semibold rounded-full px-2 py-0.5 bg-gradient-to-r from-optio-purple to-optio-pink text-white">
    Primary
  </span>
)

export default RolePill
