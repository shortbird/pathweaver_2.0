import React from 'react'
import { timeAgo } from '../../utils/timeFormat'

/**
 * "People who cannot sign in": everyone whose last two or more sign-ins
 * failed in the past week and who has not signed in since (a success zeroes
 * the count). From services/activity_metrics_service.sign_in_trouble.
 *
 * It replaced a success/failure bar chart on the superadmin home that said
 * 30% of sign-ins failed and named nobody. The failures had no user attached,
 * so the chart could only ever be a rate; login_attempts is keyed by email,
 * so this can be a list of people to help.
 *
 * Shared by the superadmin home (every school, plus emails with no account)
 * and the SIS School Dashboard (that school's people only). Each caller
 * supplies the row's door and action, because what a superadmin and a school
 * office can do about it differ.
 */
const ROLE_LABEL = {
  student: 'Student', parent: 'Parent', advisor: 'Teacher', org_admin: 'Admin',
  campus_coordinator: 'Coordinator', observer: 'Observer',
}

export function describeTrouble(person) {
  if (person.locked) return 'Locked out now'
  if (person.was_locked) return `${person.failures} failed tries, was locked out`
  return `${person.failures} failed tries`
}

export default function SignInTroubleList({ people, showSchool = false, renderName, renderAction, max = 8 }) {
  const list = Array.isArray(people) ? people : []
  if (list.length === 0) {
    return <p className="text-sm text-gray-500">Nobody is stuck at sign-in this week.</p>
  }
  const shown = list.slice(0, max)
  return (
    <>
      <ul className="divide-y divide-gray-100">
        {shown.map(p => (
          <li key={p.email} className="py-2 flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-gray-900 truncate">
                {renderName ? renderName(p) : (p.name || p.email)}
              </span>
              <span className="block text-xs text-gray-500 truncate">
                {[
                  p.has_account === false ? 'No account with this email' : ROLE_LABEL[p.role] || null,
                  showSchool ? (p.organization_name || (p.has_account ? 'No organization' : null)) : null,
                  p.name ? p.email : null,
                ].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="text-right shrink-0">
              <span className={`block text-xs font-medium ${p.locked ? 'text-red-700' : 'text-gray-700'}`}>
                {describeTrouble(p)}
              </span>
              <span className="block text-[11px] text-gray-400">{timeAgo(p.last_attempt)}</span>
            </span>
            {renderAction && <span className="shrink-0">{renderAction(p)}</span>}
          </li>
        ))}
      </ul>
      {list.length > shown.length && (
        <p className="text-xs text-gray-500 mt-2">And {list.length - shown.length} more.</p>
      )}
    </>
  )
}
