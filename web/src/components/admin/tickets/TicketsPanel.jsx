import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import GlassTabBar from '../../ui/GlassTabBar'
import { Spinner } from '../../ui/Spinner'
import EmptyState from '../../ui/EmptyState'
import { useAdminTickets, useAdminTicketSummary, TICKET_TYPES } from '../../../hooks/api/useAdminTickets'
import TicketDetail from './TicketDetail'
import {
  STATUS_LABELS, STATUS_CLASSES, TYPE_LABELS, formatDay, formatClock, reporterName,
} from './ticketLabels'

/**
 * The ticket tracker: /admin/tickets.
 *
 * Every Optio platform report in one list -- what the mobile app's shake sheet
 * sends, what school staff file through the web reporter, and the tickets
 * brought over when Perch was retired on 2026-09-14. Superadmin only; the
 * backend gates every read and write, this is the chrome.
 *
 * A ticket has a status, a type and a priority, and when it is done somebody
 * writes what was done in `resolution` and how to see it in `verification`,
 * both for the reporter. Claude Code works the same rows over the Supabase MCP
 * (.claude/skills/tickets). A code fix goes to "Fixed, not live" with its
 * commit; the release pipeline resolves it once production serves that
 * commit, and the reporter gets one email then. Nothing here sends mail.
 */
const TABS = [
  { id: 'open', label: 'Open' },
  { id: 'new', label: 'New' },
  { id: 'fixing', label: 'In progress' },
  { id: 'fixed', label: 'Fixed, not live' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'wont_fix', label: 'Declined' },
  { id: 'all', label: 'All' },
]

const PAGE_SIZE = 50

export default function TicketsPanel() {
  const navigate = useNavigate()
  const { ticketId } = useParams()

  const [tab, setTab] = useState('open')
  const [type, setType] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  // Type the search, wait a beat, then ask. The list is small enough that a
  // keystroke-per-request would still work; it would just be rude.
  useEffect(() => {
    const t = setTimeout(() => { setQuery(search.trim()); setPage(0) }, 300)
    return () => clearTimeout(t)
  }, [search])

  const filters = {
    status: tab === 'all' ? '' : tab,
    type,
    q: query,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }
  const { data, isLoading, isError, error, isFetching } = useAdminTickets(filters)
  const { data: counts } = useAdminTicketSummary()

  const tickets = data?.reports || []
  const total = data?.total || 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const selectTab = (id) => { setTab(id); setPage(0) }
  const open = (id) => navigate(`/admin/tickets/${id}`)
  const close = () => navigate('/admin/tickets')

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Tickets</h2>
          <p className="text-sm text-gray-500 mt-1">
            Bug reports, feature requests and questions from every Optio surface.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or description"
            aria-label="Search tickets"
            className="input-field px-3 py-2 text-sm w-64"
          />
          <select
            value={type}
            onChange={(e) => { setType(e.target.value); setPage(0) }}
            aria-label="Filter by type"
            className="input-field px-3 py-2 text-sm"
          >
            <option value="">All types</option>
            {TICKET_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-6 overflow-x-auto">
        <GlassTabBar
          aria-label="Ticket status"
          tabs={TABS.map((t) => ({ id: t.id, label: t.label, badge: counts?.[t.id] }))}
          active={tab}
          onSelect={selectTab}
        />
      </div>

      {isLoading && (
        <div className="flex justify-center py-12"><Spinner size="md" /></div>
      )}
      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4" role="alert">
          {error?.response?.data?.error || 'Could not load tickets.'}
        </div>
      )}
      {!isLoading && !isError && tickets.length === 0 && (
        <EmptyState
          title="No tickets here"
          hint={query || type ? 'Try a different search or type.' : 'Nothing in this status.'}
        />
      )}

      {tickets.length > 0 && (
        <div className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden ${isFetching ? 'opacity-70' : ''}`}>
          {/* table-fixed with percentage columns: the row always fits the
              container and long titles, emails and routes truncate inside
              their cell instead of pushing the table wider than the page. */}
          <table className="w-full table-fixed text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 w-[44%]">Ticket</th>
                <th className="px-3 py-3 w-[10%] hidden md:table-cell">Type</th>
                <th className="px-3 py-3 w-[12%]">Status</th>
                <th className="px-3 py-3 w-[22%] hidden sm:table-cell">From</th>
                <th className="px-3 py-3 w-[12%]">Filed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tickets.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => open(t.id)}
                  className="hover:bg-optio-purple/5 cursor-pointer align-top"
                >
                  <td className="px-4 py-3 overflow-hidden">
                    <div className="font-medium text-gray-900 truncate" title={t.title}>{t.title}</div>
                    {t.current_route && (
                      <div className="text-xs text-gray-400 truncate" title={t.current_route}>{t.current_route}</div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-gray-700 hidden md:table-cell">{TYPE_LABELS[t.type] || t.type}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${STATUS_CLASSES[t.status] || ''}`}>
                      {STATUS_LABELS[t.status] || t.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-600 overflow-hidden hidden sm:table-cell">
                    <div className="truncate text-gray-900" title={t.user_email || ''}>{reporterName(t)}</div>
                    <div className="text-xs text-gray-400 truncate">{t.organizations?.name || 'No org'}</div>
                  </td>
                  <td className="px-3 py-3 text-gray-500">
                    <div>{formatDay(t.created_at)}</div>
                    <div className="text-xs text-gray-400">{formatClock(t.created_at)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
            <span>{total} ticket{total === 1 ? '' : 's'}</span>
            {pages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-quiet px-3 py-1"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </button>
                <span>Page {page + 1} of {pages}</span>
                <button
                  type="button"
                  className="btn-quiet px-3 py-1"
                  disabled={page + 1 >= pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {ticketId && <TicketDetail ticketId={ticketId} onClose={close} />}
    </div>
  )
}
