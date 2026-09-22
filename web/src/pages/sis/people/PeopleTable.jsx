import React from 'react'
import StudentRow from '../../../components/sis/StudentRow'
import { RolePill } from '../../../components/ui/RolePill'
import { PaymentMethodPills } from '../PaymentMethodPills'
import { rolesOf, statusOf, isRecent } from './peopleFilters'
import StatusPill from '../../../components/sis/ui/StatusPill'
import SortHeader from '../../../components/ui/SortHeader'

const fmtDate = (d) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return '—' }
}

const daysSince = (d) => {
  if (!d) return null
  const ms = Date.now() - new Date(d).getTime()
  if (Number.isNaN(ms)) return null
  return Math.max(0, Math.floor(ms / 86400000))
}

// How long an invite has been sitting unaccepted, in words.
const waitingFor = (d) => {
  const days = daysSince(d)
  if (days === null) return null
  if (days === 0) return 'invited today'
  if (days === 1) return 'invited yesterday'
  return `invited ${days} days ago`
}

const PersonStatus = ({ status }) => <StatusPill domain="person" status={status} />

/**
 * The one People table. Every row is a person and shows every role they
 * hold; what used to be a tab's worth of context (a teacher's invite, a
 * family's payment answer) is a pill on the row.
 */
// The card scrolls rather than spills. It was overflow-visible only because
// the row's per-person menu opened an absolute panel inside it; that menu is
// gone and its column with it, so the card can behave like every other table
// card in the console (2026-09-22).
const PeopleTable = ({
  rows, sort, onSort, onOpen, onOpenFamily, onResendInvite, resendingId,
}) => (
  <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
    <table className="w-full text-sm">
      <thead className="bg-neutral-50 text-neutral-500 text-left">
        <tr>
          <th className="px-4 py-3 font-medium">
            <button onClick={() => onSort('name')}
              className={`inline-flex items-center hover:text-neutral-800 ${sort.key === 'name' ? 'text-neutral-800' : ''}`}>
              Name{sort.key === 'name' ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
            </button>
            <button onClick={() => onSort('last')}
              className={`ml-3 inline-flex items-center text-xs hover:text-neutral-800 ${sort.key === 'last' ? 'text-neutral-800' : 'text-neutral-400'}`}>
              Last name{sort.key === 'last' ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
            </button>
          </th>
          <SortHeader label="Age" col="age" sort={sort} onSort={onSort} />
          <SortHeader label="Roles" col="role" sort={sort} onSort={onSort} />
          <SortHeader label="Family" col="family" sort={sort} onSort={onSort} />
          <SortHeader label="Joined" col="joined_at" sort={sort} onSort={onSort} />
          <SortHeader label="Last active" col="last_active" sort={sort} onSort={onSort} />
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((s) => {
          const status = statusOf(s)
          return (
            <tr key={s.student_id} onClick={() => onOpen(s)} className="hover:bg-neutral-50 cursor-pointer">
              <td className="px-4 py-3">
                <StudentRow person={s} withAge={false} />
              </td>
              <td className="px-4 py-3 text-neutral-600">{s.age != null ? s.age : <span className="text-neutral-300">—</span>}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1 flex-wrap">
                  {rolesOf(s).map((r) => <RolePill key={r} role={r} />)}
                  <PersonStatus status={status} />
                  {status === 'invite_pending' && (
                    <span className="text-xs text-neutral-500">{waitingFor(s.joined_at)}</span>
                  )}
                  {status === 'invite_pending' && onResendInvite && (
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); onResendInvite(s) }}
                      disabled={resendingId === s.student_id}
                      className="text-xs font-medium text-optio-purple hover:underline disabled:opacity-50">
                      {resendingId === s.student_id ? 'Sending…' : 'Resend invite'}
                    </button>
                  )}
                </span>
                {s.class_count > 0 && (
                  <div className="text-xs text-neutral-400 mt-0.5">
                    {s.class_count} class{s.class_count === 1 ? '' : 'es'}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                {s.household_name ? (
                  // Capped. Auto table layout gives every column its widest
                  // unbreakable cell, and this one holds a household name plus
                  // free-text payment answers, so at iCreate the table grew
                  // wider than the card it sits in and spilled out over the
                  // page (2026-09-22).
                  <div className="min-w-0 max-w-[20rem]">
                    <span className="inline-flex items-center gap-1.5 flex-wrap max-w-full">
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); onOpenFamily(s) }}
                        className="text-neutral-600 hover:text-optio-purple hover:underline text-left max-w-[13rem] truncate"
                        title={`Open ${s.household_name}`}>
                        {s.household_name}
                      </button>
                      {s.household_former && (
                        <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-gray-100 text-neutral-500"
                          title="Every student in this family has withdrawn or graduated">Former</span>
                      )}
                      {s.registration_hold && (
                        <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-red-100 text-red-700"
                          title={s.registration_hold_reason || 'Registration on hold'}>Hold</span>
                      )}
                    </span>
                    <div className="mt-0.5">
                      <PaymentMethodPills methods={s.stated_payment_methods} ufaPrivate={s.stated_ufa_private} plan={s.payment_plan} />
                    </div>
                  </div>
                ) : (
                  <span className="text-neutral-300" title={s.is_student ? 'Open Manage to put this student in a family' : undefined}>—</span>
                )}
              </td>
              <td className="px-4 py-3 text-neutral-500 whitespace-nowrap">
                {fmtDate(s.joined_at)}
                {isRecent(s.joined_at) && (
                  <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-optio-purple/10 text-optio-purple align-middle">new</span>
                )}
              </td>
              <td className="px-4 py-3 text-neutral-500">{fmtDate(s.last_active)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  </div>
)

export default PeopleTable
