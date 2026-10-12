import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useConfirm } from '../../contexts/ConfirmContext'
import SignInTroubleList from '../common/SignInTroubleList'
import { timeAgo } from '../../utils/timeFormat'

/**
 * People who cannot sign in, for SuperadminHome -- every school, plus emails
 * that match no account (a family retyping a misspelled address).
 *
 * The one action is the one that ends the problem: reset the password. The
 * admin route sets the temporary password, confirms the email (an unconfirmed
 * invite is the other common reason a correct password fails) and clears the
 * lockout, so the person can sign in the moment they are told the password.
 * The row then drops off, because the next successful sign-in zeroes the count.
 */
export default function SignInTroubleCard() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [resetting, setResetting] = useState(null)
  const query = useQuery({
    queryKey: ['home', 'superadmin', 'sign-in-trouble'],
    queryFn: async () => (await api.get('/api/admin/platform-metrics/sign-in-trouble')).data,
    staleTime: 60_000,
    retry: false,
  })

  if (query.isError) return null
  const people = query.data?.people || []

  const reset = async (person) => {
    if (!(await confirm(`Reset ${person.name || person.email}'s password? You will see the new password once.`))) return
    setResetting(person.user_id)
    try {
      const res = await api.post(`/api/admin/users/${person.user_id}/reset-password`, {})
      const pw = res.data?.new_password
      toast.success(pw ? `New password for ${person.email}: ${pw}` : 'Password reset', { duration: 15000 })
      queryClient.invalidateQueries({ queryKey: ['home', 'superadmin', 'sign-in-trouble'] })
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not reset the password')
    } finally {
      setResetting(null)
    }
  }

  return (
    // The card takes the height of its row (the Learning activity chart beside
    // it) and the list scrolls inside: the list sits in an absolutely
    // positioned box, so it adds nothing to the row's height however many
    // people are stuck.
    <section aria-label="People who cannot sign in" className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col min-h-[16rem]">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">People who cannot sign in</h3>
        {/* Reads login_attempts live on every request (no server cache), so
            this is the same data a page reload gets, without reloading the
            other cards. The query also refetches when the tab regains focus. */}
        <button
          type="button"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className="text-xs text-gray-500 hover:text-optio-purple disabled:opacity-50 whitespace-nowrap"
        >
          {query.isFetching ? 'Refreshing…' : `Updated ${timeAgo(query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toISOString() : null).toLowerCase()} · Refresh`}
        </button>
      </div>
      {query.isLoading ? (
        <div className="animate-pulse mt-2 h-8 w-24 bg-gray-100 rounded" />
      ) : (
        <>
          <p className="text-3xl font-bold text-gray-900 mt-1 tabular-nums">{people.length}</p>
          <p className="text-xs text-gray-500 mt-1">
            failed two or more times in the last {query.data?.window_days || 7} days and have not signed in since
          </p>
          <div className="relative flex-1 mt-3">
            <div className="absolute inset-0 overflow-y-auto pr-1">
              <SignInTroubleList
                people={people}
                showSchool
                max={people.length}
                renderName={p => (p.user_id ? (
                  <Link to={`/admin/users?search=${encodeURIComponent(p.email)}`} className="hover:text-optio-purple">
                    {p.name || p.email}
                  </Link>
                ) : p.email)}
                renderAction={p => p.user_id && (
                  <button
                    type="button"
                    onClick={() => reset(p)}
                    disabled={resetting === p.user_id}
                    className="px-2.5 py-1 text-xs rounded-md border border-gray-200 text-optio-purple hover:border-optio-purple/60 disabled:opacity-50"
                  >
                    {resetting === p.user_id ? 'Resetting…' : 'Reset password'}
                  </button>
                )}
              />
            </div>
          </div>
        </>
      )}
    </section>
  )
}
