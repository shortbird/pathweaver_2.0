import React, { useState, useEffect, useCallback, useRef } from 'react'
import { MegaphoneIcon, MagnifyingGlassIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import api from '../services/api'

const PAGE_SIZE = 20

/**
 * AnnouncementsArchivePage - the communications archive at /announcements.
 *
 * Every member of an org (students, parents, advisors, org admins) can re-read
 * past announcements their school sent them: searchable, newest first, with
 * expandable full bodies and a "Load more" pager.
 * Backed by GET /api/announcements/archive?limit=&offset=&q=.
 */
export default function AnnouncementsArchivePage() {
  const [announcements, setAnnouncements] = useState([])
  const [orgName, setOrgName] = useState(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(() => new Set())
  const debounceRef = useRef(null)

  const fetchPage = useCallback(async (offset, q, append) => {
    try {
      if (append) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      const { data } = await api.get('/api/announcements/archive', {
        params: { limit: PAGE_SIZE, offset, ...(q ? { q } : {}) },
      })
      if (data.success) {
        setAnnouncements((prev) => (append ? [...prev, ...(data.announcements || [])] : (data.announcements || [])))
        setTotal(data.total || 0)
        if (data.organization_name) setOrgName(data.organization_name)
      } else {
        setError(data.error || 'Failed to load announcements')
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load announcements')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  // Initial load + reload on (debounced) search
  useEffect(() => {
    fetchPage(0, query, false)
  }, [query, fetchPage])

  const onSearchChange = (value) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setQuery(value.trim()), 300)
  }

  const toggleExpanded = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const formatDate = (iso) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    } catch {
      return ''
    }
  }

  const hasMore = announcements.length < total

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center">
          <MegaphoneIcon className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
          {orgName && <p className="text-sm text-gray-500">From {orgName}</p>}
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Every announcement your school has sent, newest first.
      </p>

      {/* Search */}
      <div className="relative mb-6">
        <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search announcements…"
          aria-label="Search announcements"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 font-medium">
            {query ? 'No announcements match your search.' : 'No announcements yet.'}
          </p>
          {!query && (
            <p className="text-sm text-gray-400 mt-1">
              When your school sends an announcement, it will appear here.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((a) => {
            const isExpanded = expanded.has(a.id)
            const body = a.content || a.message || ''
            const isLong = body.length > 280
            return (
              <article key={a.id} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold text-gray-900">{a.title}</h2>
                  <time className="text-xs text-gray-400 whitespace-nowrap mt-1">
                    {formatDate(a.created_at)}
                  </time>
                </div>
                {orgName && <p className="text-xs text-gray-400 mt-0.5">{orgName}</p>}
                <p
                  className={`text-sm text-gray-700 mt-3 whitespace-pre-wrap leading-relaxed ${
                    !isExpanded && isLong ? 'line-clamp-4' : ''
                  }`}
                >
                  {body}
                </p>
                {isLong && (
                  <button
                    onClick={() => toggleExpanded(a.id)}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-optio-purple hover:underline"
                  >
                    {isExpanded ? 'Show less' : 'Read more'}
                    <ChevronDownIcon
                      className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                )}
              </article>
            )
          })}

          {hasMore && (
            <div className="text-center pt-2">
              <button
                onClick={() => fetchPage(announcements.length, query, true)}
                disabled={loadingMore}
                className="px-6 py-2.5 text-sm font-medium text-white rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
