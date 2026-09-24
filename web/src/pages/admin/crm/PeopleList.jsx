import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { searchPeople, listLeads, listRecentPersonNotes } from './crmApi'
import { PageLoader } from '../../../components/ui'
import EmptyState from '../../../components/ui/EmptyState'
import { personName } from './PersonFile'
import AddPersonModal from './AddPersonModal'
import { CONTACT_TYPE_LABELS, formatDateTime } from './crmConstants'

/**
 * People: find any Optio user and open their file to read or add notes.
 * Search also finds CRM leads with no Optio account, and "Add person" creates
 * one. With no search, shows the newest notes across everyone. The search
 * term lives in the query string so the back link from a file returns here.
 */
const PeopleList = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') || ''
  const [term, setTerm] = useState(search)
  const [people, setPeople] = useState([])
  const [leads, setLeads] = useState([])
  const [adding, setAdding] = useState(false)
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)

  // 500ms debounce, same as the leads list.
  useEffect(() => {
    const t = setTimeout(() => {
      if (term.trim() !== search) {
        setSearchParams(term.trim() ? { q: term.trim() } : {}, { replace: true })
      }
    }, 500)
    return () => clearTimeout(t)
  }, [term, search, setSearchParams])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        if (search) {
          const [users, leadRows] = await Promise.all([
            searchPeople(search),
            listLeads({ search, limit: 20 }),
          ])
          if (cancelled) return
          const found = users.data.users || []
          // A lead who has since signed up is already in the list as a user.
          const emails = new Set(found.map((u) => (u.email || '').toLowerCase()))
          setPeople(found)
          setLeads((leadRows.data.leads || []).filter((l) => !emails.has((l.email || '').toLowerCase())))
        } else {
          const response = await listRecentPersonNotes()
          if (!cancelled) setRecent(response.data.notes || [])
        }
      } catch (error) {
        if (!cancelled) toast.error(error.response?.data?.error || 'Failed to load people')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [search])

  return (
    <div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6 flex flex-col sm:flex-row gap-3">
        <label htmlFor="people-search" className="sr-only">
          Search people
        </label>
        <input
          id="people-search"
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search anyone by name or email..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple min-h-[44px]"
        />
        <button
          onClick={() => setAdding(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink hover:shadow-lg transition-all min-h-[44px] whitespace-nowrap"
        >
          Add person
        </button>
      </div>

      {loading ? (
        <PageLoader label="Loading" />
      ) : search ? (
        people.length === 0 && leads.length === 0 ? (
          <EmptyState
            title="No one found"
            hint="Try a different name or email, or add them."
            action={
              <button onClick={() => setAdding(true)} className="text-sm font-medium text-optio-purple hover:underline">
                Add {search}
              </button>
            }
          />
        ) : (
          <ul className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
            {people.map((person) => (
              <li key={person.id}>
                <Link
                  to={`/admin/crm/people/${person.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 hover:bg-gray-50 min-h-[44px]"
                >
                  <span>
                    <span className="block text-sm font-medium text-gray-900">{personName(person)}</span>
                    <span className="block text-sm text-gray-500 break-all">{person.email}</span>
                  </span>
                  <span className="text-xs text-gray-500">
                    {[person.org_role || person.role, person.organization_name].filter(Boolean).join(' · ')}
                  </span>
                </Link>
              </li>
            ))}
            {leads.map((lead) => (
              <li key={`lead-${lead.id}`}>
                <Link
                  to={`/admin/crm/leads/${lead.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 hover:bg-gray-50 min-h-[44px]"
                >
                  <span>
                    <span className="block text-sm font-medium text-gray-900">{personName(lead)}</span>
                    <span className="block text-sm text-gray-500 break-all">{lead.email}</span>
                  </span>
                  <span className="text-xs text-gray-500">
                    No account · {CONTACT_TYPE_LABELS[lead.lead_source] || 'Lead'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-3">Recent notes</h3>
          {recent.length === 0 ? (
            <EmptyState plain title="No notes yet" hint="Search for a person to add the first one." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {recent.map((note) => (
                <li key={note.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      to={`/admin/crm/people/${note.user_id}`}
                      className="text-sm font-medium text-optio-purple hover:underline"
                    >
                      {personName(note.person)}
                    </Link>
                    <span className="text-xs text-gray-400">
                      {note.author_name ? `${note.author_name} · ` : ''}
                      {formatDateTime(note.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-700 line-clamp-2 whitespace-pre-line">{note.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <AddPersonModal isOpen={adding} onClose={() => setAdding(false)} initialQuery={term} />
    </div>
  )
}

export default PeopleList
