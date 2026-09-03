import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { listLeads, listFunnels } from './crmApi'
import { PageLoader } from '../../../components/ui'
import EmptyState from '../../../components/ui/EmptyState'
import {
  CONTACT_TYPES,
  CONTACT_TYPE_LABELS,
  LEAD_STATUSES,
  LEAD_STATUS_BADGES,
  SOURCE_CHIP_CLASS,
  formatDate,
} from './crmConstants'

const LEADS_PER_PAGE = 25

const leadName = (lead) =>
  [lead.first_name, lead.last_name].filter(Boolean).join(' ')

/** Pull funnel/step position out of whichever shape the API returns. */
const funnelPosition = (lead) => {
  const membership = lead.membership || {}
  return {
    name: lead.funnel_name || membership.funnel_name || lead.funnel?.name || null,
    step: lead.step_order ?? membership.step_order ?? membership.last_step_sent ?? null,
    total: lead.total_steps ?? membership.total_steps ?? lead.funnel?.step_count ?? null,
  }
}

/**
 * Leads list - clones the AdminUsers pattern: 500ms debounced search, filter
 * selects, server pagination, filters mirrored into the query string so the
 * overview's click-throughs deep-link here.
 */
const LeadsList = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const paramsKey = searchParams.toString()

  const [leads, setLeads] = useState([])
  const [total, setTotal] = useState(0)
  const [funnels, setFunnels] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '')

  const page = parseInt(searchParams.get('page') || '1', 10) || 1
  const totalPages = Math.max(1, Math.ceil(total / LEADS_PER_PAGE))

  const updateParams = (changes) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      Object.entries(changes).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '' || value === 'all') {
          next.delete(key)
        } else {
          next.set(key, value)
        }
      })
      return next
    })
  }

  // Debounce the search box into the query string
  useEffect(() => {
    const timer = setTimeout(() => {
      const current = searchParams.get('search') || ''
      if (searchTerm !== current) {
        updateParams({ search: searchTerm, page: null })
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [searchTerm]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchLeads()
  }, [paramsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchFunnels()
  }, [])

  const fetchFunnels = async () => {
    try {
      const response = await listFunnels()
      setFunnels(response.data?.funnels || response.data || [])
    } catch (error) {
      // Non-fatal: the funnel filter select just stays empty
    }
  }

  const fetchLeads = async () => {
    try {
      const params = Object.fromEntries(searchParams.entries())
      const response = await listLeads({ ...params, page: params.page || 1, limit: LEADS_PER_PAGE })
      setLeads(response.data?.leads || [])
      setTotal(response.data?.total || 0)
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load leads')
      setLeads([])
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <PageLoader label="Loading leads" />
  }

  const selectClass =
    'px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-optio-purple text-sm'

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold">Leads</h2>
        <p className="text-sm text-gray-500">{total} total</p>
      </div>

      {/* Search + filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 sm:p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="Search by email or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="sm:col-span-2 w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-optio-purple text-base"
            aria-label="Search leads by email or name"
          />
          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            <select
              value={searchParams.get('funnel_id') || 'all'}
              onChange={(e) => updateParams({ funnel_id: e.target.value, step_id: null, page: null })}
              className={selectClass}
              aria-label="Filter by funnel"
            >
              <option value="all">All funnels</option>
              {funnels.map((funnel) => (
                <option key={funnel.id} value={funnel.id}>
                  {funnel.name}
                </option>
              ))}
            </select>
            <select
              value={searchParams.get('status') || 'all'}
              onChange={(e) => updateParams({ status: e.target.value, page: null })}
              className={selectClass}
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
            <select
              value={searchParams.get('source') || 'all'}
              onChange={(e) => updateParams({ source: e.target.value, page: null })}
              className={selectClass}
              aria-label="Filter by source"
            >
              <option value="all">All sources</option>
              {CONTACT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {CONTACT_TYPE_LABELS[type] || type}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {leads.length === 0 ? (
        <EmptyState title="No leads found" hint="Adjust the search or filters." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Lead
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Funnel / Step
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Status
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Source
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Entered
                  </th>
                  <th className="px-3 pr-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Last activity
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leads.map((lead) => {
                  const position = funnelPosition(lead)
                  const pct =
                    position.step && position.total
                      ? Math.min(100, Math.round((position.step / position.total) * 100))
                      : 0
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => navigate(`/admin/crm/leads/${lead.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          navigate(`/admin/crm/leads/${lead.id}`)
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`View lead ${lead.email}`}
                      className="cursor-pointer hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-optio-purple"
                    >
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900 truncate max-w-[16rem]" title={lead.email}>
                          {lead.email}
                        </div>
                        {leadName(lead) && (
                          <div className="text-sm text-gray-500 truncate max-w-[16rem]">
                            {leadName(lead)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {position.name ? (
                          <div>
                            <div className="text-sm text-gray-900">
                              {position.name}
                              {position.step != null && position.total != null && (
                                <span className="text-gray-500">
                                  {' '}· step {position.step}/{position.total}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 h-1.5 w-28 rounded-full bg-gray-100">
                              <div
                                className="h-1.5 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            LEAD_STATUS_BADGES[lead.status] || 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {lead.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {lead.lead_type || lead.lead_source ? (
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${SOURCE_CHIP_CLASS}`}>
                            {CONTACT_TYPE_LABELS[lead.lead_type] || lead.lead_type || lead.lead_source}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-500 whitespace-nowrap">
                        {formatDate(lead.entered_at || lead.created_at)}
                      </td>
                      <td className="px-3 pr-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                        {formatDate(lead.last_activity_at || lead.updated_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200">
              <button
                onClick={() => updateParams({ page: String(Math.max(1, page - 1)) })}
                disabled={page <= 1}
                className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-700">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => updateParams({ page: String(Math.min(totalPages, page + 1)) })}
                disabled={page >= totalPages}
                className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default LeadsList
